// =====================================================================
//  Acesso ao banco (Supabase). Toda conversa com o banco passa por aqui.
//  A tela trabalha com objetos em camelCase; o banco usa snake_case.
// =====================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { parametrosPadrao } from "./calc.js";

export const configurado =
  /^https:\/\/.+\.supabase\.co\/?$/.test(SUPABASE_URL) && !/COLE-AQUI/.test(SUPABASE_ANON_KEY);

export const supabase = configurado
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

const num = (v) => (v == null || v === "" ? null : Number(v));

// ---------- conversões banco ⇄ tela ----------
const vendaDoBanco = (r) => ({
  id: r.id, produto: r.produto, data: r.data || "", numero: r.numero || "", comprador: r.comprador || "",
  cidade: r.cidade_entrega || "", volumeKg: num(r.volume_kg), preco: num(r.preco),
});
const compraDoBanco = (r) => ({
  id: r.id, produto: r.produto, data: r.data || "", numero: r.numero || "", produtor: r.produtor || "",
  cidade: r.cidade_retirada || "", volumeKg: num(r.volume_kg), preco: num(r.preco),
});
const vinculoDoBanco = (r) => ({
  id: r.id, vendaId: r.venda_id, compraId: r.compra_id, ordem: r.ordem ?? 0, volumeKg: num(r.volume_kg),
  fretePrev: num(r.frete_previsto), freteReal: num(r.frete_realizado),
});

function falha(error, padrao) {
  const e = new Error(traduzErro(error) || padrao);
  e.original = error;
  return e;
}

export function traduzErro(error) {
  if (!error) return "";
  const m = String(error.message || error);
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "E-mail ainda não confirmado. Veja sua caixa de entrada.";
  if (/row-level security|permission denied/i.test(m)) return "Seu perfil de acesso não permite essa operação.";
  if (/JWT|not authorized/i.test(m)) return "Sessão expirada. Entre novamente.";
  if (/banned/i.test(m)) return "Usuário inativo. Fale com o administrador.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor.";
  return m;
}

// ---------- autenticação ----------
export async function sessaoAtual() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function aoMudarSessao(cb) {
  return supabase.auth.onAuthStateChange((evento, sessao) => cb(sessao, evento));
}
export async function entrar(email, senha) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw falha(error, "Não foi possível entrar.");
}
export async function sair() {
  await supabase.auth.signOut();
}
export async function enviarRecuperacaoSenha(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname,
  });
  if (error) throw falha(error, "Não foi possível enviar o e-mail.");
}
export async function definirNovaSenha(senha) {
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) throw falha(error, "Não foi possível trocar a senha.");
}

// ---------- leitura ----------
/** Carrega vendas, compras e vínculos. */
export async function carregarTudo() {
  const [v, c, l] = await Promise.all([
    lerTudo("contratos", "id, produto, data, numero, comprador, cidade_entrega, volume_kg, preco"),
    lerTudo("contratos_compra", "id, produto, data, numero, produtor, cidade_retirada, volume_kg, preco"),
    lerTudo("vinculos", "id, venda_id, compra_id, ordem, volume_kg, frete_previsto, frete_realizado"),
  ]);
  return { vendas: v.map(vendaDoBanco), compras: c.map(compraDoBanco), vinculos: l.map(vinculoDoBanco) };
}

/** Lê a tabela inteira em páginas de 1.000 linhas (limite do Supabase por consulta). */
async function lerTudo(tabela, colunas) {
  const todas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).order("id").range(de, de + 999);
    if (error) throw falha(error, "Não foi possível carregar os contratos.");
    todas.push(...data);
    if (data.length < 1000) return todas;
  }
}

export async function carregarParametros() {
  const { data, error } = await supabase.from("parametros_produto").select("produto, kg_saca, credito_presumido");
  if (error) throw falha(error, "Não foi possível carregar os parâmetros.");
  const p = parametrosPadrao();
  for (const r of data) {
    p.kgSaca[r.produto] = Number(r.kg_saca);
    p.credito[r.produto] = Number(r.credito_presumido);
  }
  return p;
}

// ---------- gravação ----------
async function gravar(tabela, id, linha, padrao) {
  const q = id ? supabase.from(tabela).update(linha).eq("id", id) : supabase.from(tabela).insert(linha);
  const { data, error } = await q.select("id");
  if (error) throw falha(error, padrao);
  if (!data || !data.length) throw new Error("Seu perfil de acesso não permite essa operação.");
  return data[0].id;
}

