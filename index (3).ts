import { createClient } from "npm:@supabase/supabase-js@2";

/*
  HYPE V36 - ESTORNO ASAAS -> FEMININO FREE

  Segurança:
  - O navegador envia usuario/senha da sessao do Admin.
  - A funcao valida verify_staff no Supabase e exige role=admin.
  - ASAAS_API_KEY continua somente nos Secrets da Edge Function.

  Fluxo:
  Admin confirma -> procura a cobranca PIX pelo externalReference=ticket.id ->
  solicita estorno total no Asaas -> mantem o ingresso PAGO, muda valor para 0
  e marca como Feminino FREE.
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asaasError(data: any) {
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors
      .map((e: any) => e?.description || e?.message || e?.code)
      .filter(Boolean)
      .join(" | ");
  }
  return data?.message || data?.error || "Erro na API do Asaas.";
}

async function asaasRequest(path: string, options: RequestInit = {}) {
  const apiKey = Deno.env.get("ASAAS_API_KEY") || Deno.env.get("ASAAS_ACCESS_TOKEN");
  if (!apiKey) throw new Error("Secret ASAAS_API_KEY nao configurado no Supabase.");

  const headers = new Headers(options.headers || {});
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  headers.set("access_token", apiKey);
  headers.set("User-Agent", "Hype Lounge Club");

  const response = await fetch(`https://api.asaas.com/v3${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("ASAAS REFUND", response.status, data);
    throw new Error(asaasError(data));
  }
  return data;
}

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Metodo nao permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("Configuracao interna do Supabase ausente.");

    const body = await req.json().catch(() => ({}));
    const ticketId = Number(body?.ticket_id || 0);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");

    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return json({ success: false, error: "ticket_id invalido." }, 400);
    }
    if (!username || !password) {
      return json({ success: false, error: "Sessao do Admin ausente." }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const auth = await supabase.rpc("verify_staff", {
      p_username: username,
      p_password: password,
    });
    if (auth.error) throw new Error(auth.error.message);
    const staff = Array.isArray(auth.data) ? auth.data[0] : auth.data;
    if (!staff || String(staff.role || "") !== "admin") {
      return json({ success: false, error: "Somente Admin pode fazer estorno." }, 403);
    }

    const ticketResult = await supabase
      .from("tickets")
      .select("id,event_id,ticket_code,customer_name,gender,price,service_fee,payment_status,payment_method,refund_status,refund_amount,free_after_refund")
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketResult.error) throw new Error(ticketResult.error.message);
    const ticket: any = ticketResult.data;
    if (!ticket) return json({ success: false, error: "Ingresso nao encontrado." }, 404);

    if (String(ticket.gender || "") !== "Feminino") {
      return json({ success: false, error: "Este recurso e somente para ingresso Feminino." }, 409);
    }
    if (String(ticket.payment_status || "") !== "Pago") {
      return json({ success: false, error: "Somente ingresso Pago pode ser estornado." }, 409);
    }

    if (ticket.free_after_refund || Number(ticket.refund_amount || 0) > 0) {
      return json({
        success: true,
        already_refunded: true,
        ticket_id: ticket.id,
        ticket_code: ticket.ticket_code,
        refund_status: ticket.refund_status || "REFUND_REQUESTED",
        refund_amount: Number(ticket.refund_amount || 0),
      });
    }

    if (!(Number(ticket.price || 0) > 0)) {
      return json({ success: false, error: "Este ingresso ja esta FREE e nao possui valor para estornar." }, 409);
    }

    const payments = await asaasRequest(
      `/payments?externalReference=${encodeURIComponent(String(ticket.id))}&limit=20`,
    );
    const list = Array.isArray(payments?.data) ? payments.data : [];
    const payment = list.find((p: any) =>
      String(p?.billingType || "").toUpperCase() === "PIX" &&
      normalizeStatus(p?.status) !== "DELETED"
    );

    if (!payment?.id) {
      return json({
        success: false,
        error: "Nao encontrei no Asaas o PIX deste ingresso. Ele pode ter sido pago manualmente fora do Asaas.",
      }, 404);
    }

    const paymentStatus = normalizeStatus(payment.status);
    const fullValue = Number(payment.value || ticket.price || 0);
    if (!(fullValue > 0)) throw new Error("Valor do pagamento Asaas invalido para estorno.");

    let refundResponse: any = payment;
    let refundStatus = paymentStatus;

    if (!["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS"].includes(paymentStatus)) {
      refundResponse = await asaasRequest(`/payments/${encodeURIComponent(payment.id)}/refund`, {
        method: "POST",
        body: JSON.stringify({
          value: fullValue,
          description: `HYPE - Feminino convertido para FREE - ${ticket.ticket_code || ticket.id}`,
        }),
      });
      refundStatus = normalizeStatus(refundResponse?.status || "REFUND_REQUESTED") || "REFUND_REQUESTED";
      if (!["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "PARTIALLY_REFUNDED"].includes(refundStatus)) {
        refundStatus = "REFUND_REQUESTED";
      }
    }

    const nowIso = new Date().toISOString();
    const finalRefunded = refundStatus === "REFUNDED";
    const update = await supabase
      .from("tickets")
      .update({
        price: 0,
        service_fee: 0,
        payment_status: "Pago",
        payment_method: "Feminino FREE (estorno Asaas)",
        refund_status: refundStatus || "REFUND_REQUESTED",
        refund_amount: fullValue,
        refund_requested_at: nowIso,
        refunded_at: finalRefunded ? nowIso : null,
        refund_asaas_payment_id: String(payment.id),
        free_after_refund: true,
        free_reason: "FEMININO_FREE_ESTORNO_ASAAS",
      })
      .eq("id", ticket.id);

    if (update.error) {
      throw new Error(`Asaas aceitou o estorno, mas falhou ao atualizar o ingresso: ${update.error.message}`);
    }

    try {
      await supabase.from("audit_logs").insert({
        staff_user_id: staff.id || null,
        action: "ASAAS_ESTORNO_FEMININO_FREE_V36",
        ticket_id: ticket.id,
        metadata: {
          event_id: ticket.event_id,
          ticket_code: ticket.ticket_code,
          asaas_payment_id: payment.id,
          refund_amount: fullValue,
          refund_status: refundStatus,
        },
      });
    } catch (_) {}

    return json({
      success: true,
      ticket_id: ticket.id,
      ticket_code: ticket.ticket_code,
      customer_name: ticket.customer_name,
      payment_id: payment.id,
      refund_amount: fullValue,
      refund_status: refundStatus || "REFUND_REQUESTED",
      ticket_kept_valid: true,
      converted_to_free: true,
    });
  } catch (error) {
    console.error(error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao solicitar estorno no Asaas.",
    }, 500);
  }
});
