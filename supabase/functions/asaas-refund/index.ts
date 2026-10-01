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

function asaasError(data: any) {
  if (Array.isArray(data?.errors)) {
    return data.errors.map((item: any) => item?.description || item?.message || item?.code)
      .filter(Boolean).join(" | ");
  }
  return data?.message || data?.error || "Erro na API do Asaas.";
}

async function asaasRequest(path: string, options: RequestInit = {}) {
  const apiKey = Deno.env.get("ASAAS_API_KEY") || Deno.env.get("ASAAS_ACCESS_TOKEN");
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurada.");
  const baseUrl = (Deno.env.get("ASAAS_API_URL") || "https://api.asaas.com/v3").replace(/\/$/, "");
  const headers = new Headers(options.headers || {});
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  headers.set("access_token", apiKey);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(asaasError(data));
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { success: false, error: "Método não permitido." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const ticketId = Number(body?.ticket_id || 0);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    if (!Number.isInteger(ticketId) || ticketId <= 0 || !username || !password) {
      return json(req, { success: false, error: "Dados obrigatórios ausentes." }, 400);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("Configuração interna do Supabase ausente.");
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
      return json(req, { success: false, error: "Somente o admin pode solicitar estorno." }, 403);
    }
    const ticketResult = await supabase.from("tickets").select(
      "id,event_id,ticket_code,customer_name,gender,price,service_fee,payment_status,payment_method,asaas_payment_id,refund_status,refund_amount,free_after_refund",
    ).eq("id", ticketId).maybeSingle();
    if (ticketResult.error) throw new Error(ticketResult.error.message);
    const ticket: any = ticketResult.data;
    if (!ticket) return json(req, { success: false, error: "Ingresso não encontrado." }, 404);
    if (ticket.gender !== "Feminino" || ticket.payment_status !== "Pago") {
      return json(req, { success: false, error: "Somente ingresso feminino pago pode ser estornado." }, 409);
    }
    if (ticket.free_after_refund || Number(ticket.refund_amount || 0) > 0) {
      return json(req, {
        success: true,
        already_refunded: true,
        ticket_id: ticket.id,
        refund_status: ticket.refund_status || "REFUND_REQUESTED",
      });
    }
    if (!(Number(ticket.price || 0) > 0)) {
      return json(req, { success: false, error: "Este ingresso não possui valor para estornar." }, 409);
    }
    let payment: any = null;
    if (ticket.asaas_payment_id) {
      payment = await asaasRequest(`/payments/${encodeURIComponent(ticket.asaas_payment_id)}`);
    } else {
      const payments = await asaasRequest(
        `/payments?externalReference=${encodeURIComponent(String(ticket.id))}&limit=20`,
      );
      payment = (payments?.data || []).find((item: any) =>
        String(item?.billingType || "").toUpperCase() === "PIX" &&
        String(item?.status || "").toUpperCase() !== "DELETED"
      );
    }
    if (!payment?.id) return json(req, { success: false, error: "PIX do ingresso não encontrado no Asaas." }, 404);
    const amount = Number(payment.value || ticket.price || 0);
    let refundStatus = String(payment.status || "").toUpperCase();
    if (!["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS"].includes(refundStatus)) {
      const refunded = await asaasRequest(`/payments/${encodeURIComponent(payment.id)}/refund`, {
        method: "POST",
        body: JSON.stringify({
          value: amount,
          description: `HYPE - Feminino convertido para FREE - ${ticket.ticket_code}`,
        }),
      });
      refundStatus = String(refunded?.status || "REFUND_REQUESTED").toUpperCase();
    }
    const now = new Date().toISOString();
    const update = await supabase.from("tickets").update({
      price: 0,
      service_fee: 0,
      payment_status: "Pago",
      payment_method: "Feminino FREE (estorno Asaas)",
      refund_status: refundStatus || "REFUND_REQUESTED",
      refund_amount: amount,
      refund_requested_at: now,
      refunded_at: refundStatus === "REFUNDED" ? now : null,
      refund_asaas_payment_id: String(payment.id),
      free_after_refund: true,
      free_reason: "FEMININO_FREE_ESTORNO_ASAAS",
    }).eq("id", ticket.id);
    if (update.error) throw new Error(update.error.message);
    return json(req, {
      success: true,
      ticket_id: ticket.id,
      ticket_code: ticket.ticket_code,
      refund_amount: amount,
      refund_status: refundStatus,
      ticket_kept_valid: true,
      converted_to_free: true,
    });
  } catch (error) {
    return json(req, { success: false, error: error instanceof Error ? error.message : "Erro ao solicitar estorno." }, 500);
  }
});
