-- =====================================================================
--  Perfis de acesso
--    admin      → tudo: contratos, fretes, parâmetros e usuários
--    comercial  → lança e edita contratos e fretes; vê parâmetros
--    consulta   → só visualiza
--  Usuário sem perfil, ou com perfil inativo, não vê nada.
-- =====================================================================

-- Schema privado (não exposto pela API) para funções auxiliares
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

-- ---------------------------------------------------------------------
-- 1. Tabela de perfis (1 linha por usuário do Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  nome        text not null default '',
  email       text not null default '',
  perfil      text not null default 'consulta' check (perfil in ('admin', 'comercial', 'consulta')),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.perfis is 'Perfil de acesso de cada usuário. Alterado apenas pela função admin-usuarios.';

drop trigger if exists set_updated on public.perfis;
create trigger set_updated before update on public.perfis
  for each row execute function public.tg_set_updated();

-- tg_set_updated só mexe em updated_by quando a tabela tem essa coluna
create or replace function public.tg_set_updated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_table_name in ('contratos', 'contrato_vendedores') then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Perfil do usuário logado (usado nas regras)
-- ---------------------------------------------------------------------
create or replace function privado.perfil_atual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.perfil from public.perfis p where p.user_id = auth.uid() and p.ativo
$$;
revoke all on function privado.perfil_atual() from public, anon;
grant execute on function privado.perfil_atual() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Todo usuário novo ganha perfil "consulta" (o admin muda depois)
-- ---------------------------------------------------------------------
create or replace function privado.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (user_id, email, nome, perfil)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'nome', ''), 'consulta')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function privado.criar_perfil_novo_usuario() from public, anon, authenticated;

drop trigger if exists criar_perfil on auth.users;
create trigger criar_perfil after insert on auth.users
  for each row execute function privado.criar_perfil_novo_usuario();

-- Usuários que já existiam: o primeiro vira admin, os demais consulta
insert into public.perfis (user_id, email, nome, perfil)
select u.id, coalesce(u.email, ''), coalesce(u.raw_user_meta_data ->> 'nome', ''),
       case when row_number() over (order by u.created_at) = 1 then 'admin' else 'consulta' end
from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- 4. Regras (RLS) por perfil
-- ---------------------------------------------------------------------
alter table public.perfis enable row level security;

drop policy if exists "ver_proprio_ou_admin" on public.perfis;
create policy "ver_proprio_ou_admin" on public.perfis
  for select to authenticated
  using (user_id = (select auth.uid()) or (select privado.perfil_atual()) = 'admin');
-- sem políticas de escrita: perfis só mudam pela função admin-usuarios (service role)

revoke all on public.perfis from anon;
revoke insert, update, delete on public.perfis from authenticated;
grant select on public.perfis to authenticated;

-- contratos e vendedores
drop policy if exists "logados_tudo" on public.contratos;
drop policy if exists "ler" on public.contratos;
drop policy if exists "incluir" on public.contratos;
drop policy if exists "alterar" on public.contratos;
drop policy if exists "excluir" on public.contratos;
create policy "ler" on public.contratos for select to authenticated
  using ((select privado.perfil_atual()) is not null);
create policy "incluir" on public.contratos for insert to authenticated
  with check ((select privado.perfil_atual()) in ('admin', 'comercial'));
create policy "alterar" on public.contratos for update to authenticated
  using ((select privado.perfil_atual()) in ('admin', 'comercial'))
  with check ((select privado.perfil_atual()) in ('admin', 'comercial'));
create policy "excluir" on public.contratos for delete to authenticated
  using ((select privado.perfil_atual()) in ('admin', 'comercial'));

drop policy if exists "logados_tudo" on public.contrato_vendedores;
drop policy if exists "ler" on public.contrato_vendedores;
drop policy if exists "incluir" on public.contrato_vendedores;
drop policy if exists "alterar" on public.contrato_vendedores;
drop policy if exists "excluir" on public.contrato_vendedores;
create policy "ler" on public.contrato_vendedores for select to authenticated
  using ((select privado.perfil_atual()) is not null);
create policy "incluir" on public.contrato_vendedores for insert to authenticated
  with check ((select privado.perfil_atual()) in ('admin', 'comercial'));
create policy "alterar" on public.contrato_vendedores for update to authenticated
  using ((select privado.perfil_atual()) in ('admin', 'comercial'))
  with check ((select privado.perfil_atual()) in ('admin', 'comercial'));
create policy "excluir" on public.contrato_vendedores for delete to authenticated
  using ((select privado.perfil_atual()) in ('admin', 'comercial'));

-- parâmetros: todos com perfil leem, só admin altera
drop policy if exists "logados_tudo" on public.parametros_produto;
drop policy if exists "ler" on public.parametros_produto;
drop policy if exists "admin_altera" on public.parametros_produto;
drop policy if exists "admin_inclui" on public.parametros_produto;
drop policy if exists "admin_exclui" on public.parametros_produto;
create policy "ler" on public.parametros_produto for select to authenticated
  using ((select privado.perfil_atual()) is not null);
create policy "admin_inclui" on public.parametros_produto for insert to authenticated
  with check ((select privado.perfil_atual()) = 'admin');
create policy "admin_altera" on public.parametros_produto for update to authenticated
  using ((select privado.perfil_atual()) = 'admin')
  with check ((select privado.perfil_atual()) = 'admin');
create policy "admin_exclui" on public.parametros_produto for delete to authenticated
  using ((select privado.perfil_atual()) = 'admin');

-- tempo real também para perfis
do $$
begin
  execute 'alter publication supabase_realtime add table public.perfis';
exception when duplicate_object then null; when undefined_object then null;
end;
$$;
