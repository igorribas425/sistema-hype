import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const BUCKET = "hype-guest-photos-v50";
const MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_ORIGINS = ["https://hypeloungeclub.com.br", "https://www.hypeloungeclub.com.br"];
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function firstRow(value: unknown): any {
  return Array.isArray(value) ? value[0] : value;
}

function validImageSignature(bytes: Uint8Array, mime: string) {
  if (mime === "image/png") {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mime === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/webp") {
    return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function requiredText(form: FormData, name: string, maxLength: number) {
  return String(form.get(name) || "").trim().slice(0, maxLength);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "Método não permitido." }, 405);

  let uploadedPath = "";
  let supabase: any = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("Configuração interna do Supabase ausente.");
    supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const form = await req.formData();
    if (requiredText(form, "website", 100)) return json(req, { ok: false, error: "Não foi possível concluir o cadastro." }, 400);
    const eventId = Number(requiredText(form, "event_id", 20));
    const name = requiredText(form, "name", 160);
    const cpf = digits(form.get("cpf"));
    const phone = digits(form.get("phone"));
    const gender = requiredText(form, "gender", 30);
    const email = requiredText(form, "email", 200).toLowerCase();
    const instagram = requiredText(form, "instagram", 120);
    const consent = String(form.get("photo_consent") || "").toLowerCase() === "true";
    const photo = form.get("photo");

    if (!Number.isInteger(eventId) || eventId <= 0) throw new Error("Selecione uma festa.");
    if (!consent) throw new Error("Aceite o uso da foto para análise.");
    if (!(photo instanceof File) || !photo.size) throw new Error("Envie uma foto.");
    const mime = String(photo.type || "").toLowerCase();
    if (!MIME_EXTENSIONS[mime] || photo.size > MAX_BYTES) throw new Error("A foto deve ser JPG, PNG ou WebP de até 5 MB.");

    const bytes = new Uint8Array(await photo.arrayBuffer());
    if (!validImageSignature(bytes, mime)) throw new Error("O arquivo enviado não é uma imagem válida.");
    uploadedPath = `guest-list-v50/${eventId}/${crypto.randomUUID()}.${MIME_EXTENSIONS[mime]}`;
    const upload = await supabase.storage.from(BUCKET).upload(uploadedPath, bytes, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);

    const result = await supabase.rpc("public_guest_registration_submit_v50", {
      p_event_id: eventId,
      p_name: name,
      p_cpf: cpf,
      p_phone: phone,
      p_gender: gender,
      p_email: email,
      p_instagram: instagram,
      p_photo_path: uploadedPath,
      p_photo_consent: true,
    });
    if (result.error) throw new Error(result.error.message);
    const row = firstRow(result.data) || {};
    if (row.ok !== true) throw new Error(row.message || "Não foi possível concluir o cadastro.");

    return json(req, {
      ok: true,
      message: row.message || "Cadastro recebido e enviado para análise.",
      list_id: row.list_id || null,
      event_id: row.event_id || eventId,
      event_name: row.event_name || "",
      status: row.status || "Pendente",
    });
  } catch (error) {
    if (uploadedPath && supabase) {
      await supabase.storage.from(BUCKET).remove([uploadedPath]).catch(() => undefined);
    }
    return json(req, { ok: false, error: error instanceof Error ? error.message : "Não foi possível concluir o cadastro." }, 400);
  }
});
