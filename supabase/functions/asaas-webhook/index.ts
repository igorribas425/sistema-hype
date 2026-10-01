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
    "Access-Control-Allow-Headers": "content-type, asaas-access-token, x-asaas-access-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index % Math.max(a.length, 1)] || 0) ^
      (b[index % Math.max(b.length, 1)] || 0);
  }
  return diff === 0;
}

function isPaidEvent(eventName: string, paymentStatus: string) {
  return ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED_IN_CASH"].includes(eventName) ||
    ["RECEIVED", "CONFIRMED"].includes(paymentStatus);
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendTicketEmail(ticket: any, event: any, lot: any) {
  const appsScriptUrl = Deno.env.get("HYPE_APPS_SCRIPT_URL");
  const webhookSecret = Deno.env.get("HYPE_WEBHOOK_SECRET");
  const email = String(ticket.email || "").trim().toLowerCase();
  if (!email.includes("@") || !appsScriptUrl || !webhookSecret) return false;
  const response = await fetch(appsScriptUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: webhookSecret,
      payment_status: "Pago",
      email,
      customer_name: ticket.customer_name,
      event_name: event?.name || "HYPE LOUNGE CLUB",
      artist_name: event?.artist_name || "",
      event_date: event?.event_date || "",
      opening_time: event?.opening_time || "",
      venue: event?.venue || "",
      lot_name: lot?.name || "Ingresso",
      sector: lot?.sector || "",
      price: Number(ticket.price || 0),
      ticket_code: ticket.ticket_code,
      qr_token: ticket.qr_token || ticket.ticket_code,
    }),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok && data?.ok === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "Método não permitido." }, 405);

  const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  if (!webhookToken) {
    return json(req, { ok: false, error: "Webhook Asaas não configurado." }, 503);
  }
  const receivedToken = req.headers.get("asaas-access-token") ||
    req.headers.get("x-asaas-access-token") || "";
  if (!constantTimeEqual(receivedToken, webhookToken)) {
    return json(req, { ok: false, error: "Webhook não autorizado." }, 401);
  }

  let eventRowId: number | null = null;
  try {
    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (_) {
      return json(req, { ok: false, error: "JSON inválido." }, 400);
    }
    const eventName = String(body?.event || "").trim().toUpperCase();
    const payment = body?.payment || {};
    const paymentStatus = String(payment?.status || "").trim().toUpperCase();
    const externalReference = String(payment?.externalReference ?? body?.externalReference ?? "").trim();
    if (!eventName || !payment?.id) {
      return json(req, { ok: false, error: "Evento Asaas incompleto." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("Configuração interna do Supabase ausente.");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const providerEventId = String(body?.id || `${eventName}:${payment.id}:${paymentStatus}`);
    const payloadHash = await sha256(rawBody);
    const claim = await supabase.from("payment_webhook_events").insert({
      provider_event_id: providerEventId,
      event_name: eventName,
      payment_id: String(payment.id),
      external_reference: externalReference || null,
      payload_hash: payloadHash,
    }).select("id").single();
    if (claim.error?.code === "23505") {
      return json(req, { ok: true, duplicate: true, provider_event_id: providerEventId });
    }
    if (claim.error) throw new Error(claim.error.message);
    eventRowId = Number(claim.data.id);

    if (!isPaidEvent(eventName, paymentStatus)) {
      await supabase.from("payment_webhook_events").update({
        status: "ignored",
        processed_at: new Date().toISOString(),
      }).eq("id", eventRowId);
      return json(req, { ok: true, ignored: true, event: eventName });
    }

    const description = String(payment?.description || "");
    const codeFromDescription = description.match(/HYPE-[A-Z0-9-]+/i)?.[0] || "";
    let ticketQuery = supabase.from("tickets").select(
      "id,event_id,lot_id,ticket_code,qr_token,customer_name,email,price,payment_status,paid_at,email_sent_at,asaas_payment_id",
    );
    if (/^\d+$/.test(externalReference)) ticketQuery = ticketQuery.eq("id", Number(externalReference));
    else ticketQuery = ticketQuery.ilike("ticket_code", externalReference || codeFromDescription);
    const ticketResult = await ticketQuery.maybeSingle();
    if (ticketResult.error) throw new Error(ticketResult.error.message);
    const ticket: any = ticketResult.data;
    if (!ticket) throw new Error("Não foi possível localizar o ingresso deste pagamento.");
    if (ticket.asaas_payment_id && String(ticket.asaas_payment_id) !== String(payment.id)) {
      throw new Error("O pagamento recebido não corresponde à cobrança do ingresso.");
    }

    if (ticket.payment_status !== "Pago") {
      const paidAt = ticket.paid_at || new Date().toISOString();
      const update = await supabase.from("tickets").update({
        payment_status: "Pago",
        paid_at: paidAt,
        asaas_payment_id: String(payment.id),
        payment_method: "PIX Asaas",
      }).eq("id", ticket.id).eq("payment_status", "Pendente");
      if (update.error) throw new Error(update.error.message);
      ticket.payment_status = "Pago";
      ticket.paid_at = paidAt;
    }

    await supabase.from("payment_webhook_events").update({
      ticket_id: ticket.id,
      status: "processed",
      processed_at: new Date().toISOString(),
    }).eq("id", eventRowId);

    let emailSent = Boolean(ticket.email_sent_at);
    if (!emailSent) {
      const [eventResult, lotResult] = await Promise.all([
        supabase.from("events").select("name,artist_name,event_date,opening_time,venue").eq("id", ticket.event_id).maybeSingle(),
        supabase.from("ticket_lots").select("name,sector").eq("id", ticket.lot_id).maybeSingle(),
      ]);
      emailSent = await sendTicketEmail(ticket, eventResult.data, lotResult.data).catch(() => false);
      if (emailSent) {
        await supabase.from("tickets").update({ email_sent_at: new Date().toISOString() }).eq("id", ticket.id);
      }
    }
    return json(req, { ok: true, paid: true, email_sent: emailSent, ticket_id: ticket.id });
  } catch (error) {
    if (eventRowId) {
      try {
        const url = Deno.env.get("SUPABASE_URL") || "";
        const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        if (url && key) {
          await createClient(url, key).from("payment_webhook_events").update({
            status: "failed",
            error_message: String(error instanceof Error ? error.message : error).slice(0, 500),
            processed_at: new Date().toISOString(),
          }).eq("id", eventRowId);
        }
      } catch (_) {
        // Preserve the original processing error.
      }
    }
    return json(req, { ok: false, error: error instanceof Error ? error.message : "Erro no webhook Asaas." }, 500);
  }
});
