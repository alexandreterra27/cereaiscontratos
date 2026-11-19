-- =====================================================================
--  1. Editar contrato pode trocar o PRODUTO: as compras da tela acompanham.
--     (Se uma compra também estiver ligada a outra venda, a trava avisa.)
--  2. Excluir contrato pela aba Contratos, com opção de apagar junto as
--     compras que ficarem sem nenhum vínculo.
-- =====================================================================

create or replace function public.salvar_vinculacao(p_venda jsonb, p_linhas jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id   uuid := nullif(p_venda ->> 'id', '')::uuid;
  v_prod text := p_venda ->> 'produto';
  v_cid  uuid;
  r      record;
begin
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Informe pelo menos um vendedor (contrato de compra).';
  end if;

  if v_id is null then
    insert into contratos (produto, data, numero, comprador, cidade_entrega, volume_kg, preco)
    values (v_prod, nullif(p_venda ->> 'data', '')::date, upper(coalesce(p_venda ->> 'numero', '')),
            upper(trim(p_venda ->> 'comprador')), upper(coalesce(p_venda ->> 'cidade_entrega', '')),
            (p_venda ->> 'volume_kg')::numeric, nullif(p_venda ->> 'preco', '')::numeric)
    returning id into v_id;
  else
    delete from vinculos where venda_id = v_id;
    update contratos set
      produto = v_prod,
      data = nullif(p_venda ->> 'data', '')::date,
      numero = upper(coalesce(p_venda ->> 'numero', '')),
      comprador = upper(trim(p_venda ->> 'comprador')),
      cidade_entrega = upper(coalesce(p_venda ->> 'cidade_entrega', '')),
      volume_kg = (p_venda ->> 'volume_kg')::numeric,
      preco = nullif(p_venda ->> 'preco', '')::numeric
    where id = v_id;
    if not found then
      raise exception 'Contrato de venda não encontrado.';
    end if;
  end if;

  for r in select e, ord from jsonb_array_elements(p_linhas) with ordinality as t(e, ord) loop
    v_cid := nullif(r.e ->> 'compra_id', '')::uuid;
    if v_cid is null then
      insert into contratos_compra (produto, data, numero, produtor, cidade_retirada, volume_kg, preco)
      values (v_prod, nullif(r.e ->> 'data', '')::date, upper(coalesce(r.e ->> 'numero', '')),
              upper(trim(r.e ->> 'produtor')), upper(coalesce(r.e ->> 'cidade_retirada', '')),
              (r.e ->> 'volume_kg')::numeric, nullif(r.e ->> 'preco', '')::numeric)
      returning id into v_cid;
    else
      begin
        update contratos_compra set
          produto = v_prod,
          data = nullif(r.e ->> 'data', '')::date,
          numero = upper(coalesce(r.e ->> 'numero', '')),
          produtor = upper(trim(r.e ->> 'produtor')),
          cidade_retirada = upper(coalesce(r.e ->> 'cidade_retirada', '')),
          preco = nullif(r.e ->> 'preco', '')::numeric
        where id = v_cid;
      exception when raise_exception then
        raise exception 'Não dá para trocar o produto da compra % (%): ela também está vinculada a outra venda.',
          coalesce(nullif(r.e ->> 'numero', ''), 's/ nº'), upper(trim(r.e ->> 'produtor'));
      end;
      if not found then
        raise exception 'Contrato de compra % não encontrado.', r.e ->> 'numero';
      end if;
    end if;

    insert into vinculos (id, venda_id, compra_id, ordem, volume_kg, frete_previsto, frete_realizado)
    values (coalesce(nullif(r.e ->> 'id', '')::uuid, gen_random_uuid()), v_id, v_cid, (r.ord - 1)::int,
            (r.e ->> 'volume_kg')::numeric,
            nullif(r.e ->> 'frete_previsto', '')::numeric,
            nullif(r.e ->> 'frete_realizado', '')::numeric);
  end loop;

  return v_id;
end;
$$;
revoke all on function public.salvar_vinculacao(jsonb, jsonb) from public, anon;
grant execute on function public.salvar_vinculacao(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Excluir contrato de venda (e, se pedido, as compras que ficarem soltas)
-- ---------------------------------------------------------------------
create or replace function public.excluir_contrato(p_venda_id uuid, p_excluir_compras boolean)
returns integer          -- quantas compras foram apagadas junto
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_compras uuid[];
  v_n int := 0;
begin
  select coalesce(array_agg(distinct compra_id), '{}') into v_compras
    from vinculos where venda_id = p_venda_id;

  delete from contratos where id = p_venda_id;     -- os vínculos saem junto
  if not found then
    raise exception 'Contrato não encontrado ou seu perfil não permite excluir.';
  end if;

  if p_excluir_compras then
    delete from contratos_compra cp
     where cp.id = any (v_compras)
       and not exists (select 1 from vinculos l where l.compra_id = cp.id);
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end;
$$;
revoke all on function public.excluir_contrato(uuid, boolean) from public, anon;
grant execute on function public.excluir_contrato(uuid, boolean) to authenticated;
