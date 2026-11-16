-- =====================================================================
--  Compras e vendas independentes + vínculos com saldo
--
--  Antes: cada "vendedor" vivia dentro de um contrato de venda
--         (tabela contrato_vendedores).
--  Agora: contratos      = contratos de VENDA (comprador)       — já existia
--         contratos_compra = contratos de COMPRA (produtor)      — novo
--         vinculos       = quanto de cada compra atende cada venda — novo
--
--  Uma compra pode ser dividida entre várias vendas e vice-versa.
--  Saldo da compra = volume − soma dos vínculos (idem para a venda).
--  Os dados de contrato_vendedores são convertidos automaticamente;
--  a tabela antiga fica guardada como contrato_vendedores_legado.
-- =====================================================================

comment on table public.contratos is 'Contrato de VENDA ao comprador (trading/indústria).';

-- ---------------------------------------------------------------------
-- 1. Contratos de compra (produtor)
-- ---------------------------------------------------------------------
create table if not exists public.contratos_compra (
  id               uuid primary key default gen_random_uuid(),
  produto          text not null references public.parametros_produto (produto),
  data             date,
  numero           text not null default '',
  produtor         text not null check (length(trim(produtor)) > 0),
  cidade_retirada  text not null default '',
  volume_kg        numeric(14,3) not null check (volume_kg > 0),
  preco            numeric(12,4),                       -- R$/sc · NULL = A FIXAR
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by       uuid default auth.uid() references auth.users (id) on delete set null
);
comment on table public.contratos_compra is 'Contrato de COMPRA do produtor (originação).';
create index if not exists contratos_compra_produto_idx on public.contratos_compra (produto);
create index if not exists contratos_compra_numero_idx  on public.contratos_compra (numero);
create index if not exists contratos_compra_created_by_idx on public.contratos_compra (created_by);
create index if not exists contratos_compra_updated_by_idx on public.contratos_compra (updated_by);

-- ---------------------------------------------------------------------
-- 2. Vínculos venda × compra
-- ---------------------------------------------------------------------
create table if not exists public.vinculos (
  id               uuid primary key default gen_random_uuid(),
  venda_id         uuid not null references public.contratos (id) on delete cascade,
  compra_id        uuid not null references public.contratos_compra (id) on delete cascade,
  ordem            integer not null default 0,
  volume_kg        numeric(14,3) not null check (volume_kg > 0),
  frete_previsto   numeric(12,4),                       -- R$/sc
  frete_realizado  numeric(12,4),                       -- R$/sc · NULL = não lançado
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid() references auth.users (id) on delete set null
);
comment on table public.vinculos is 'Quanto (kg) de cada contrato de compra atende cada contrato de venda, com fretes.';
create index if not exists vinculos_venda_idx  on public.vinculos (venda_id, ordem);
create index if not exists vinculos_compra_idx on public.vinculos (compra_id);
create index if not exists vinculos_updated_by_idx on public.vinculos (updated_by);

-- updated_at / updated_by
create or replace function public.tg_set_updated()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_table_name in ('contratos', 'contrato_vendedores', 'contratos_compra', 'vinculos') then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;
drop trigger if exists set_updated on public.contratos_compra;
create trigger set_updated before update on public.contratos_compra for each row execute function public.tg_set_updated();
drop trigger if exists set_updated on public.vinculos;
create trigger set_updated before update on public.vinculos for each row execute function public.tg_set_updated();

