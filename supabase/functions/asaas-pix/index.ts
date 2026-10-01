import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const DEFAULT_ORIGINS = [
  "https://hypeloungeclub.com.br",
  "https://www.hypeloungeclub.com.br",
];

function allowedOrigins() {
  return new Set(
    (Deno.env.get("HYPE_ALLOWED_ORIGINS") || DEFAULT_ORIGINS.join(","))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = allowedOrigins();
  return {
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : DEFAULT_ORIGINS[0],
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

function asaasError(data: any) {
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors
      .map((item: any) => item?.description || item?.message || item?.code)
      .filter(Boolean)
      .join(" | ");
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
  headers.set("User-Agent", "Hype Lounge Club");
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(asaasError(data));
  return data;
}

async function getOrCreateCustomer(ticket: any) {
  const cpf = digits(ticket.cpf);
  if (cpf.length === 11 || cpf.length === 14) {
    const found = await asaasRequest(`/customers?cpfCnpj=${encodeURIComponent(cpf)}&limit=1`);
    if (found?.data?.[0]?.id) return String(found.data[0].id);
  }
  const customer: Record<string, string> = {
    name: String(ticket.customer_name || "Cliente Hype").trim(),
  };
  const email = String(ticket.email || "").trim();
  const phone = digits(ticket.phone);
  if (email.includes("@")) customer.email = email;
  if (phone.length >= 10) customer.mobilePhone = phone;
  if (cpf.length === 11 || cpf.length === 14) customer.cpfCnpj = cpf;
  const created = await asaasRequest("/customers", {
    method: "POST",
    body: JSON.stringify(customer),
  });
  if (!created?.id) throw new Error("Asaas não retornou o ID do cliente.");
  return String(created.id);
}

async function findPayment(ticket: any) {
  if (ticket.asaas_payment_id) {
    try {
      return await asaasRequest(`/payments/${encodeURIComponent(ticket.asaas_payment_id)}`);
    } catch (_) {
      // A busca por externalReference recupera cobranças antigas ou removidas.
    }
  }
  const result = await asaasRequest(
    `/payments?externalReference=${encodeURIComponent(String(ticket.id))}&limit=10`,
  );
  return Array.isArray(result?.data)
    ? result.data.find((item: any) => item?.billingType === "PIX" && item?.status !== "DELETED") || null
    : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { success: false, error: "Método não permitido." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const ticketId = Number(body?.ticket_id);
    const ticketToken = String(body?.ticket_token || "").trim();
    if (!Number.isInteger(ticketId) || ticketId <= 0 || ticketToken.length < 20) {
      return json(req, { success: false, error: "Ingresso ou token inválido." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("Configuração interna do Supabase ausente.");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await supabase
      .from("tickets")
      .select("id,ticket_code,qr_token,customer_name,phone,email,cpf,price,payment_status,asaas_payment_id")
      .eq("id", ticketId)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    const ticket: any = result.data;
    if (!ticket) return json(req, { success: false, error: "Ingresso não encontrado." }, 404);
    if (!constantTimeEqual(ticketToken, String(ticket.qr_token || ""))) {
      return json(req, { success: false, error: "Ingresso não autorizado." }, 403);
    }
    if (ticket.payment_status !== "Pendente") {
      return json(req, { success: false, error: "Este ingresso não está pendente." }, 409);
    }

    const value = Number(ticket.price || 0);
    if (!Number.isFinite(value) || value <= 0) {
      return json(req, { success: false, error: "Valor do ingresso inválido." }, 400);
    }

    let payment = await findPayment(ticket);
    if (!payment) {
      const customerId = await getOrCreateCustomer(ticket);
      const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      payment = await asaasRequest("/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: customerId,
          billingType: "PIX",
          value,
          dueDate,
          description: `Ingresso ${ticket.ticket_code || ticket.id} - Hype Lounge Club`,
          externalReference: String(ticket.id),
        }),
      });
    }
    if (!payment?.id) throw new Error("Asaas não retornou o ID da cobrança.");

    const pix = await asaasRequest(`/payments/${encodeURIComponent(payment.id)}/pixQrCode`);
    if (!pix?.payload) throw new Error("Asaas não retornou o PIX Copia e Cola.");
    const updated = await supabase
      .from("tickets")
      .update({ asaas_payment_id: String(payment.id), payment_method: "PIX Asaas" })
      .eq("id", ticket.id)
      .eq("payment_status", "Pendente");
    if (updated.error) throw new Error(updated.error.message);

    return json(req, {
      success: true,
      ticket_id: ticket.id,
      ticket_code: ticket.ticket_code,
      payment_id: payment.id,
      payment_status: payment.status || "PENDING",
      qr_code: pix.payload,
      qr_code_base64: pix.encodedImage || null,
      expiration_date: pix.expirationDate || null,
    });
  } catch (error) {
    return json(req, {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar PIX no Asaas.",
    }, 500);
  }
});
