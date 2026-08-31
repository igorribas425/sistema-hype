import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
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
    const webhookSecret = Deno.env.get("HYPE_WEBHOOK_SECRET");

    if (!supabaseUrl || !serviceRole) {
      throw new Error("Configuração interna do Supabase ausente.");
    }
    if (!appsScriptUrl) {
      throw new Error("HYPE_APPS_SCRIPT_URL não configurada.");
    }
    if (!webhookSecret) {
      throw new Error("HYPE_WEBHOOK_SECRET não configurada.");
    }

    const body = await req.json();
    const ticketId = Number(body?.ticket_id);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    const force = Boolean(body?.force);

    if (!ticketId) throw new Error("Ingresso inválido.");
    if (!username || !password) {
      throw new Error("Login do Admin não informado.");
    }

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    const { data: staffRows, error: staffError } = await supabase.rpc(
      "verify_staff",
      {
        p_username: username,
        p_password: password,
      },
    );

    if (staffError) throw new Error(staffError.message);

    const staff = Array.isArray(staffRows) ? staffRows[0] : null;
    if (!staff || !["admin", "gerente", "caixa"].includes(String(staff.role))) {
      return json(
        { ok: false, error: "Sem permissão para enviar ingresso." },
        403,
      );
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(
        "id,event_id,lot_id,ticket_code,qr_token,customer_name,phone,email,gender,price,payment_status,email_sent_at",
      )
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) throw new Error("Ingresso não encontrado.");

    if (ticket.payment_status !== "Pago") {
      return json(
        { ok: false, error: "O pagamento ainda não foi confirmado." },
        400,
      );
    }

    const customerEmail = String(ticket.email || "").trim().toLowerCase();
    if (!customerEmail || !customerEmail.includes("@")) {
      return json(
        { ok: false, error: "O cliente não possui e-mail válido." },
        400,
      );
    }

    if (ticket.email_sent_at && !force) {
      return json({
        ok: true,
        already_sent: true,
        sent_at: ticket.email_sent_at,
      });
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

    const lot = lotResult.data;
    const event = eventResult.data;

    const googleResponse = await fetch(appsScriptUrl, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: webhookSecret,
        payment_status: ticket.payment_status,
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

    const googleText = await googleResponse.text();
    let googleData: any = null;

    try {
      googleData = JSON.parse(googleText);
    } catch (_) {
      throw new Error("O Gmail não retornou uma resposta válida.");
    }

    if (!googleResponse.ok || googleData?.ok !== true) {
      throw new Error(googleData?.erro || "O Gmail recusou o envio.");
    }

    const sentAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("tickets")
      .update({ email_sent_at: sentAt })
      .eq("id", ticket.id);

    if (updateError) {
      console.error(
        "E-mail enviado, mas não marcou email_sent_at:",
        updateError,
      );
    }

    return json({ ok: true, sent: true, sent_at: sentAt });
  } catch (err) {
    console.error(err);
    return json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Erro ao enviar ingresso.",
      },
      500,
    );
  }
});
