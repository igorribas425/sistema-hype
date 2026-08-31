import { createClient } from "npm:@supabase/supabase-js@2";

/*
  HYPE V11 - ASAAS WEBHOOK + E-MAIL AUTOMÁTICO

  Fluxo:
  Asaas confirma o pagamento -> webhook recebe o evento ->
  ticket vira "Pago" -> Gmail/Apps Script recebe os dados ->
  email_sent_at é gravado -> site mostra que a cópia foi enviada.

  IMPORTANTE:
  - Esta função deve se chamar: asaas-webhook
  - Deploy com Verify JWT DESATIVADO, pois o Asaas não envia JWT do Supabase.
  - Secrets usados:
      SUPABASE_URL
      SUPABASE_SERVICE_ROLE_KEY
      HYPE_APPS_SCRIPT_URL
      HYPE_WEBHOOK_SECRET
    Opcional:
      ASAAS_WEBHOOK_TOKEN
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token, x-asaas-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPaidEvent(eventName: string, paymentStatus: string) {
  const paidEvents = new Set([
    "PAYMENT_RECEIVED",
    "PAYMENT_CONFIRMED",
    "PAYMENT_RECEIVED_IN_CASH",
  ]);
  const paidStatuses = new Set(["RECEIVED", "CONFIRMED"]);
  return paidEvents.has(eventName) || paidStatuses.has(paymentStatus);
}

async function readJsonSafe(response: Response) {
  const text = await response.text();
  try {
    return { text, data: JSON.parse(text) };
  } catch (_) {
    return { text, data: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Método não permitido." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appsScriptUrl = Deno.env.get("HYPE_APPS_SCRIPT_URL");
    const hypeWebhookSecret = Deno.env.get("HYPE_WEBHOOK_SECRET");
    const asaasWebhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");

    if (!supabaseUrl || !serviceRole) {
      throw new Error("Configuração interna do Supabase ausente.");
    }

    // Se o token do webhook estiver configurado, valida o cabeçalho enviado pelo Asaas.
    if (asaasWebhookToken) {
      const receivedToken =
        req.headers.get("asaas-access-token") ||
        req.headers.get("x-asaas-access-token") ||
        "";
      if (receivedToken !== asaasWebhookToken) {
        return json({ ok: false, error: "Webhook não autorizado." }, 401);
      }
    }

    const body = await req.json();
    const eventName = String(body?.event || "").trim().toUpperCase();
    const payment = body?.payment || {};
    const paymentStatus = String(payment?.status || "").trim().toUpperCase();

    // Eventos que não representam pagamento confirmado são ignorados com 200.
    if (!isPaidEvent(eventName, paymentStatus)) {
      return json({
        ok: true,
        ignored: true,
        event: eventName || null,
        payment_status: paymentStatus || null,
      });
    }

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    const externalReference = String(
      payment?.externalReference ?? body?.externalReference ?? "",
    ).trim();

    const description = String(payment?.description || "");
    const codeFromDescription =
      description.match(/HYPE-[A-Z0-9-]+/i)?.[0]?.toUpperCase() || "";

    let ticket: any = null;

    // Caminho principal: o pagamento Asaas deve carregar o id do ticket
    // em externalReference. Também aceitamos o código HYPE como fallback.
    if (/^\d+$/.test(externalReference)) {
      const result = await supabase
        .from("tickets")
        .select(
          "id,event_id,lot_id,ticket_code,qr_token,customer_name,phone,email,gender,price,payment_status,paid_at,email_sent_at",
        )
        .eq("id", Number(externalReference))
        .maybeSingle();
      if (result.error) throw new Error(result.error.message);
      ticket = result.data;
    } else if (externalReference) {
      const result = await supabase
        .from("tickets")
        .select(
          "id,event_id,lot_id,ticket_code,qr_token,customer_name,phone,email,gender,price,payment_status,paid_at,email_sent_at",
        )
        .ilike("ticket_code", externalReference)
        .maybeSingle();
      if (result.error) throw new Error(result.error.message);
      ticket = result.data;
    }

    if (!ticket && codeFromDescription) {
      const result = await supabase
        .from("tickets")
        .select(
          "id,event_id,lot_id,ticket_code,qr_token,customer_name,phone,email,gender,price,payment_status,paid_at,email_sent_at",
        )
        .ilike("ticket_code", codeFromDescription)
        .maybeSingle();
      if (result.error) throw new Error(result.error.message);
      ticket = result.data;
    }

    if (!ticket) {
      console.error("Pagamento Asaas sem ticket correspondente", {
        eventName,
        paymentId: payment?.id,
        externalReference,
        description,
      });
      // 500 faz o provedor tentar novamente em caso de atraso eventual.
      return json(
        {
          ok: false,
          error: "Não foi possível localizar o ingresso deste pagamento.",
        },
        500,
      );
    }

    // Marca como Pago. Isso é idempotente: se já estiver Pago, preserva paid_at.
    if (ticket.payment_status !== "Pago") {
      const paidAt = ticket.paid_at || new Date().toISOString();
      const updateResult = await supabase
        .from("tickets")
        .update({
          payment_status: "Pago",
          paid_at: paidAt,
        })
        .eq("id", ticket.id);

      if (updateResult.error) {
        throw new Error(`Falha ao liberar ingresso: ${updateResult.error.message}`);
      }

      ticket.payment_status = "Pago";
      ticket.paid_at = paidAt;

      // Auditoria é útil, mas não deve impedir a liberação caso falhe.
      try {
        await supabase.from("audit_logs").insert({
          staff_user_id: null,
          action: "ASAAS_PAGAMENTO_CONFIRMADO",
          ticket_id: ticket.id,
          metadata: {
            asaas_event: eventName,
            asaas_payment_id: payment?.id || null,
            asaas_status: paymentStatus || null,
          },
        });
      } catch (_) {
        // não bloqueia o fluxo
      }
    }

    // Se já enviou, não duplica o e-mail em eventos repetidos do Asaas.
    if (ticket.email_sent_at) {
      return json({
        ok: true,
        paid: true,
        email_already_sent: true,
        ticket_id: ticket.id,
      });
    }

    const customerEmail = String(ticket.email || "").trim().toLowerCase();
    if (!customerEmail || !customerEmail.includes("@")) {
      // Pagamento continua confirmado; apenas não há e-mail válido para envio.
      return json({
        ok: true,
        paid: true,
        email_skipped: true,
        reason: "Cliente sem e-mail válido.",
        ticket_id: ticket.id,
      });
    }

    if (!appsScriptUrl || !hypeWebhookSecret) {
      throw new Error(
        "Pagamento confirmado, mas HYPE_APPS_SCRIPT_URL/HYPE_WEBHOOK_SECRET não estão configurados.",
      );
    }

    const [lotResult, eventResult] = await Promise.all([
      supabase
        .from("ticket_lots")
        .select("id,name,sector")
        .eq("id", ticket.lot_id)
        .maybeSingle(),
      supabase
        .from("events")
        .select("id,name,artist_name,event_date,opening_time,venue")
        .eq("id", ticket.event_id)
        .maybeSingle(),
    ]);

    if (lotResult.error) throw new Error(lotResult.error.message);
    if (eventResult.error) throw new Error(eventResult.error.message);

    const lot = lotResult.data;
    const event = eventResult.data;

    // Envia diretamente ao Apps Script/Gmail, sem depender do login do Admin.
    const googleResponse = await fetch(appsScriptUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: hypeWebhookSecret,
        payment_status: "Pago",
        email: customerEmail,
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

    const google = await readJsonSafe(googleResponse);

    if (!googleResponse.ok || google.data?.ok !== true) {
      console.error("Gmail/Apps Script recusou envio:", google.text);
      // Não desfaz o pagamento. Retorna 500 para permitir nova tentativa do webhook.
      return json(
        {
          ok: false,
          paid: true,
          email_sent: false,
          error:
            google.data?.erro ||
            google.data?.error ||
            "O Gmail recusou o envio do ingresso.",
        },
        500,
      );
    }

    const sentAt = new Date().toISOString();
    const emailUpdate = await supabase
      .from("tickets")
      .update({ email_sent_at: sentAt })
      .eq("id", ticket.id);

    if (emailUpdate.error) {
      // O e-mail já foi enviado; registra o problema no log, mas responde sucesso
      // para evitar disparos repetidos desnecessários.
      console.error("E-mail enviado, mas email_sent_at não foi gravado:", emailUpdate.error);
      return json({
        ok: true,
        paid: true,
        email_sent: true,
        warning: "email_sent_at não foi gravado.",
        ticket_id: ticket.id,
      });
    }

    try {
      await supabase.from("audit_logs").insert({
        staff_user_id: null,
        action: "INGRESSO_EMAIL_AUTOMATICO",
        ticket_id: ticket.id,
        metadata: {
          email_sent_at: sentAt,
          asaas_payment_id: payment?.id || null,
        },
      });
    } catch (_) {
      // não bloqueia o fluxo
    }

    return json({
      ok: true,
      paid: true,
      email_sent: true,
      sent_at: sentAt,
      ticket_id: ticket.id,
      ticket_code: ticket.ticket_code,
    });
  } catch (err) {
    console.error(err);
    return json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Erro no webhook Asaas.",
      },
      500,
    );
  }
});
