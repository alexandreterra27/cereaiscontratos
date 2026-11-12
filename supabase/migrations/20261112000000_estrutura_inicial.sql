-- =====================================================================
--  Sistema de Vinculações de Contratos – Grupo Parceiro Agronegócios
--  Estrutura inicial do banco (Supabase / PostgreSQL)
--
--  Como usar: Supabase > SQL Editor > New query > cole este arquivo > Run.
--  Pode ser executado mais de uma vez sem duplicar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Parâmetros por produto (kg por saca e % de crédito presumido)
-- ---------------------------------------------------------------------
create table if not exists public.parametros_produto (
  produto            text primary key
                     check (produto in ('milho', 'soja', 'sorgo')),
  kg_saca            numeric(10,3) not null default 60    check (kg_saca > 0),
  credito_presumido  numeric(8,6)  not null default 0.024 check (credito_presumido >= 0),  -- 0.024 = 2,4%
  updated_at         timestamptz   not null default now()
);

comment on table  public.parametros_produto is 'Parâmetros de cálculo por produto.';
comment on column public.parametros_produto.credito_presumido is 'Fração: 0.024 = 2,4%.';

insert into public.parametros_produto (produto, kg_saca, credito_presumido) values
  ('milho', 60, 0.024),
  ('soja',  60, 0.024),
  ('sorgo', 60, 0.024)
on conflict (produto) do nothing;

-- ---------------------------------------------------------------------
-- 2. Contratos de venda (lado COMPRADOR)
-- ---------------------------------------------------------------------
create table if not exists public.contratos (
  id              uuid primary key default gen_random_uuid(),
  produto         text not null references public.parametros_produto (produto),
  data            date,
  numero          text not null default '',
  comprador       text not null check (length(trim(comprador)) > 0),
  cidade_entrega  text not null default '',
  volume_kg       numeric(14,3) not null check (volume_kg > 0),
  preco           numeric(12,4),                      -- R$/sc · NULL = A FIXAR
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by      uuid default auth.uid() references auth.users (id) on delete set null
);

comment on table  public.contratos is 'Contrato de venda ao comprador (trading/indústria).';
comment on column public.contratos.preco is 'Preço de venda em R$/saca. NULL = A FIXAR.';

create index if not exists contratos_produto_idx on public.contratos (produto);
create index if not exists contratos_data_idx    on public.contratos (data desc);
create index if not exists contratos_created_by_idx on public.contratos (created_by);
create index if not exists contratos_updated_by_idx on public.contratos (updated_by);

-- ---------------------------------------------------------------------
-- 3. Vendedores vinculados a cada contrato (lado PRODUTOR / originação)
-- ---------------------------------------------------------------------
create table if not exists public.contrato_vendedores (
  id               uuid primary key default gen_random_uuid(),
  contrato_id      uuid not null references public.contratos (id) on delete cascade,
  ordem            integer not null default 0,
  data             date,
  numero           text not null default '',
  nome             text not null check (length(trim(nome)) > 0),
  cidade_retirada  text not null default '',
  volume_kg        numeric(14,3) not null check (volume_kg > 0),
  preco            numeric(12,4),                     -- R$/sc · NULL = A FIXAR
  frete_previsto   numeric(12,4),                     -- R$/sc
  frete_realizado  numeric(12,4),                     -- R$/sc · NULL = ainda não lançado
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid() references auth.users (id) on delete set null
);

comment on table public.contrato_vendedores is 'Contratos de compra dos produtores vinculados a um contrato de venda.';

create index if not exists contrato_vendedores_contrato_idx on public.contrato_vendedores (contrato_id, ordem);
create index if not exists contrato_vendedores_nome_idx     on public.contrato_vendedores (nome);
create index if not exists contrato_vendedores_updated_by_idx on public.contrato_vendedores (updated_by);

-- ---------------------------------------------------------------------
-- 4. updated_at / updated_by automáticos
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_table_name <> 'parametros_produto' then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists set_updated on public.contratos;
create trigger set_updated before update on public.contratos
  for each row execute function public.tg_set_updated();

drop trigger if exists set_updated on public.contrato_vendedores;
create trigger set_updated before update on public.contrato_vendedores
  for each row execute function public.tg_set_updated();