-- ---------------------------------------------------------------------
-- 3. Conversão dos dados antigos (só roda se a tabela antiga existir)
--    Mesma compra (produto + nº + produtor + preço) dividida entre vendas
--    vira UM contrato de compra com a soma dos volumes.
--    Linhas sem nº viram uma compra cada.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.contrato_vendedores') is null then
    return;
  end if;

  create temp table _conv on commit drop as
  select v.*,
         c.produto,
         md5('compra|' || case when v.numero <> ''
               then c.produto || '|' || v.numero || '|' || v.nome || '|' || coalesce(v.preco::text, 'fixar')
               else v.id::text end)::uuid as compra_id
  from public.contrato_vendedores v
  join public.contratos c on c.id = v.contrato_id;

  insert into public.contratos_compra
    (id, produto, data, numero, produtor, cidade_retirada, volume_kg, preco, created_at, updated_at, updated_by)
  select compra_id, produto, min(data), min(numero), min(nome), max(cidade_retirada),
         sum(volume_kg), min(preco), min(created_at), max(updated_at),
         (array_agg(updated_by order by updated_at desc))[1]
  from _conv
  group by compra_id, produto
  on conflict (id) do nothing;

  insert into public.vinculos
    (id, venda_id, compra_id, ordem, volume_kg, frete_previsto, frete_realizado, created_at, updated_at, updated_by)
  select id, contrato_id, compra_id, ordem, volume_kg, frete_previsto, frete_realizado, created_at, updated_at, updated_by
  from _conv
  on conflict (id) do nothing;

  -- guarda a tabela antiga como cópia de segurança, fora do uso
  begin
    execute 'alter publication supabase_realtime drop table public.contrato_vendedores';
  exception when others then null;
  end;
  drop view if exists public.vw_vinculacoes;
  drop function if exists public.salvar_contrato(jsonb, jsonb);
  alter table public.contrato_vendedores rename to contrato_vendedores_legado;
  revoke all on public.contrato_vendedores_legado from anon, authenticated;
  drop policy if exists "ler"     on public.contrato_vendedores_legado;
  drop policy if exists "incluir" on public.contrato_vendedores_legado;
  drop policy if exists "alterar" on public.contrato_vendedores_legado;
  drop policy if exists "excluir" on public.contrato_vendedores_legado;
  drop policy if exists "logados_tudo" on public.contrato_vendedores_legado;
  comment on table public.contrato_vendedores_legado is
    'Cópia da estrutura antiga (antes de 16/11/2026). Não é usada pelo sistema; pode ser apagada depois de conferida.';
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Travas: mesmo produto e sem passar do volume
-- ---------------------------------------------------------------------
create or replace function privado.validar_vinculo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda  record;
  v_compra record;
  v_usado  numeric;
begin
  select id, produto, numero, comprador, volume_kg into v_venda
    from public.contratos where id = new.venda_id for update;
  select id, produto, numero, produtor, volume_kg into v_compra
    from public.contratos_compra where id = new.compra_id for update;

  if v_venda.produto <> v_compra.produto then
    raise exception 'Produtos diferentes: a venda % é de %, a compra % é de %.',
      nullif(v_venda.numero, ''), v_venda.produto, nullif(v_compra.numero, ''), v_compra.produto;
  end if;

  select coalesce(sum(volume_kg), 0) into v_usado
    from public.vinculos where venda_id = new.venda_id and id <> new.id;
  if v_usado + new.volume_kg > v_venda.volume_kg then
    raise exception 'A venda % (%) só tem % kg de saldo para vincular.',
      coalesce(nullif(v_venda.numero, ''), 's/ nº'), v_venda.comprador,
      replace(to_char(v_venda.volume_kg - v_usado, 'FM999,999,999,990'), ',', '.');
  end if;

  select coalesce(sum(volume_kg), 0) into v_usado
    from public.vinculos where compra_id = new.compra_id and id <> new.id;
  if v_usado + new.volume_kg > v_compra.volume_kg then
    raise exception 'A compra % (%) só tem % kg de saldo para vincular.',
      coalesce(nullif(v_compra.numero, ''), 's/ nº'), v_compra.produtor,
      replace(to_char(v_compra.volume_kg - v_usado, 'FM999,999,999,990'), ',', '.');
  end if;
  return new;
end;
$$;
revoke all on function privado.validar_vinculo() from public, anon, authenticated;

drop trigger if exists validar on public.vinculos;
create trigger validar before insert or update of venda_id, compra_id, volume_kg on public.vinculos
  for each row execute function privado.validar_vinculo();

-- não deixa reduzir volume abaixo do já vinculado, nem trocar produto com vínculos
create or replace function privado.validar_contrato_com_vinculos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_usado numeric; v_n int;
begin
  if tg_table_name = 'contratos' then
    select coalesce(sum(volume_kg), 0), count(*) into v_usado, v_n from public.vinculos where venda_id = new.id;
  else
    select coalesce(sum(volume_kg), 0), count(*) into v_usado, v_n from public.vinculos where compra_id = new.id;
  end if;
  if new.volume_kg < v_usado then
    raise exception 'Este contrato já tem % kg vinculados; o volume não pode ficar menor que isso.',
      replace(to_char(v_usado, 'FM999,999,999,990'), ',', '.');
  end if;
  if new.produto <> old.produto and v_n > 0 then
    raise exception 'Não dá para trocar o produto de um contrato que já tem vínculos. Desvincule antes.';
  end if;
  return new;
