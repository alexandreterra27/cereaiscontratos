-- =====================================================================
--  Tela "Inserir contrato" (modelo da planilha) gravando tudo de uma vez.
--
--  p_venda:  {id?, produto, data, numero, comprador, cidade_entrega, volume_kg, preco}
--            id preenchido = venda já existente (puxada da aba Vendas ou em edição)
--  p_linhas: [{id?(vínculo), compra_id?, data, numero, produtor, cidade_retirada,
--              volume_kg, preco, frete_previsto, frete_realizado}, ...]
--            compra_id vazio  = contrato de compra NOVO, criado com volume_kg
--            compra_id cheio  = compra puxada da aba Compras; volume_kg é a parte
--                               vinculada (o resto continua na aba Compras)
--
--  Os vínculos da venda são refeitos por inteiro (os fretes vêm na lista).
--  As travas de saldo e de produto continuam valendo.
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
    -- tira os vínculos atuais para poder mudar volume/produto da venda sem esbarrar nas travas;
    -- eles são gravados de novo logo abaixo, com os mesmos ids e fretes
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
      update contratos_compra set
        data = nullif(r.e ->> 'data', '')::date,
        numero = upper(coalesce(r.e ->> 'numero', '')),
        produtor = upper(trim(r.e ->> 'produtor')),
        cidade_retirada = upper(coalesce(r.e ->> 'cidade_retirada', '')),
        preco = nullif(r.e ->> 'preco', '')::numeric
      where id = v_cid;
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
