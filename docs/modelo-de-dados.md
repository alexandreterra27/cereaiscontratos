# Modelo de dados (Supabase / PostgreSQL)

```
                       ┌──< vinculos >──┐
parametros_produto ──< contratos (venda)   contratos_compra ── produto
                       comprador           produtor
```
Uma venda pode ter várias compras e uma compra pode atender várias vendas (`vinculos.volume_kg`).
Saldo = volume do contrato − soma dos vínculos. Uma trava no banco impede vincular acima do saldo ou entre produtos diferentes.

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

## `contratos_compra` (lado produtor)
produto, data, numero, produtor, cidade_retirada, volume_kg, preco (vazio = A FIXAR).

## `vinculos`
venda_id, compra_id, volume_kg (quanto da compra vai para a venda), frete_previsto, frete_realizado.
Gravados pela função `salvar_vinculos(venda_id, lista)`, que substitui a lista inteira da venda.

Views: `vw_vinculacoes` (uma linha por vínculo, com lucros), `vw_compras_saldo`, `vw_vendas_saldo` e `vw_posicao_produto` (comprado, vendido, sem venda e sem compra, em sacas).

## `contrato_vendedores_legado` (antiga, só cópia de segurança)
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

## `perfis`
| coluna | tipo | descrição |
|---|---|---|
| user_id | uuid (PK, FK auth.users) | usuário do Supabase Auth |
| nome, email | text | para exibição |
| perfil | text | `admin`, `comercial` ou `consulta` |
| ativo | boolean | inativo não entra (também fica bloqueado no Auth) |

Novo usuário do Auth recebe perfil `consulta` automaticamente (trigger `criar_perfil`).
Ninguém altera `perfis` pelo navegador: só a função `admin-usuarios`, que roda no servidor com a chave service_role e confere se quem chamou é administrador ativo.

## Segurança (RLS)
- Visitantes sem login (`anon`) não leem nem gravam nada.
- Logado **sem perfil ativo**: não lê nada.
- **consulta**: só lê.
- **comercial**: lê e grava contratos, vendedores e fretes; só lê os parâmetros.
- **admin**: tudo, inclusive parâmetros e, pela função, usuários.
- A regra usa `privado.perfil_atual()`, uma função num schema que não é exposto pela API.
