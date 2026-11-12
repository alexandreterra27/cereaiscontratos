# Modelo de dados (Supabase / PostgreSQL)

```
parametros_produto (1) ──< contratos (1) ──< contrato_vendedores (N)
     produto                    comprador          produtores vinculados
```

## `parametros_produto`
| coluna | tipo | descrição |
|---|---|---|
| produto | text (PK) | `milho`, `soja` ou `sorgo` |
| kg_saca | numeric | kg por saca (padrão 60) |
| credito_presumido | numeric | fração: 0.024 = 2,4% |

## `contratos` (lado comprador)
| coluna | tipo | descrição |
|---|---|---|
| id | uuid (PK) | gerado automaticamente |
| produto | text (FK) | produto do contrato |
| data | date | data do contrato |
| numero | text | nº do contrato do comprador |
| comprador | text | empresa compradora |
| cidade_entrega | text | ex.: SANTOS/SP |
| volume_kg | numeric | volume vendido |
| preco | numeric | R$/sc · **vazio = A FIXAR** |
| created_at / updated_at | timestamptz | automáticos |
| created_by / updated_by | uuid | usuário que criou e alterou por último |

## `contrato_vendedores` (lado produtor)
| coluna | tipo | descrição |
|---|---|---|
| id | uuid (PK) | |
| contrato_id | uuid (FK) | contrato do comprador; ao excluir o contrato, os vendedores saem junto |
| ordem | int | ordem de exibição |
| data, numero | | data e nº do contrato do produtor (ex.: 245/26S-F) |
| nome | text | produtor / empresa |
| cidade_retirada | text | onde o grão é retirado |
| volume_kg | numeric | volume comprado do produtor |
| preco | numeric | R$/sc · vazio = A FIXAR |
| frete_previsto | numeric | R$/sc |
| frete_realizado | numeric | R$/sc · vazio = ainda não lançado |

## Função `salvar_contrato(p_contrato jsonb, p_vendedores jsonb)`
Grava o contrato e a lista completa de vendedores numa só operação. Vendedores que existiam e não vieram na lista são excluídos. Se algo falhar, nada é gravado.

## View `vw_vinculacoes`
Uma linha por vendedor, já com sacas, valor total, diferença, fretes, lucro previsto, lucro realizado, crédito presumido e situação (LUCRO ou PREJUÍZO). Respeita as regras de segurança (`security_invoker`).

## Segurança (RLS)
- Visitantes sem login (`anon`) não leem nem gravam nada.
- Usuários logados (`authenticated`) leem e gravam tudo.
- Cadastro aberto deve ficar **desligado** no Supabase. Os usuários são criados pelo administrador.

Se no futuro precisar de perfis diferentes (por exemplo, quem só consulta e quem lança), dá para criar uma tabela `perfis` e ajustar as políticas.