export function salvarVenda(v) {
  return gravar("contratos", v.id, {
    produto: v.produto, data: v.data || null, numero: v.numero || "", comprador: v.comprador,
    cidade_entrega: v.cidade || "", volume_kg: v.volumeKg, preco: v.preco,
  }, "Não foi possível salvar a venda.");
}

export function salvarCompra(c) {
  return gravar("contratos_compra", c.id, {
    produto: c.produto, data: c.data || null, numero: c.numero || "", produtor: c.produtor,
    cidade_retirada: c.cidade || "", volume_kg: c.volumeKg, preco: c.preco,
  }, "Não foi possível salvar a compra.");
}

async function excluir(tabela, id, padrao) {
  const { data, error } = await supabase.from(tabela).delete().eq("id", id).select("id");
  if (error) throw falha(error, padrao);
  if (!data || !data.length) throw new Error("Seu perfil de acesso não permite excluir.");
}
export const excluirVenda = (id) => excluir("contratos", id, "Não foi possível excluir a venda.");
export const excluirCompra = (id) => excluir("contratos_compra", id, "Não foi possível excluir a compra.");

/** Grava a lista completa de vínculos de uma venda (lista vazia = desvincular tudo). */
export async function salvarVinculos(vendaId, lista) {
  const { error } = await supabase.rpc("salvar_vinculos", {
    p_venda_id: vendaId,
    p_vinculos: lista.map((x) => ({
      id: x.id || null, compra_id: x.compraId, volume_kg: x.volumeKg,
      frete_previsto: x.fretePrev, frete_realizado: x.freteReal,
    })),
  });
  if (error) throw falha(error, "Não foi possível salvar a vinculação.");
}

export async function salvarFreteRealizado(vinculoId, valor) {
  const { data, error } = await supabase
    .from("vinculos")
    .update({ frete_realizado: valor })
    .eq("id", vinculoId)
    .select("id");
  if (error) throw falha(error, "Não foi possível salvar o frete.");
  if (!data || !data.length) throw new Error("Seu perfil não permite lançar frete.");
}

export async function salvarParametros(p) {
  const linhas = Object.keys(p.kgSaca).map((produto) => ({
    produto,
    kg_saca: p.kgSaca[produto],
    credito_presumido: p.credito[produto],
  }));
  const { data, error } = await supabase.from("parametros_produto").upsert(linhas, { onConflict: "produto" }).select("produto");
  if (error) throw falha(error, "Não foi possível salvar os parâmetros.");
  if (!data || !data.length) throw new Error("Somente administradores alteram os parâmetros.");
}

// ---------- tempo real ----------
/** Chama `aoMudar` (com pequeno atraso para agrupar) quando qualquer tabela muda. */
export function acompanharMudancas(aoMudar) {
  let t = null;
  const avisar = () => {
    clearTimeout(t);
    t = setTimeout(aoMudar, 300);
  };
  const canal = supabase
    .channel("vinculacoes")
    .on("postgres_changes", { event: "*", schema: "public", table: "contratos" }, avisar)
    .on("postgres_changes", { event: "*", schema: "public", table: "contratos_compra" }, avisar)
    .on("postgres_changes", { event: "*", schema: "public", table: "vinculos" }, avisar)
    .on("postgres_changes", { event: "*", schema: "public", table: "parametros_produto" }, avisar)
    .subscribe();
  return () => supabase.removeChannel(canal);
}

// ---------- perfil e usuários ----------
export const NOME_PERFIL = { admin: "Administrador", comercial: "Comercial", consulta: "Consulta" };

/** Perfil do usuário logado: { perfil, nome, ativo } ou null. */
export async function meuPerfil(userId) {
  const { data, error } = await supabase.from("perfis").select("perfil, nome, ativo").eq("user_id", userId).maybeSingle();
  if (error) throw falha(error, "Não foi possível ler seu perfil.");
  return data;
}

/** Chama a função segura admin-usuarios (só administradores). */
export async function adminUsuarios(acao, dados = {}) {
  const { data, error } = await supabase.functions.invoke("admin-usuarios", { body: { acao, ...dados } });
  if (error) {
    let msg = "";
    try {
      const corpo = await error.context.json();
      msg = corpo && corpo.erro;
    } catch (_) {}
    throw new Error(msg || traduzErro(error) || "Falha na função de usuários.");
  }
  if (data && data.erro) throw new Error(data.erro);
  return data;
}