end;
$$;
revoke all on function privado.validar_contrato_com_vinculos() from public, anon, authenticated;

drop trigger if exists validar_vinculos on public.contratos;
create trigger validar_vinculos before update of volume_kg, produto on public.contratos
  for each row execute function privado.validar_contrato_com_vinculos();
drop trigger if exists validar_vinculos on public.contratos_compra;
create trigger validar_vinculos before update of volume_kg, produto on public.contratos_compra
  for each row execute function privado.validar_contrato_com_vinculos();

-- ---------------------------------------------------------------------
-- 5. Segurança (mesmas regras de perfil dos contratos de venda)
-- ---------------------------------------------------------------------
alter table public.contratos_compra enable row level security;
alter table public.vinculos         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['contratos_compra', 'vinculos'] loop
    execute format('drop policy if exists "ler" on public.%I', t);
    execute format('drop policy if exists "incluir" on public.%I', t);
    execute format('drop policy if exists "alterar" on public.%I', t);
    execute format('drop policy if exists "excluir" on public.%I', t);
    execute format($p$create policy "ler" on public.%I for select to authenticated
                     using ((select privado.perfil_atual()) is not null)$p$, t);
    execute format($p$create policy "incluir" on public.%I for insert to authenticated
                     with check ((select privado.perfil_atual()) in ('admin', 'comercial'))$p$, t);
    execute format($p$create policy "alterar" on public.%I for update to authenticated
                     using ((select privado.perfil_atual()) in ('admin', 'comercial'))
                     with check ((select privado.perfil_atual()) in ('admin', 'comercial'))$p$, t);
    execute format($p$create policy "excluir" on public.%I for delete to authenticated
                     using ((select privado.perfil_atual()) in ('admin', 'comercial'))$p$, t);
  end loop;
end;
$$;

revoke all on public.contratos_compra, public.vinculos from anon;
grant select, insert, update, delete on public.contratos_compra, public.vinculos to authenticated;

