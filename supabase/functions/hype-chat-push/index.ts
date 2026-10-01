import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

function firstRow(data: any) {
  return Array.isArray(data) ? data[0] : data;
}

async function authorize(supabase: any, body: any) {
  const role = String(body?.role || body?.senderRole || "").trim().toLowerCase();
  if (role === "admin") {
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    if (!username || !password) return null;
    const result = await supabase.rpc("verify_staff", {
      p_username: username,
      p_password: password,
    });
    if (result.error) throw new Error(result.error.message);
    const staff = firstRow(result.data);
    if (!staff || !["admin", "gerente", "caixa"].includes(String(staff.role || ""))) return null;
    return { role: "admin", name: String(staff.name || staff.username || "Admin").slice(0, 80) };
  }
  if (role === "portaria") {
    const deviceKey = String(body?.device_key || "").trim();
    if (deviceKey.length < 20) return null;
    const result = await supabase.rpc("portaria_device_status_v18", { p_device_key: deviceKey });
    if (result.error) throw new Error(result.error.message);
    const device = firstRow(result.data);
    if (!device?.active) return null;
    return { role: "portaria", name: String(device.label || "Portaria").slice(0, 80) };
  }
  return null;
}

function b64urlToBytes(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToB64url(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createVapidJwt(audience: string) {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@hypeloungeclub.com.br";
  if (!publicKey || !privateKey) throw new Error("VAPID não configurado.");
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })));
  const unsigned = `${header}.${payload}`;
  const privateBytes = b64urlToBytes(privateKey);
  const publicBytes = b64urlToBytes(publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new Error("VAPID_PUBLIC_KEY inválida.");
  const key = await crypto.subtle.importKey("jwk", {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(publicBytes.slice(1, 33)),
    y: bytesToB64url(publicBytes.slice(33, 65)),
    d: bytesToB64url(privateBytes),
    ext: false,
    key_ops: ["sign"],
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${bytesToB64url(signature)}`;
}

async function sendPush(endpoint: string) {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const jwt = await createVapidJwt(new URL(endpoint).origin);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "TTL": "120",
      "Urgency": "high",
      "Authorization": `vapid t=${jwt}, k=${publicKey}`,
    },
  });
  return { ok: response.ok, status: response.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "Método não permitido." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
    if (!["subscribe", "send"].includes(action)) {
      return json(req, { ok: false, error: "Ação inválida." }, 404);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("Configuração interna do Supabase ausente.");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const actor = await authorize(supabase, body);
    if (!actor) return json(req, { ok: false, error: "Acesso não autorizado." }, 403);

    if (action === "subscribe") {
      const endpoint = String(body?.endpoint || "").trim();
      const p256dh = String(body?.keys?.p256dh || "").trim();
      const auth = String(body?.keys?.auth || "").trim();
      try {
        if (new URL(endpoint).protocol !== "https:") throw new Error("invalid");
      } catch (_) {
        return json(req, { ok: false, error: "Endpoint push inválido." }, 400);
      }
      if (!p256dh || !auth) return json(req, { ok: false, error: "Chaves push ausentes." }, 400);
      const now = new Date().toISOString();
      const result = await supabase.from("hype_chat_push_subscriptions_v42").upsert({
        endpoint,
        p256dh,
        auth,
        role: actor.role,
        user_agent: String(body?.userAgent || "").slice(0, 800),
        active: true,
        updated_at: now,
        last_seen_at: now,
        disabled_at: null,
      }, { onConflict: "endpoint" });
      if (result.error) throw new Error(result.error.message);
      return json(req, { ok: true });
    }

    const message = String(body?.message || "").trim();
    if (!message || message.length > 1200) {
      return json(req, { ok: false, error: message ? "Mensagem muito longa." : "Digite uma mensagem." }, 400);
    }
    const senderEndpoint = String(body?.endpoint || "");
    const inserted = await supabase.from("internal_chat_v41").insert({
      sender_role: actor.role,
      sender_name: actor.name,
      message_text: message,
    }).select("id").single();
    if (inserted.error) throw new Error(inserted.error.message);
    const subscriptions = await supabase.from("hype_chat_push_subscriptions_v42")
      .select("id,endpoint").eq("active", true);
    if (subscriptions.error) throw new Error(subscriptions.error.message);
    let sent = 0;
    let failed = 0;
    for (const subscription of subscriptions.data || []) {
      if (!subscription.endpoint || subscription.endpoint === senderEndpoint) continue;
      try {
        const result = await sendPush(subscription.endpoint);
        if (result.ok) sent += 1;
        else {
          failed += 1;
          if ([404, 410].includes(result.status)) {
            await supabase.from("hype_chat_push_subscriptions_v42").update({
              active: false,
              disabled_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", subscription.id);
          }
        }
      } catch (_) {
        failed += 1;
      }
    }
    return json(req, { ok: true, message_id: inserted.data?.id || null, sent, failed });
  } catch (error) {
    return json(req, { ok: false, error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
});
