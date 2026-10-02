import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const BUCKET = "hype-guest-photos-v50";
const DEFAULT_ORIGINS = ["https://hypeloungeclub.com.br", "https://www.hypeloungeclub.com.br"];

function corsHeaders(req: Request) {
  const origins = new Set(
    (Deno.env.get("HYPE_ALLOWED_ORIGINS") || DEFAULT_ORIGINS.join(","))
      .split(",").map((value) => value.trim()).filter(Boolean),
  );
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": origins.has(origin) ? origin : DEFAULT_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: corsHeaders(req)});
}

function firstRow(value: unknown): any {
  return Array.isArray(value) ? value[0] : value;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers: corsHeaders(req)});
  if (req.method !== "POST") return json(req, {ok: false, error: "Método não permitido."}, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("Configuração interna do Supabase ausente.");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: {persistSession: false, autoRefreshToken: false},
    });
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    const listId = Number(body?.list_id || 0);
    if (!username || !password || !Number.isInteger(listId) || listId <= 0) {
      return json(req, {ok: false, error: "Credenciais ou cadastro inválido."}, 400);
    }

    const staffResult = await supabase.rpc("verify_staff", {p_username: username, p_password: password});
    if (staffResult.error) throw new Error(staffResult.error.message);
    const staff = firstRow(staffResult.data);
    if (!staff || String(staff.role || "") !== "admin") return json(req, {ok: false, error: "Sem permissão."}, 403);

    const result = await supabase.rpc("staff_guest_registration_delete_v51", {
      p_username: username,
      p_password: password,
      p_list_id: listId,
    });
    if (result.error) throw new Error(result.error.message);
    const deleted = firstRow(result.data);
    if (!deleted?.ok) return json(req, {ok: false, error: deleted?.message || "Cadastro não encontrado."}, 404);

    let photoDeleted = true;
    if (deleted.photo_path) {
      const removed = await supabase.storage.from(BUCKET).remove([String(deleted.photo_path)]);
      photoDeleted = !removed.error;
    }
    return json(req, {
      ok: true,
      list_id: deleted.list_id,
      event_id: deleted.event_id,
      message: deleted.message || "Cadastro excluído.",
      photo_deleted: photoDeleted,
    });
  } catch (error) {
    return json(req, {ok: false, error: error instanceof Error ? error.message : "Não foi possível excluir o cadastro."}, 400);
  }
});
