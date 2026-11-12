// =====================================================================
//  Função "admin-usuarios" (Supabase Edge Function)
//  Gerencia usuários do sistema. Só quem tem perfil "admin" ativo usa.
//  Roda no servidor do Supabase com a chave service_role, que NUNCA
//  vai para o navegador.
//
//  Ações (POST JSON { acao, ... }):
//    listar
//    criar            { email, senha, nome, perfil }
//    atualizar        { user_id, nome?, perfil?, ativo? }
//    redefinir_senha  { user_id, senha }
//    enviar_link      { email, redirect_to }
//    excluir          { user_id }
// =====================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PERFIS = ["admin", "comercial", "consulta"];
const BANIDO = "876000h"; // ~100 anos = usuário inativo

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const erro = (mensagem: string, status = 400) => json({ erro: mensagem }, status);

const emailValido = (e: unknown) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const senhaValida = (s: unknown) => typeof s === "string" && s.length >= 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro("Método não permitido.", 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Quem está chamando?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return erro("Faça login novamente.", 401);
  const { data: quem, error: erroAuth } = await admin.auth.getUser(token);
  if (erroAuth || !quem?.user) return erro("Sessão expirada. Faça login novamente.", 401);
  const eu = quem.user;

  const { data: meuPerfil } = await admin.from("perfis").select("perfil, ativo").eq("user_id", eu.id).maybeSingle();
  if (!meuPerfil || !meuPerfil.ativo || meuPerfil.perfil !== "admin") {
    return erro("Apenas administradores podem gerenciar usuários.", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erro("Requisição inválida.");
  }

  // Garante que sempre sobra pelo menos 1 administrador ativo
  async function outrosAdminsAtivos(excetoId: string) {
    const { count } = await admin
      .from("perfis")
      .select("user_id", { count: "exact", head: true })
      .eq("perfil", "admin")
      .eq("ativo", true)
      .neq("user_id", excetoId);
    return count ?? 0;
  }

  try {
    switch (body.acao) {
      // -------------------------------------------------------------
      case "listar": {
        const usuarios: any[] = [];
        for (let page = 1; page <= 20; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) throw error;
          usuarios.push(...data.users);
          if (data.users.length < 200) break;
        }
        const { data: perfis, error } = await admin.from("perfis").select("user_id, nome, perfil, ativo");
        if (error) throw error;
        const porId = new Map(perfis.map((p) => [p.user_id, p]));
        const lista = usuarios
          .map((u) => {
            const p = porId.get(u.id);
            return {
              user_id: u.id,
              email: u.email ?? "",
              nome: p?.nome || (u.user_metadata?.nome ?? ""),
              perfil: p?.perfil ?? null,
              ativo: p ? p.ativo : false,
              criado_em: u.created_at,
              ultimo_acesso: u.last_sign_in_at ?? null,
              confirmado: !!u.email_confirmed_at,
              sou_eu: u.id === eu.id,
            };
          })
          .sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, "pt-BR"));
        return json({ usuarios: lista });
      }

      // -------------------------------------------------------------
      case "criar": {
        const email = String(body.email ?? "").trim().toLowerCase();
        const nome = String(body.nome ?? "").trim();
        const perfil = String(body.perfil ?? "consulta");
        if (!emailValido(email)) return erro("E-mail inválido.");
        if (!senhaValida(body.senha)) return erro("A senha precisa ter pelo menos 8 caracteres.");
        if (!PERFIS.includes(perfil)) return erro("Perfil inválido.");

        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: String(body.senha),
          email_confirm: true,
          user_metadata: { nome },
        });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) return erro("Já existe um usuário com esse e-mail.");
          throw error;
        }
        const { error: e2 } = await admin
          .from("perfis")
          .upsert({ user_id: data.user.id, email, nome, perfil, ativo: true }, { onConflict: "user_id" });
        if (e2) throw e2;
        return json({ ok: true, user_id: data.user.id });
      }

      // -------------------------------------------------------------
      case "atualizar": {
        const id = String(body.user_id ?? "");
        if (!id) return erro("Usuário não informado.");
        const mudanca: Record<string, unknown> = {};
        if (typeof body.nome === "string") mudanca.nome = body.nome.trim();
        if (body.perfil !== undefined) {
          if (!PERFIS.includes(String(body.perfil))) return erro("Perfil inválido.");
          mudanca.perfil = body.perfil;
        }
        if (typeof body.ativo === "boolean") mudanca.ativo = body.ativo;

        const tiraAdmin = (mudanca.perfil && mudanca.perfil !== "admin") || mudanca.ativo === false;
        if (tiraAdmin) {
          const { data: atual } = await admin.from("perfis").select("perfil, ativo").eq("user_id", id).maybeSingle();
          if (atual?.perfil === "admin" && atual.ativo && (await outrosAdminsAtivos(id)) === 0) {
            return erro("Precisa existir pelo menos um administrador ativo.");
          }
        }

        const { data: u } = await admin.auth.admin.getUserById(id);
        if (!u?.user) return erro("Usuário não encontrado.", 404);
        const { error } = await admin
          .from("perfis")
          .upsert({ user_id: id, email: u.user.email ?? "", ...mudanca }, { onConflict: "user_id" });
        if (error) throw error;

        if (typeof mudanca.ativo === "boolean") {
          const { error: e3 } = await admin.auth.admin.updateUserById(id, {
            ban_duration: mudanca.ativo ? "none" : BANIDO,
          });
          if (e3) throw e3;
        }
        if (typeof mudanca.nome === "string") {
          await admin.auth.admin.updateUserById(id, { user_metadata: { ...u.user.user_metadata, nome: mudanca.nome } });
        }
        return json({ ok: true });
      }

      // -------------------------------------------------------------
      case "redefinir_senha": {
        const id = String(body.user_id ?? "");
        if (!senhaValida(body.senha)) return erro("A senha precisa ter pelo menos 8 caracteres.");
        const { error } = await admin.auth.admin.updateUserById(id, { password: String(body.senha) });
        if (error) throw error;
        return json({ ok: true });
      }

      // -------------------------------------------------------------
      case "enviar_link": {
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!emailValido(email)) return erro("E-mail inválido.");
        const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to : undefined;
        const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        return json({ ok: true });
      }

      // -------------------------------------------------------------
      case "excluir": {
        const id = String(body.user_id ?? "");
        if (!id) return erro("Usuário não informado.");
        if (id === eu.id) return erro("Você não pode excluir o seu próprio usuário.");
        const { data: alvo } = await admin.from("perfis").select("perfil, ativo").eq("user_id", id).maybeSingle();
        if (alvo?.perfil === "admin" && alvo.ativo && (await outrosAdminsAtivos(id)) === 0) {
          return erro("Precisa existir pelo menos um administrador ativo.");
        }
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return erro("Ação desconhecida.");
    }
  } catch (e) {
    console.error(e);
    return erro("Erro no servidor: " + (e instanceof Error ? e.message : String(e)), 500);
  }
});
