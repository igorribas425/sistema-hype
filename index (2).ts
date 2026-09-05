import { createClient } from "npm:@supabase/supabase-js@2";

/*
  HYPE V35 - Edge Function: send-ticket-email
  Mantém ingresso/leitor/V34 e acrescenta:
    action = "survey_auto" -> a Portaria dispara o feedback do evento encerrado após a virada automática.

  Gmail usa HYPE_APPS_SCRIPT_URL + HYPE_WEBHOOK_SECRET.
  WhatsApp automático usa a API oficial da Meta quando estes secrets existirem:
    WHATSAPP_ACCESS_TOKEN
    WHATSAPP_PHONE_NUMBER_ID
    WHATSAPP_FEEDBACK_TEMPLATE   (template aprovado; corpo com {{1}} nome, {{2}} evento, {{3}} link)
    WHATSAPP_TEMPLATE_LANG       (opcional, padrão pt_BR)
    WHATSAPP_GRAPH_VERSION       (opcional, padrão v22.0)
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

async function readJsonSafe(response: Response) {
  const text = await response.text();
  try { return { text, data: JSON.parse(text) }; }
  catch (_) { return { text, data: null }; }
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validReaderLink(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return false;
    if (!/\/leitor\.html$/i.test(u.pathname)) return false;
    if (!u.searchParams.get("reader")) return false;
    // Domínio oficial e GitHub Pages usado durante a implantação.
    return u.hostname === "hypeloungeclub.com.br" ||
      u.hostname === "www.hypeloungeclub.com.br" ||
      u.hostname.endsWith(".github.io");
  } catch (_) {
    return false;
  }
}



function normalizeBaseUrl(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return "";
    const allowed = u.hostname === "hypeloungeclub.com.br" ||
      u.hostname === "www.hypeloungeclub.com.br" ||
      u.hostname.endsWith(".github.io");
    if (!allowed) return "";
    u.search = "";
    u.hash = "";
    // O front envia a pasta atual; garante barra final para preservar /sistema-hype/ no GitHub Pages.
    if (!u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/[^/]*$/, "/");
    return u.toString();
  } catch (_) {
    return "";
  }
}


function normalizeBrazilPhone(value: unknown) {
  let d = String(value || "").replace(/\D/g, "");
  if (!d) return "";
  if ((d.length === 10 || d.length === 11) && !d.startsWith("55")) d = `55${d}`;
  if (!/^55\d{10,11}$/.test(d)) return "";
  return d;
}

async function sendWhatsAppFeedback(args: {
  to: string;
  name: string;
  eventName: string;
  surveyLink: string;
}) {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
  const templateName = Deno.env.get("WHATSAPP_FEEDBACK_TEMPLATE") || "";
  if (!accessToken || !phoneNumberId || !templateName) {
    return { configured: false, ok: false, error: "WhatsApp Business API ainda não configurada." };
  }

  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v22.0";
  const language = Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "pt_BR";
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: args.to,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: args.name || "Cliente HYPE" },
            { type: "text", text: args.eventName || "HYPE LOUNGE CLUB" },
            { type: "text", text: args.surveyLink },
          ],
        }],
      },
    }),
  });
  const raw = await readJsonSafe(response);
  const id = raw.data?.messages?.[0]?.id || null;
  if (!response.ok || !id) {
    return { configured: true, ok: false, error: raw.data?.error?.message || raw.text || "WhatsApp recusou o envio." };
  }
  return { configured: true, ok: true, message_id: id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appsScriptUrl = Deno.env.get("HYPE_APPS_SCRIPT_URL");
    const webhookSecret = Deno.env.get("HYPE_WEBHOOK_SECRET");
    if (!supabaseUrl || !serviceRole) throw new Error("Configuração interna do Supabase ausente.");
    if (!appsScriptUrl || !webhookSecret) throw new Error("HYPE_APPS_SCRIPT_URL/HYPE_WEBHOOK_SECRET não configurados.");

    const body = await req.json();
    const action = String(body?.action || "ticket").trim().toLowerCase();
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ----------------------------------------------------------
    // V33: LINK DO CELULAR LEITOR -> GMAIL
    // ----------------------------------------------------------
    if (action === "reader_link") {
      const deviceKey = String(body?.device_key || "").trim();
      const email = String(body?.email || "").trim().toLowerCase();
      const readerLink = String(body?.reader_link || "").trim();
      const readerLabel = String(body?.reader_label || "Celular leitor").trim().slice(0, 80);

      if (deviceKey.length < 20) return json({ ok:false, error:"Computador da Portaria não autorizado." }, 403);
      if (!validEmail(email)) return json({ ok:false, error:"Digite um e-mail válido." }, 400);
      if (!validReaderLink(readerLink)) return json({ ok:false, error:"Link do leitor inválido." }, 400);

      // Valida a chave do computador usando a mesma RPC segura que a Portaria já usa.
      const authCheck = await supabase.rpc("portaria_device_list_readers_v19", {
        p_device_key: deviceKey,
      });
      if (authCheck.error) {
        return json({ ok:false, error:"Computador da Portaria não autorizado." }, 403);
      }

      const googleResponse = await fetch(appsScriptUrl, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: webhookSecret,
          action: "reader_link",
          email,
          reader_label: readerLabel,
          reader_link: readerLink,
        }),
      });
      const google = await readJsonSafe(googleResponse);
      if (!googleResponse.ok || google.data?.ok !== true) {
        throw new Error(google.data?.erro || google.data?.error || google.text || "Gmail recusou o envio.");
      }

      try {
        await supabase.from("audit_logs").insert({
          action: "PORTARIA_LINK_LEITOR_EMAIL_V33",
          metadata: { email, reader_label: readerLabel },
        });
      } catch (_) {}

      return json({ ok:true, email_sent:true, email, reader_label:readerLabel });
    }



    // ----------------------------------------------------------
    // V35: FEEDBACK AUTOMATICO NA VIRADA DA PORTARIA (apos 08:00)
    // ----------------------------------------------------------
    if (action === "survey_auto") {
      const deviceKey = String(body?.device_key || "").trim();
      const requestedEventId = Number(body?.event_id || 0) || null;
      const baseUrl = normalizeBaseUrl(
        String(body?.base_url || Deno.env.get("HYPE_PUBLIC_SITE_URL") || "")
      );

      if (deviceKey.length < 20) return json({ ok:false, error:"Computador da Portaria não autorizado." }, 403);
      if (!baseUrl) return json({ ok:false, error:"Endereço público do site inválido para o feedback." }, 400);

      const claim = await supabase.rpc("portaria_feedback_claim_v35", {
        p_device_key: deviceKey,
        p_event_id: requestedEventId,
      });
      if (claim.error) throw new Error(claim.error.message);
      const claimRow = Array.isArray(claim.data) ? claim.data[0] : claim.data;
      if (!claimRow?.ok) {
        return json({ ok:true, skipped:true, reason:claimRow?.reason || "Nenhum feedback aguardando disparo.", event_id:claimRow?.event_id || null });
      }

      const eventId = Number(claimRow.event_id);
      const eventResult = await supabase.from("events")
        .select("id,name,event_date")
        .eq("id", eventId)
        .maybeSingle();
      if (eventResult.error) throw new Error(eventResult.error.message);
      if (!eventResult.data) throw new Error("Evento não encontrado para feedback.");

      const ticketsResult = await supabase.from("tickets")
        .select("id,customer_name,email,phone")
        .eq("event_id", eventId)
        .eq("payment_status", "Pago")
        .eq("entry_status", "Entrada utilizada");
      if (ticketsResult.error) throw new Error(ticketsResult.error.message);
      const tickets = Array.isArray(ticketsResult.data) ? ticketsResult.data : [];

      if (tickets.length) {
        const inviteRows = tickets.map((ticket:any)=>({ event_id:eventId, ticket_id:Number(ticket.id) }));
        const up = await supabase.from("event_survey_invites_v34")
          .upsert(inviteRows, { onConflict:"ticket_id", ignoreDuplicates:true });
        if (up.error) throw new Error(up.error.message);
      }

      const invitesResult = await supabase.from("event_survey_invites_v34")
        .select("token,ticket_id,sent_at,sent_count,email_sent_at,whatsapp_sent_at,whatsapp_error,responded_at")
        .eq("event_id", eventId);
      if (invitesResult.error) throw new Error(invitesResult.error.message);
      const invites = Array.isArray(invitesResult.data) ? invitesResult.data : [];
      const ticketMap = new Map(tickets.map((x:any)=>[Number(x.id),x]));

      const recipients = invites.map((inv:any)=>{
        const ticket:any = ticketMap.get(Number(inv.ticket_id)) || {};
        const survey = new URL("pesquisa.html", baseUrl);
        survey.searchParams.set("token", String(inv.token || ""));
        return {
          invite: inv,
          ticket,
          surveyLink: survey.toString(),
        };
      }).filter((x:any)=>!x.invite.responded_at);

      let emailSent = 0;
      let emailFailed = 0;
      const emailTargets = recipients.filter((x:any)=>
        validEmail(String(x.ticket.email || "").trim().toLowerCase()) &&
        !x.invite.email_sent_at && !x.invite.sent_at
      ).slice(0, 100);

      if (emailTargets.length) {
        const googleRecipients = emailTargets.map((x:any)=>({
          email:String(x.ticket.email || "").trim().toLowerCase(),
          customer_name:String(x.ticket.customer_name || "Cliente HYPE"),
          event_name:eventResult.data?.name || "HYPE LOUNGE CLUB",
          event_date:eventResult.data?.event_date || "",
          survey_link:x.surveyLink,
          invite_token:String(x.invite.token || ""),
        }));
        const googleResponse = await fetch(appsScriptUrl, {
          method:"POST",
          redirect:"follow",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ secret:webhookSecret, action:"survey_batch", recipients:googleRecipients }),
        });
        const google = await readJsonSafe(googleResponse);
        if (!googleResponse.ok || google.data?.ok !== true) {
          emailFailed += emailTargets.length;
        } else {
          const results = Array.isArray(google.data?.results) ? google.data.results : [];
          const okTokens = new Set(results.filter((r:any)=>r?.ok===true && r?.invite_token).map((r:any)=>String(r.invite_token)));
          const nowIso = new Date().toISOString();
          for (const x of emailTargets) {
            const token = String((x as any).invite.token || "");
            if (!okTokens.has(token)) { emailFailed++; continue; }
            const upd = await supabase.from("event_survey_invites_v34")
              .update({
                sent_at: nowIso,
                email_sent_at: nowIso,
                sent_count: Number((x as any).invite.sent_count || 0) + 1,
              })
              .eq("token", token);
            if (!upd.error) emailSent++;
          }
        }
      }

      let waSent = 0;
      let waFailed = 0;
      let waConfigured = Boolean(
        Deno.env.get("WHATSAPP_ACCESS_TOKEN") &&
        Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") &&
        Deno.env.get("WHATSAPP_FEEDBACK_TEMPLATE")
      );

      for (const x of recipients.slice(0, 100)) {
        if ((x as any).invite.whatsapp_sent_at) continue;
        const phone = normalizeBrazilPhone((x as any).ticket.phone);
        if (!phone) continue;
        const result = await sendWhatsAppFeedback({
          to: phone,
          name: String((x as any).ticket.customer_name || "Cliente HYPE"),
          eventName: String(eventResult.data?.name || "HYPE LOUNGE CLUB"),
          surveyLink: String((x as any).surveyLink),
        });
        if (!result.configured) { waConfigured = false; break; }
        if (result.ok) {
          const nowIso = new Date().toISOString();
          const upd = await supabase.from("event_survey_invites_v34")
            .update({ whatsapp_sent_at:nowIso, whatsapp_message_id:result.message_id || null, whatsapp_error:null })
            .eq("token", String((x as any).invite.token || ""));
          if (!upd.error) waSent++;
        } else {
          waFailed++;
          await supabase.from("event_survey_invites_v34")
            .update({ whatsapp_error:String(result.error || "Falha no WhatsApp").slice(0,500) })
            .eq("token", String((x as any).invite.token || ""));
        }
      }

      const totalEmailSent = invites.filter((i:any)=>i.email_sent_at || i.sent_at).length + emailSent;
      const totalWaSent = invites.filter((i:any)=>i.whatsapp_sent_at).length + waSent;
      const pendingEmail = recipients.filter((x:any)=>validEmail(String(x.ticket.email||"").trim().toLowerCase()) && !x.invite.email_sent_at && !x.invite.sent_at).length - emailSent;
      const pendingWa = waConfigured
        ? recipients.filter((x:any)=>normalizeBrazilPhone(x.ticket.phone) && !x.invite.whatsapp_sent_at).length - waSent
        : recipients.filter((x:any)=>normalizeBrazilPhone(x.ticket.phone) && !x.invite.whatsapp_sent_at).length;

      const completed = pendingEmail <= 0 && (waConfigured ? pendingWa <= 0 : false);
      const status = completed ? "completed" : "partial";
      const errors:string[] = [];
      if (emailFailed) errors.push(`${emailFailed} e-mail(s) falharam`);
      if (!waConfigured) errors.push("WhatsApp Business API ainda não configurada");
      else if (waFailed) errors.push(`${waFailed} WhatsApp falharam`);

      await supabase.from("event_feedback_dispatch_v35").update({
        status,
        completed_at: completed ? new Date().toISOString() : null,
        email_sent: Math.max(0,totalEmailSent),
        whatsapp_sent: Math.max(0,totalWaSent),
        failed: Math.max(0,emailFailed + waFailed),
        last_error: errors.length ? errors.join(" | ") : null,
      }).eq("event_id",eventId);

      try {
        await supabase.from("audit_logs").insert({
          action:"FEEDBACK_AUTO_V35",
          metadata:{ event_id:eventId, email_sent:emailSent, whatsapp_sent:waSent, whatsapp_configured:waConfigured, status },
        });
      } catch (_) {}

      return json({
        ok:true,
        automatic:true,
        event_id:eventId,
        event_name:eventResult.data?.name || "",
        eligible:tickets.length,
        email_sent:emailSent,
        whatsapp_sent:waSent,
        whatsapp_configured:waConfigured,
        status,
        message: completed
          ? "Feedback automático concluído."
          : "Feedback automático parcial. Gmail foi processado; WhatsApp depende da API oficial configurada.",
      });
    }

    // ----------------------------------------------------------
    // V34: PESQUISA POS-EVENTO -> somente quem realmente entrou
    // ----------------------------------------------------------
    if (action === "survey_invites") {
      const eventId = Number(body?.event_id || 0);
      const username = String(body?.username || "").trim();
      const password = String(body?.password || "");
      const force = Boolean(body?.force);
      const baseUrl = normalizeBaseUrl(String(body?.base_url || ""));

      if (!eventId || !username || !password) return json({ ok:false, error:"Dados obrigatórios ausentes." }, 400);
      if (!baseUrl) return json({ ok:false, error:"Endereço do site inválido para a pesquisa." }, 400);

      const staffResult = await supabase.rpc("verify_staff", {
        p_username: username,
        p_password: password,
      });
      if (staffResult.error) throw new Error(staffResult.error.message);
      const staff = Array.isArray(staffResult.data) ? staffResult.data[0] : staffResult.data;
      if (!staff || !["admin","gerente"].includes(String(staff.role || ""))) {
        return json({ ok:false, error:"Somente Admin/Gerente pode enviar a pesquisa." }, 403);
      }

      const eventResult = await supabase.from("events")
        .select("id,name,event_date")
        .eq("id", eventId)
        .maybeSingle();
      if (eventResult.error) throw new Error(eventResult.error.message);
      if (!eventResult.data) return json({ ok:false, error:"Evento não encontrado." }, 404);

      // Esta RPC cria tokens apenas para ingressos PAGOS que passaram pela Portaria.
      const attendeesResult = await supabase.rpc("staff_survey_attendees_v34", {
        p_username: username,
        p_password: password,
        p_event_id: eventId,
      });
      if (attendeesResult.error) throw new Error(attendeesResult.error.message);
      const attendees = Array.isArray(attendeesResult.data) ? attendeesResult.data : [];

      const eligible = attendees.filter((a:any) =>
        validEmail(String(a?.email || "").trim().toLowerCase()) &&
        !Boolean(a?.responded) &&
        (force || !a?.sent_at)
      );
      const batch = eligible.slice(0, 100);
      if (!batch.length) {
        return json({ ok:true, sent:0, failed:0, remaining:0, message:"Nenhum novo e-mail de pesquisa para enviar." });
      }

      const recipients = batch.map((a:any) => {
        const survey = new URL("pesquisa.html", baseUrl);
        survey.searchParams.set("token", String(a.invite_token || ""));
        return {
          email: String(a.email || "").trim().toLowerCase(),
          customer_name: String(a.customer_name || "Cliente HYPE"),
          event_name: eventResult.data?.name || "HYPE LOUNGE CLUB",
          event_date: eventResult.data?.event_date || "",
          survey_link: survey.toString(),
          invite_token: String(a.invite_token || ""),
        };
      });

      const googleResponse = await fetch(appsScriptUrl, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: webhookSecret,
          action: "survey_batch",
          recipients,
        }),
      });
      const google = await readJsonSafe(googleResponse);
      if (!googleResponse.ok || google.data?.ok !== true) {
        throw new Error(google.data?.erro || google.data?.error || google.text || "Gmail recusou o envio da pesquisa.");
      }

      const results = Array.isArray(google.data?.results) ? google.data.results : [];
      const successfulTokens = new Set(
        results.filter((r:any)=>r?.ok===true && r?.invite_token).map((r:any)=>String(r.invite_token))
      );
      const nowIso = new Date().toISOString();
      for (const row of batch) {
        const token = String((row as any)?.invite_token || "");
        if (!successfulTokens.has(token)) continue;
        const update = await supabase.from("event_survey_invites_v34")
          .update({ sent_at: nowIso, email_sent_at: nowIso, sent_count: Number((row as any)?.sent_count || 0) + 1 })
          .eq("token", token);
        if (update.error) console.warn("Falha ao marcar convite enviado", update.error.message);
      }

      const sent = successfulTokens.size;
      const failed = Math.max(0, batch.length - sent);
      const remaining = Math.max(0, eligible.length - batch.length);

      try {
        await supabase.from("audit_logs").insert({
          staff_user_id: staff.id || null,
          action: "PESQUISA_EVENTO_EMAIL_V34",
          metadata: { event_id: eventId, sent, failed, remaining },
        });
      } catch (_) {}

      return json({ ok:true, sent, failed, remaining, event_id:eventId });
    }


    // ----------------------------------------------------------
    // V27 preservada: ENVIO DO INGRESSO PAGO
    // ----------------------------------------------------------
    const ticketId = Number(body?.ticket_id || 0);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    const force = Boolean(body?.force);
    if (!ticketId || !username || !password) return json({ ok:false, error:"Dados obrigatórios ausentes." }, 400);

    const staffResult = await supabase.rpc("verify_staff", {
      p_username: username,
      p_password: password,
    });
    if (staffResult.error) throw new Error(staffResult.error.message);
    const staff = Array.isArray(staffResult.data) ? staffResult.data[0] : staffResult.data;
    if (!staff || !["admin","gerente","caixa"].includes(String(staff.role || ""))) {
      return json({ ok:false, error:"Sem permissão." }, 403);
    }

    const ticketResult = await supabase
      .from("tickets")
      .select("id,event_id,lot_id,ticket_code,qr_token,customer_name,phone,email,gender,price,payment_status,email_sent_at")
      .eq("id", ticketId)
      .maybeSingle();
    if (ticketResult.error) throw new Error(ticketResult.error.message);
    const ticket = ticketResult.data;
    if (!ticket) return json({ ok:false, error:"Ingresso não encontrado." }, 404);
    if (ticket.payment_status !== "Pago") return json({ ok:false, error:"O ingresso ainda não está Pago." }, 409);

    const customerEmail = String(ticket.email || "").trim().toLowerCase();
    if (!validEmail(customerEmail)) return json({ ok:false, error:"Cliente sem e-mail válido." }, 400);
    if (ticket.email_sent_at && !force) return json({ ok:true, already_sent:true, email_sent_at:ticket.email_sent_at });

    const [lotResult, eventResult] = await Promise.all([
      supabase.from("ticket_lots").select("id,name,sector").eq("id", ticket.lot_id).maybeSingle(),
      supabase.from("events").select("id,name,artist_name,event_date,opening_time,venue,cover_image").eq("id", ticket.event_id).maybeSingle(),
    ]);
    if (lotResult.error) throw new Error(lotResult.error.message);
    if (eventResult.error) throw new Error(eventResult.error.message);
    const lot = lotResult.data;
    const event = eventResult.data;

    const googleResponse = await fetch(appsScriptUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: webhookSecret,
        payment_status: "Pago",
        email: customerEmail,
        customer_name: ticket.customer_name,
        event_name: event?.name || "HYPE LOUNGE CLUB",
        artist_name: event?.artist_name || "",
        event_date: event?.event_date || "",
        opening_time: event?.opening_time || "",
        venue: event?.venue || "",
        event_cover_image: event?.cover_image || "",
        lot_name: lot?.name || "Ingresso",
        sector: lot?.sector || "",
        gender: ticket.gender || "",
        price: Number(ticket.price || 0),
        ticket_code: ticket.ticket_code,
        qr_token: ticket.qr_token || ticket.ticket_code,
      }),
    });

    const google = await readJsonSafe(googleResponse);
    if (!googleResponse.ok || google.data?.ok !== true) {
      throw new Error(google.data?.erro || google.data?.error || google.text || "Gmail recusou o envio.");
    }

    const sentAt = new Date().toISOString();
    const update = await supabase.from("tickets").update({ email_sent_at: sentAt }).eq("id", ticket.id);
    if (update.error) throw new Error(`E-mail enviado, mas não foi possível gravar email_sent_at: ${update.error.message}`);

    try {
      await supabase.from("audit_logs").insert({
        staff_user_id: staff.id || null,
        action: force ? "INGRESSO_EMAIL_REENVIADO_V33" : "INGRESSO_EMAIL_ENVIADO_V33",
        ticket_id: ticket.id,
        metadata: { email: customerEmail, event_id: ticket.event_id },
      });
    } catch (_) {}

    return json({ ok:true, email_sent:true, email_sent_at:sentAt });
  } catch (err) {
    console.error(err);
    return json({ ok:false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
