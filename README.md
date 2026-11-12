# Sistema de Vinculações de Contratos – Grupo Parceiro Agronegócios

Sistema web para vincular **contratos de venda (comprador)** aos **contratos de compra dos produtores (vendedores)** de **milho, soja e sorgo**, com lançamento de frete realizado e cálculo de **lucro previsto x lucro realizado**.

`# O Agro não Para` · Grupo Parceiro Agronegócios · Varginha MG

---

## O que o sistema faz

- **Contratos:** tabela no modelo da planilha de vinculações (comprador, vendedores e resumo com preço médio ponderado). Tem filtros por produto e situação, busca e um botão para copiar a tabela para o Excel.
- **Frete realizado:** você digita o frete em R$/sc direto na tabela e o lucro realizado é calculado na hora.
- **Quadros do topo:** sacas fechadas por produto, lucro previsto, lucro realizado, crédito presumido, frete previsto x realizado, fretes pendentes e saldo a vincular. Cada quadro explica a própria conta ao passar o mouse.
- **+ Novo contrato:** cadastro do comprador e dos vendedores, com cidade de entrega e cidade de retirada. Mostra uma prévia dos cálculos antes de salvar.
- **Parâmetros:** kg por saca e % de crédito presumido por produto.
- **Login:** só usuários cadastrados entram. Os dados ficam no Supabase (PostgreSQL).

### Regras de cálculo

| Item | Conta |
|---|---|
| Sacas | kg ÷ kg por saca |
| Diferença (R$/sc) | preço comprador − preço vendedor |
| Lucro previsto | (diferença − frete previsto) × sacas |
| Lucro realizado | (diferença − frete realizado) × sacas |
| Crédito presumido | sacas × preço vendedor × % crédito |
| Frete previsto − realizado | (frete previsto − frete realizado) × sacas. Positivo é lucro no frete, negativo é prejuízo |
| Saldo a vincular | kg do comprador − soma dos kg dos vendedores |

Preço em branco = **A FIXAR**, e essa linha fica fora das somas de lucro.

---

## Estrutura do projeto

```
vinculacoes-cereais/
├─ index.html                  telas do sistema
├─ css/styles.css              visual
├─ js/
│  ├─ config.js                ← URL e chave do seu Supabase (preencher)
│  ├─ api.js                   conversa com o banco (Supabase)
│  ├─ calc.js                  regras de cálculo
│  └─ app.js                   telas, formulários e login
├─ assets/logo-grupo-parceiro.png
├─ supabase/
│  ├─ migrations/20261112000000_estrutura_inicial.sql   tabelas, segurança, função e relatório
│  └─ seed.sql                 carga dos 17 contratos atuais (NÃO vai para o GitHub)
├─ tests/                      testes dos cálculos contra a planilha original
├─ docs/modelo-de-dados.md     explicação das tabelas
└─ .github/workflows/testes.yml  roda os testes a cada envio ao GitHub
```

É um site estático (HTML + JavaScript), sem etapa de compilação. Não precisa instalar nada para funcionar.

---

## Passo a passo para colocar no ar

> **Situação atual:** o projeto Supabase **vinculacoes-cereais** (região São Paulo) já foi criado, com a estrutura e os 17 contratos carregados, e o `js/config.js` já está preenchido. Os passos 1 e 3 abaixo servem só para recriar o banco em outro projeto. Faltam os passos 2, 6 e 7.

### 1. Criar o banco no Supabase

1. Entre em <https://supabase.com> e clique em **New project**. Sugestão de região: **South America (São Paulo)**.
2. No menu lateral, abra **SQL Editor** e clique em **New query**.
3. Abra o arquivo `supabase/migrations/20261112000000_estrutura_inicial.sql`, copie todo o conteúdo, cole no editor e clique em **Run**. Isso cria as tabelas, as regras de segurança, a função de salvar e a view de relatório.
4. Faça o mesmo com `supabase/seed.sql`, que carrega os 17 contratos de soja atuais.
5. Para conferir, rode a consulta abaixo. O resultado deve ser 17 contratos, 35 vendedores, lucro previsto de R$ 1.227.449,73 e crédito de R$ 307.712,69.
   ```sql
   select count(distinct contrato_id) contratos, count(*) vendedores,
          sum(lucro_previsto) lucro_previsto, sum(credito_presumido) credito
   from vw_vinculacoes;
   ```

