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
function contratoDoBanco(row) {
  return {
    id: row.id,
    produto: row.produto,
    data: row.data || "",
    numero: row.numero || "",
    comprador: row.comprador || "",
    cidade: row.cidade_entrega || "",
    volumeKg: num(row.volume_kg),
    preco: num(row.preco),
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    vendedores: (row.contrato_vendedores || [])
      .slice()
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((v) => ({
        id: v.id,
        data: v.data || "",
        numero: v.numero || "",
        nome: v.nome || "",
        cidade: v.cidade_retirada || "",
        volumeKg: num(v.volume_kg),
        preco: num(v.preco),
        fretePrev: num(v.frete_previsto),
        freteReal: num(v.frete_realizado),
      })),
  };
}

function contratoParaBanco(c) {
  return {
    contrato: {
      id: c.id || null,
      produto: c.produto,
      data: c.data || null,
      numero: c.numero || "",
      comprador: c.comprador,
      cidade_entrega: c.cidade || "",
      volume_kg: c.volumeKg,
      preco: c.preco,
    },
    vendedores: (c.vendedores || []).map((v) => ({
      id: v.id || null,
      data: v.data || null,
      numero: v.numero || "",
      nome: v.nome,
      cidade_retirada: v.cidade || "",
      volume_kg: v.volumeKg,
      preco: v.preco,
      frete_previsto: v.fretePrev,
      frete_realizado: v.freteReal,
    })),
  };
}

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
export async function carregarContratos() {
  const { data, error } = await supabase
    .from("contratos")
    .select(
      "id, produto, data, numero, comprador, cidade_entrega, volume_kg, preco, created_at, updated_at," +
        " contrato_vendedores (id, ordem, data, numero, nome, cidade_retirada, volume_kg, preco, frete_previsto, frete_realizado)"
    )
    .order("data", { ascending: false, nullsFirst: false });
  if (error) throw falha(error, "Não foi possível carregar os contratos.");
  return data.map(contratoDoBanco);
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
/** Salva contrato + vendedores numa transação (função salvar_contrato). Devolve o id. */
export async function salvarContrato(c) {
  const { contrato, vendedores } = contratoParaBanco(c);
  const { data, error } = await supabase.rpc("salvar_contrato", { p_contrato: contrato, p_vendedores: vendedores });
  if (error) throw falha(error, "Não foi possível salvar o contrato.");
  return data;
}

export async function excluirContrato(id) {
  const { error } = await supabase.from("contratos").delete().eq("id", id);
  if (error) throw falha(error, "Não foi possível excluir.");
}

export async function salvarFreteRealizado(vendedorId, valor) {
  const { data, error } = await supabase
    .from("contrato_vendedores")
    .update({ frete_realizado: valor })
    .eq("id", vendedorId)
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
    .on("postgres_changes", { event: "*", schema: "public", table: "contrato_vendedores" }, avisar)
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
