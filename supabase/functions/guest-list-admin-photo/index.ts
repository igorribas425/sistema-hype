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
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function firstRow(value: unknown): any {
  return Array.isArray(value) ? value[0] : value;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("Configuração interna do Supabase ausente.");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    const listId = Number(body?.list_id || 0);
    if (!username || !password || !Number.isInteger(listId) || listId <= 0) {
      return json(req, { ok: false, error: "Credenciais ou cadastro inválido." }, 400);
    }

    const staffResult = await supabase.rpc("verify_staff", { p_username: username, p_password: password });
    if (staffResult.error) throw new Error(staffResult.error.message);
    const staff = firstRow(staffResult.data);
    if (!staff || String(staff.role || "") !== "admin") return json(req, { ok: false, error: "Sem permissão." }, 403);

    const candidate = await supabase.from("guest_list_simple_v406")
      .select("id,status,photo_path")
      .eq("id", listId)
      .maybeSingle();
    if (candidate.error) throw new Error(candidate.error.message);
    if (!candidate.data || candidate.data.status === "Cancelado" || !candidate.data.photo_path) {
      return json(req, { ok: false, error: "Foto não disponível para este cadastro." }, 404);
    }

    const signed = await supabase.storage.from(BUCKET).createSignedUrl(candidate.data.photo_path, 300);
    if (signed.error) throw new Error(signed.error.message);
    return json(req, { ok: true, signed_url: signed.data?.signedUrl || "", expires_in: 300 });
  } catch (error) {
    return json(req, { ok: false, error: error instanceof Error ? error.message : "Não foi possível abrir a foto." }, 400);
  }
});