### 2. Criar os usuários (login)

1. Em **Authentication → Sign In / Providers**, deixe **Email** ligado e **desligue "Allow new users to sign up"**. Assim ninguém cria conta sozinho.
2. Em **Authentication → Users → Add user → Create new user**, informe o e-mail e a senha de cada pessoa e marque **Auto Confirm User**.

### 3. Ligar o sistema ao seu Supabase

1. No Supabase, abra **Project Settings → API** (ou **Data API**).
2. Copie a **Project URL** e a chave **anon public**.
3. Cole as duas no arquivo `js/config.js`:
   ```js
   export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```

A chave *anon* foi feita para ficar no navegador e pode ir para o GitHub. Quem protege os dados são as regras de segurança do banco: sem login, não se lê nem se grava nada. **Nunca** use a chave `service_role` no sistema.

### 4. Testar no seu computador (opcional)

O sistema precisa ser aberto por um endereço `http://`. Abrir o `index.html` com dois cliques não funciona. Use uma destas opções:

- **VS Code:** instale a extensão *Live Server* e clique em **Go Live**.
- **Python:** rode `python -m http.server 5500` na pasta e abra <http://localhost:5500>.
- **Node:** rode `npm run dev` e abra <http://localhost:5500>.

### 5. Subir para o GitHub

1. Em <https://github.com/new>, crie um repositório **privado** chamado `vinculacoes-cereais`.
2. Na pasta do projeto, rode:
   ```bash
   git init
   git add .
   git commit -m "Sistema de vinculações – versão inicial"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/vinculacoes-cereais.git
   git push -u origin main
   ```
   Se preferir não usar o terminal, o **GitHub Desktop** faz a mesma coisa.

O arquivo `supabase/seed.sql`, com os contratos reais, está no `.gitignore` e **não vai para o GitHub**.

### 6. Publicar na internet

**Opção recomendada: Vercel (gratuito, funciona com repositório privado)**
1. Entre em <https://vercel.com> com sua conta do GitHub.
2. Clique em **Add New → Project** e escolha `vinculacoes-cereais`.
3. Em *Framework Preset*, escolha **Other**. Deixe *Build Command* vazio e *Output Directory* como `.`. Clique em **Deploy**.
4. Você recebe um endereço como `https://vinculacoes-cereais.vercel.app`. A cada `git push`, o site é atualizado sozinho.

**Alternativa: GitHub Pages.** Só é gratuito em repositório público, ou em plano pago com repositório privado. Ative em **Settings → Pages → Deploy from a branch → main / (root)**.

### 7. Ajuste final no Supabase

Em **Authentication → URL Configuration**:
- **Site URL:** o endereço publicado, por exemplo `https://vinculacoes-cereais.vercel.app`.
- **Redirect URLs:** o mesmo endereço e `http://localhost:5500`.

Sem isso, o link de "Esqueci minha senha" não volta para o sistema.

---

## Dia a dia

- **Novo contrato:** use **+ Novo contrato**, escolha o produto, preencha o comprador e os vendedores e clique em **Salvar**.
- **Fixar preço:** clique em **Editar** no contrato, preencha o preço e salve.
- **Frete realizado:** digite na coluna amarela da tabela e tecle Enter.
- **Excel:** use **Copiar tabela (Excel)** e cole com Ctrl+V.
- **Relatórios avançados:** a view `vw_vinculacoes` traz uma linha por vendedor com todos os cálculos. Dá para consultar no SQL Editor ou ligar no Power BI ou no Excel pela API do Supabase.
- **Backup:** os backups automáticos do Supabase dependem do plano contratado (veja Database → Backups). Para ter uma cópia sua, rode `select * from vw_vinculacoes` no SQL Editor e exporte em CSV.

## Testes

```bash
npm test
```

Os testes conferem os cálculos contra os totais da planilha original: resultado de R$ 1.207.449,73 e crédito de R$ 307.712,69. Eles também rodam sozinhos no GitHub a cada envio, na aba **Actions**.