drop trigger if exists set_updated on public.parametros_produto;
create trigger set_updated before update on public.parametros_produto
  for each row execute function public.tg_set_updated();

-- ---------------------------------------------------------------------
-- 5. Segurança (RLS): só usuários logados leem e gravam.
--    Visitantes anônimos não veem nada.
-- ---------------------------------------------------------------------
alter table public.parametros_produto  enable row level security;
alter table public.contratos           enable row level security;
alter table public.contrato_vendedores enable row level security;

drop policy if exists "logados_tudo" on public.parametros_produto;
create policy "logados_tudo" on public.parametros_produto
  for all to authenticated using (true) with check (true);

drop policy if exists "logados_tudo" on public.contratos;
create policy "logados_tudo" on public.contratos
  for all to authenticated using (true) with check (true);

drop policy if exists "logados_tudo" on public.contrato_vendedores;
create policy "logados_tudo" on public.contrato_vendedores
  for all to authenticated using (true) with check (true);

revoke all on public.parametros_produto, public.contratos, public.contrato_vendedores from anon;
grant select, insert, update, delete on public.parametros_produto, public.contratos, public.contrato_vendedores to authenticated;

-- ---------------------------------------------------------------------
-- 6. Função para salvar contrato + vendedores numa única operação
--    (se der erro em qualquer parte, nada é gravado).
--
--    p_contrato:   {id?, produto, data, numero, comprador, cidade_entrega, volume_kg, preco}
--    p_vendedores: [{id?, data, numero, nome, cidade_retirada, volume_kg,
--                    preco, frete_previsto, frete_realizado}, ...]
--    Vendedores que existiam e não vieram na lista são excluídos.
-- ---------------------------------------------------------------------
create or replace function public.salvar_contrato(p_contrato jsonb, p_vendedores jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id   uuid := nullif(p_contrato ->> 'id', '')::uuid;
  v_keep uuid[];
begin
  if jsonb_typeof(p_vendedores) is distinct from 'array' or jsonb_array_length(p_vendedores) = 0 then
    raise exception 'Informe pelo menos um vendedor.';
  end if;

  if v_id is null then
    insert into contratos (produto, data, numero, comprador, cidade_entrega, volume_kg, preco)
    values (
      p_contrato ->> 'produto',
      nullif(p_contrato ->> 'data', '')::date,
      coalesce(p_contrato ->> 'numero', ''),
      upper(trim(p_contrato ->> 'comprador')),
      upper(coalesce(p_contrato ->> 'cidade_entrega', '')),
      (p_contrato ->> 'volume_kg')::numeric,
      nullif(p_contrato ->> 'preco', '')::numeric
    )
    returning id into v_id;
  else
    update contratos set
      produto        = p_contrato ->> 'produto',
      data           = nullif(p_contrato ->> 'data', '')::date,
      numero         = coalesce(p_contrato ->> 'numero', ''),
      comprador      = upper(trim(p_contrato ->> 'comprador')),
      cidade_entrega = upper(coalesce(p_contrato ->> 'cidade_entrega', '')),
      volume_kg      = (p_contrato ->> 'volume_kg')::numeric,
      preco          = nullif(p_contrato ->> 'preco', '')::numeric
    where id = v_id;
    if not found then
      raise exception 'Contrato % não encontrado.', v_id;
    end if;
  end if;

  -- vendedores que continuam (têm id)
  select coalesce(array_agg((e ->> 'id')::uuid), '{}')
    into v_keep
    from jsonb_array_elements(p_vendedores) e
   where nullif(e ->> 'id', '') is not null;

  delete from contrato_vendedores
   where contrato_id = v_id
     and not (id = any (v_keep));

  insert into contrato_vendedores
    (id, contrato_id, ordem, data, numero, nome, cidade_retirada, volume_kg, preco, frete_previsto, frete_realizado)
  select
    coalesce(nullif(e ->> 'id', '')::uuid, gen_random_uuid()),
    v_id,
    (t.ord - 1)::int,
    nullif(e ->> 'data', '')::date,
    coalesce(e ->> 'numero', ''),
    upper(trim(e ->> 'nome')),
    upper(coalesce(e ->> 'cidade_retirada', '')),
    (e ->> 'volume_kg')::numeric,
    nullif(e ->> 'preco', '')::numeric,
    nullif(e ->> 'frete_previsto', '')::numeric,
    nullif(e ->> 'frete_realizado', '')::numeric
  from jsonb_array_elements(p_vendedores) with ordinality as t(e, ord)
  on conflict (id) do update set
    ordem           = excluded.ordem,
    data            = excluded.data,
    numero          = excluded.numero,
    nome            = excluded.nome,
    cidade_retirada = excluded.cidade_retirada,
    volume_kg       = excluded.volume_kg,
    preco           = excluded.preco,
    frete_previsto  = excluded.frete_previsto,
    frete_realizado = excluded.frete_realizado
  where contrato_vendedores.contrato_id = excluded.contrato_id;

  return v_id;
end;
$$;

revoke all on function public.salvar_contrato(jsonb, jsonb) from public, anon;
grant execute on function public.salvar_contrato(jsonb, jsonb) to authenticated;
revoke all on function public.tg_set_updated() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. View de relatório: uma linha por vendedor com todos os cálculos.
--    Útil para relatórios, Power BI, Excel (via API) ou consultas SQL.
--    Mesma regra do sistema:
--      lucro previsto  = (preço comprador − preço vendedor − frete previsto)  × sacas
--      lucro realizado = (preço comprador − preço vendedor − frete realizado) × sacas
-- ---------------------------------------------------------------------
create or replace view public.vw_vinculacoes
with (security_invoker = true) as
select
  c.id                         as contrato_id,
  c.produto,
  c.data                       as data_contrato,
  c.numero                     as numero_contrato,
  c.comprador,
  c.cidade_entrega,
  c.volume_kg                  as volume_kg_comprador,
  c.preco                      as preco_comprador,
  v.id                         as vendedor_id,
  v.ordem,
  v.data                       as data_vendedor,
  v.numero                     as numero_vendedor,
  v.nome                       as vendedor,
  v.cidade_retirada,
  v.volume_kg,
  round(v.volume_kg / p.kg_saca, 4)                                    as sacas,
  v.preco                      as preco_vendedor,
  round(v.preco * v.volume_kg / p.kg_saca, 2)                          as valor_total,
  c.preco - v.preco                                                    as diferenca_sc,
  coalesce(v.frete_previsto, 0)                                        as frete_previsto_sc,
  v.frete_realizado                                                    as frete_realizado_sc,
  round(coalesce(v.frete_previsto, 0) * v.volume_kg / p.kg_saca, 2)    as frete_previsto_total,
  round(v.frete_realizado * v.volume_kg / p.kg_saca, 2)                as frete_realizado_total,
  round((coalesce(v.frete_previsto, 0) - v.frete_realizado) * v.volume_kg / p.kg_saca, 2) as frete_previsto_menos_realizado,
  round((c.preco - v.preco - coalesce(v.frete_previsto, 0)) * v.volume_kg / p.kg_saca, 2) as lucro_previsto,
  round((c.preco - v.preco - v.frete_realizado) * v.volume_kg / p.kg_saca, 2)             as lucro_realizado,
  round(v.preco * v.volume_kg / p.kg_saca * p.credito_presumido, 2)    as credito_presumido,
  case
    when v.frete_realizado is null or c.preco is null or v.preco is null then null
    when (c.preco - v.preco - v.frete_realizado) >= 0 then 'LUCRO'
    else 'PREJUÍZO'
  end                                                                  as situacao_realizado
from public.contrato_vendedores v
join public.contratos c          on c.id = v.contrato_id
join public.parametros_produto p on p.produto = c.produto;

revoke all on public.vw_vinculacoes from anon;
grant select on public.vw_vinculacoes to authenticated;

-- ---------------------------------------------------------------------
-- 8. Tempo real: telas abertas se atualizam quando alguém grava.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['contratos', 'contrato_vendedores', 'parametros_produto'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;   -- já estava
      when undefined_object then null;   -- publicação não existe (ambiente local sem realtime)
    end;
  end loop;
end;
$$;