-- ---------------------------------------------------------------------
-- 6. Gravar os vínculos de uma venda de uma vez (substitui a lista toda)
--    p_vinculos: [{id?, compra_id, volume_kg, frete_previsto, frete_realizado}, ...]
--    Lista vazia = desvincula tudo (venda e compras voltam para as abas).
-- ---------------------------------------------------------------------
create or replace function public.salvar_vinculos(p_venda_id uuid, p_vinculos jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare v_keep uuid[];
begin
  if jsonb_typeof(p_vinculos) is distinct from 'array' then
    raise exception 'Lista de vínculos inválida.';
  end if;
  if not exists (select 1 from contratos where id = p_venda_id) then
    raise exception 'Contrato de venda não encontrado.';
  end if;

  select coalesce(array_agg((e ->> 'id')::uuid), '{}') into v_keep
    from jsonb_array_elements(p_vinculos) e where nullif(e ->> 'id', '') is not null;

  delete from vinculos where venda_id = p_venda_id and not (id = any (v_keep));

  insert into vinculos (id, venda_id, compra_id, ordem, volume_kg, frete_previsto, frete_realizado)
  select coalesce(nullif(e ->> 'id', '')::uuid, gen_random_uuid()),
         p_venda_id,
         (e ->> 'compra_id')::uuid,
         (t.ord - 1)::int,
         (e ->> 'volume_kg')::numeric,
         nullif(e ->> 'frete_previsto', '')::numeric,
         nullif(e ->> 'frete_realizado', '')::numeric
  from jsonb_array_elements(p_vinculos) with ordinality as t(e, ord)
  on conflict (id) do update set
    compra_id = excluded.compra_id, ordem = excluded.ordem, volume_kg = excluded.volume_kg,
    frete_previsto = excluded.frete_previsto, frete_realizado = excluded.frete_realizado
  where vinculos.venda_id = excluded.venda_id;
end;
$$;
revoke all on function public.salvar_vinculos(uuid, jsonb) from public, anon;
grant execute on function public.salvar_vinculos(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Relatórios
-- ---------------------------------------------------------------------
-- 7a. uma linha por vínculo, com todos os cálculos
create or replace view public.vw_vinculacoes with (security_invoker = true) as
select
  c.id as contrato_id, c.produto, c.data as data_contrato, c.numero as numero_contrato, c.comprador, c.cidade_entrega,
  c.volume_kg as volume_kg_comprador, c.preco as preco_comprador,
  vi.id as vinculo_id, vi.ordem,
  cp.id as compra_id, cp.data as data_vendedor, cp.numero as numero_vendedor, cp.produtor as vendedor, cp.cidade_retirada,
  vi.volume_kg,
  round(vi.volume_kg / p.kg_saca, 4) as sacas,
  cp.preco as preco_vendedor,
  round(cp.preco * vi.volume_kg / p.kg_saca, 2) as valor_total,
  c.preco - cp.preco as diferenca_sc,
  coalesce(vi.frete_previsto, 0) as frete_previsto_sc,
  vi.frete_realizado as frete_realizado_sc,
  round(coalesce(vi.frete_previsto, 0) * vi.volume_kg / p.kg_saca, 2) as frete_previsto_total,
  round(vi.frete_realizado * vi.volume_kg / p.kg_saca, 2) as frete_realizado_total,
  round((coalesce(vi.frete_previsto, 0) - vi.frete_realizado) * vi.volume_kg / p.kg_saca, 2) as frete_previsto_menos_realizado,
  round((c.preco - cp.preco - coalesce(vi.frete_previsto, 0)) * vi.volume_kg / p.kg_saca, 2) as lucro_previsto,
  round((c.preco - cp.preco - vi.frete_realizado) * vi.volume_kg / p.kg_saca, 2) as lucro_realizado,
  round(cp.preco * vi.volume_kg / p.kg_saca * p.credito_presumido, 2) as credito_presumido,
  case when vi.frete_realizado is null or c.preco is null or cp.preco is null then null
       when (c.preco - cp.preco - vi.frete_realizado) >= 0 then 'LUCRO' else 'PREJUÍZO' end as situacao_realizado
from public.vinculos vi
join public.contratos c          on c.id = vi.venda_id
join public.contratos_compra cp  on cp.id = vi.compra_id
join public.parametros_produto p on p.produto = c.produto;

-- 7b. saldo de cada compra e de cada venda
create or replace view public.vw_compras_saldo with (security_invoker = true) as
select cp.*, coalesce(s.vinculado, 0) as vinculado_kg, cp.volume_kg - coalesce(s.vinculado, 0) as saldo_kg
from public.contratos_compra cp
left join (select compra_id, sum(volume_kg) vinculado from public.vinculos group by compra_id) s on s.compra_id = cp.id;

create or replace view public.vw_vendas_saldo with (security_invoker = true) as
select c.*, coalesce(s.vinculado, 0) as vinculado_kg, c.volume_kg - coalesce(s.vinculado, 0) as saldo_kg
from public.contratos c
left join (select venda_id, sum(volume_kg) vinculado from public.vinculos group by venda_id) s on s.venda_id = c.id;

-- 7c. posição por produto (em sacas)
create or replace view public.vw_posicao_produto with (security_invoker = true) as
select p.produto,
  round(coalesce((select sum(volume_kg) from public.contratos_compra where produto = p.produto), 0) / p.kg_saca, 2) as comprado_sc,
  round(coalesce((select sum(volume_kg) from public.contratos where produto = p.produto), 0) / p.kg_saca, 2)        as vendido_sc,
  round(coalesce((select sum(greatest(saldo_kg, 0)) from public.vw_compras_saldo where produto = p.produto), 0) / p.kg_saca, 2) as comprado_sem_venda_sc,
  round(coalesce((select sum(greatest(saldo_kg, 0)) from public.vw_vendas_saldo where produto = p.produto), 0) / p.kg_saca, 2)  as vendido_sem_compra_sc
from public.parametros_produto p;

revoke all on public.vw_vinculacoes, public.vw_compras_saldo, public.vw_vendas_saldo, public.vw_posicao_produto from anon;
grant select on public.vw_vinculacoes, public.vw_compras_saldo, public.vw_vendas_saldo, public.vw_posicao_produto to authenticated;

-- ---------------------------------------------------------------------
-- 8. Tempo real
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['contratos_compra', 'vinculos'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end;
$$;
