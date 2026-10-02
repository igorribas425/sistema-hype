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

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function officialUrl(value: string, requiredPath?: RegExp) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const allowed = url.hostname === "hypeloungeclub.com.br" ||
      url.hostname === "www.hypeloungeclub.com.br" || url.hostname.endsWith(".github.io");
    if (!allowed || (requiredPath && !requiredPath.test(url.pathname))) return null;
    return url;
  } catch (_) {
    return null;
  }
}

async function postMail(payload: Record<string, unknown>) {
  const appsScriptUrl = "https://script.google.com/macros/s/AKfycbxgovFRJvAtUq5GSFgGMiGKuzRyod9O0Ld8wG-jxRtpqByhNvSI8r_LDTLhmVJkb6Rc/exec";
  const webhookSecret = Deno.env.get("HYPE_WEBHOOK_SECRET");
  if (!appsScriptUrl || !webhookSecret) {
    throw new Error("HYPE_APPS_SCRIPT_URL/HYPE_WEBHOOK_SECRET não configurados.");
  }
  const requestBody = JSON.stringify({ secret: webhookSecret, ...payload });
  let target = appsScriptUrl;
  let method = "POST";
  let response: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(target, {
      method,
      redirect: "manual",
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? requestBody : undefined,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw new Error("Google Apps Script redirecionou sem informar o destino.");
    target = new URL(location, target).toString();
    // ContentService redirects its JSON body to a one-time URL. 3xx codes
    // other than 307/308 intentionally switch the follow-up to GET.
    method = [307, 308].includes(response.status) ? method : "GET";
  }
  if (!response) throw new Error("Não foi possível conectar ao Apps Script.");
  const text = await response.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch (_) { /* handled below */ }
  if (!response.ok || data?.ok !== true) {
    if (!data && /<html[\s>]/i.test(text)) {
      throw new Error(`Apps Script não retornou JSON (HTTP ${response.status}). Confira a implantação pública e a URL /exec.`);
    }
    throw new Error(data?.erro || data?.error || text.slice(0, 500) || "Gmail recusou o envio.");
  }
  return data;
}

function firstRow(data: any) {
  return Array.isArray(data) ? data[0] : data;
}

async function verifyStaff(supabase: any, body: any, roles: string[]) {
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  if (!username || !password) return null;
  const result = await supabase.rpc("verify_staff", { p_username: username, p_password: password });
  if (result.error) throw new Error(result.error.message);
  const staff = firstRow(result.data);
  return staff && roles.includes(String(staff.role || "")) ? staff : null;
}

async function verifyDevice(supabase: any, deviceKey: string) {
  if (deviceKey.length < 20) return null;
  const result = await supabase.rpc("portaria_device_status_v18", { p_device_key: deviceKey });
  if (result.error) throw new Error(result.error.message);
  const device = firstRow(result.data);
  return device?.active === true ? device : null;
}

async function sendSurveyBatch(
  supabase: any,
  event: any,
  attendees: any[],
  baseUrl: URL,
  force: boolean,
) {
  const eligible = attendees.filter((row) =>
    validEmail(String(row?.email || "").trim().toLowerCase()) &&
    !Boolean(row?.responded) && (force || !row?.sent_at)
  );
  const batch = eligible.slice(0, 100);
  if (!batch.length) return { sent: 0, failed: 0, remaining: 0 };
  const recipients = batch.map((row) => {
    const survey = new URL("pesquisa.html", baseUrl);
    survey.searchParams.set("token", String(row.invite_token || ""));
    return {
      email: String(row.email || "").trim().toLowerCase(),
      customer_name: String(row.customer_name || "Cliente HYPE"),
      event_name: event?.name || "HYPE LOUNGE CLUB",
      event_date: event?.event_date || "",
      survey_link: survey.toString(),
      invite_token: String(row.invite_token || ""),
    };
  });
  const result = await postMail({ action: "survey_batch", recipients });
  const successfulTokens = new Set(
    (Array.isArray(result?.results) ? result.results : [])
      .filter((row: any) => row?.ok === true && row?.invite_token)
      .map((row: any) => String(row.invite_token)),
  );
  const sentAt = new Date().toISOString();
  for (const row of batch) {
    const token = String(row.invite_token || "");
    if (!successfulTokens.has(token)) continue;
    await supabase.from("event_survey_invites_v34").update({
      sent_at: sentAt,
      email_sent_at: sentAt,
      sent_count: Number(row.sent_count || 0) + 1,
    }).eq("token", token);
  }
  return {
    sent: successfulTokens.size,
    failed: Math.max(0, batch.length - successfulTokens.size),
    remaining: Math.max(0, eligible.length - batch.length),
  };
}

async function sendApprovedGuestListEmail(supabase: any, req: Request, body: any) {
  const staff = await verifyStaff(supabase, body, ["admin"]);
  if (!staff) return json(req, { ok: false, error: "Sem permissão." }, 403);
  const listId = Number(body?.list_id || 0);
  if (!Number.isInteger(listId) || listId <= 0) return json(req, { ok: false, error: "list_id inválido." }, 400);

  const candidateResult = await supabase.from("guest_list_simple_v406")
    .select("id,event_id,name,cpf,phone,gender,email,instagram,status,email_sent_at,email_error")
    .eq("id", listId).maybeSingle();
  if (candidateResult.error) throw new Error(candidateResult.error.message);
  const candidate = candidateResult.data;
  if (!candidate) return json(req, { ok: false, error: "Cadastro não encontrado." }, 404);
  if (!["Liberado", "Entrou"].includes(String(candidate.status || ""))) {
    return json(req, { ok: false, error: "O cadastro ainda não foi aprovado." }, 409);
  }
  const email = String(candidate.email || "").trim().toLowerCase();
  if (!validEmail(email)) return json(req, { ok: false, error: "Cadastro aprovado sem e-mail válido." }, 400);
  if (candidate.email_sent_at && !body?.force) {
    return json(req, { ok: true, already_sent: true, email_sent_at: candidate.email_sent_at });
  }

  const eventResult = await supabase.from("events")
    .select("name,artist_name,event_date,opening_time,venue,cover_image")
    .eq("id", candidate.event_id).maybeSingle();
  if (eventResult.error) throw new Error(eventResult.error.message);
  if (!eventResult.data) return json(req, { ok: false, error: "Evento não encontrado." }, 404);

  try {
    await postMail({
      action: "guest_list_approved",
      email,
      customer_name: candidate.name,
      gender: candidate.gender || "",
      instagram: candidate.instagram || "",
      event_name: eventResult.data.name || "HYPE LOUNGE CLUB",
      artist_name: eventResult.data.artist_name || "",
      event_date: eventResult.data.event_date || "",
      opening_time: eventResult.data.opening_time || "",
      venue: eventResult.data.venue || "",
      event_cover_image: eventResult.data.cover_image || "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail recusou o envio.";
    await supabase.from("guest_list_simple_v406").update({ email_error: message }).eq("id", listId);
    return json(req, { ok: false, error: message, email_sent: false }, 502);
  }

  const sentAt = new Date().toISOString();
  const update = await supabase.from("guest_list_simple_v406")
    .update({ email_sent_at: sentAt, email_error: null })
    .eq("id", listId);
  if (update.error) throw new Error(update.error.message);
  return json(req, { ok: true, email_sent: true, email, email_sent_at: sentAt });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "Método não permitido." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "ticket").trim().toLowerCase();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("Configuração interna do Supabase ausente.");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "guest_list_approved") {
      return await sendApprovedGuestListEmail(supabase, req, body);
    }

    if (action === "reader_link") {
      const deviceKey = String(body?.device_key || "").trim();
      const email = String(body?.email || "").trim().toLowerCase();
      const readerLink = String(body?.reader_link || "").trim();
      const link = officialUrl(readerLink, /\/leitor\.html$/i);
      if (!validEmail(email) || !link?.searchParams.get("reader")) {
        return json(req, { ok: false, error: "E-mail ou link do leitor inválido." }, 400);
      }
      if (!await verifyDevice(supabase, deviceKey)) {
        return json(req, { ok: false, error: "Computador da Portaria não autorizado." }, 403);
      }
      await postMail({
        action: "reader_link",
        email,
        reader_label: String(body?.reader_label || "Celular leitor").trim().slice(0, 80),
        reader_link: link.toString(),
      });
      return json(req, { ok: true, email_sent: true, email });
    }

    if (action === "survey_invites" || action === "survey_auto") {
      const eventId = Number(body?.event_id || 0);
      const baseUrl = officialUrl(String(body?.base_url || Deno.env.get("HYPE_PUBLIC_SITE_URL") || ""));
      if (!Number.isInteger(eventId) || eventId <= 0 || !baseUrl) {
        return json(req, { ok: false, error: "Evento ou endereço público inválido." }, 400);
      }
      let attendees: any[] = [];
      if (action === "survey_invites") {
        const staff = await verifyStaff(supabase, body, ["admin", "gerente"]);
        if (!staff) return json(req, { ok: false, error: "Sem permissão para enviar a pesquisa." }, 403);
        const result = await supabase.rpc("staff_survey_attendees_v35", {
          p_username: String(body.username).trim(),
          p_password: String(body.password),
          p_event_id: eventId,
        });
        if (result.error) throw new Error(result.error.message);
        attendees = Array.isArray(result.data) ? result.data : [];
      } else {
        const deviceKey = String(body?.device_key || "").trim();
        if (!await verifyDevice(supabase, deviceKey)) {
          return json(req, { ok: false, error: "Computador da Portaria não autorizado." }, 403);
        }
        const tickets = await supabase.from("tickets")
          .select("id,customer_name,email,phone")
          .eq("event_id", eventId).eq("payment_status", "Pago").eq("entry_status", "Entrada utilizada");
        if (tickets.error) throw new Error(tickets.error.message);
        if (tickets.data?.length) {
          const inserted = await supabase.from("event_survey_invites_v34").upsert(
            tickets.data.map((ticket: any) => ({ event_id: eventId, ticket_id: ticket.id })),
            { onConflict: "ticket_id", ignoreDuplicates: true },
          );
          if (inserted.error) throw new Error(inserted.error.message);
        }
        const invites = await supabase.from("event_survey_invites_v34")
          .select("token,ticket_id,sent_at,sent_count,email_sent_at,responded_at")
          .eq("event_id", eventId);
        if (invites.error) throw new Error(invites.error.message);
        const ticketMap = new Map((tickets.data || []).map((ticket: any) => [Number(ticket.id), ticket]));
        attendees = (invites.data || []).map((invite: any) => ({
          ...ticketMap.get(Number(invite.ticket_id)),
          invite_token: invite.token,
          sent_at: invite.sent_at,
          sent_count: invite.sent_count,
          email_sent_at: invite.email_sent_at,
          responded: Boolean(invite.responded_at),
        }));
      }
      const eventResult = await supabase.from("events").select("id,name,event_date").eq("id", eventId).maybeSingle();
      if (eventResult.error) throw new Error(eventResult.error.message);
      if (!eventResult.data) return json(req, { ok: false, error: "Evento não encontrado." }, 404);
      const sent = await sendSurveyBatch(supabase, eventResult.data, attendees, baseUrl, Boolean(body?.force));
      return json(req, { ok: true, event_id: eventId, ...sent });
    }

    if (action !== "ticket") return json(req, { ok: false, error: "Ação inválida." }, 400);
    const ticketId = Number(body?.ticket_id || 0);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return json(req, { ok: false, error: "ticket_id inválido." }, 400);
    }
    const staff = await verifyStaff(supabase, body, ["admin", "gerente", "caixa"]);
    if (!staff) return json(req, { ok: false, error: "Sem permissão." }, 403);
    const ticketResult = await supabase.from("tickets").select(
      "id,event_id,lot_id,ticket_code,qr_token,customer_name,email,gender,price,payment_status,email_sent_at",
    ).eq("id", ticketId).maybeSingle();
    if (ticketResult.error) throw new Error(ticketResult.error.message);
    const ticket: any = ticketResult.data;
    if (!ticket) return json(req, { ok: false, error: "Ingresso não encontrado." }, 404);
    if (ticket.payment_status !== "Pago") {
      return json(req, { ok: false, error: "O ingresso ainda não está pago." }, 409);
    }
    const email = String(ticket.email || "").trim().toLowerCase();
    if (!validEmail(email)) return json(req, { ok: false, error: "Cliente sem e-mail válido." }, 400);
    if (ticket.email_sent_at && !body?.force) {
      return json(req, { ok: true, already_sent: true, email_sent_at: ticket.email_sent_at });
    }
    const [eventResult, lotResult] = await Promise.all([
      supabase.from("events").select("name,artist_name,event_date,opening_time,venue,cover_image").eq("id", ticket.event_id).maybeSingle(),
      supabase.from("ticket_lots").select("name,sector").eq("id", ticket.lot_id).maybeSingle(),
    ]);
    if (eventResult.error || lotResult.error) throw new Error(eventResult.error?.message || lotResult.error?.message);
    await postMail({
      payment_status: "Pago",
      email,
      customer_name: ticket.customer_name,
      event_name: eventResult.data?.name || "HYPE LOUNGE CLUB",
      artist_name: eventResult.data?.artist_name || "",
      event_date: eventResult.data?.event_date || "",
      opening_time: eventResult.data?.opening_time || "",
      venue: eventResult.data?.venue || "",
      event_cover_image: eventResult.data?.cover_image || "",
      lot_name: lotResult.data?.name || "Ingresso",
      sector: lotResult.data?.sector || "",
      gender: ticket.gender || "",
      price: Number(ticket.price || 0),
      ticket_code: ticket.ticket_code,
      qr_token: ticket.qr_token || ticket.ticket_code,
    });
    const sentAt = new Date().toISOString();
    const update = await supabase.from("tickets").update({ email_sent_at: sentAt }).eq("id", ticket.id);
    if (update.error) throw new Error(update.error.message);
    await supabase.from("audit_logs").insert({
      staff_user_id: staff.id || null,
      action: body?.force ? "INGRESSO_EMAIL_REENVIADO" : "INGRESSO_EMAIL_ENVIADO",
      ticket_id: ticket.id,
      metadata: { email, event_id: ticket.event_id },
    });
    return json(req, { ok: true, email_sent: true, email_sent_at: sentAt });
  } catch (error) {
    return json(req, { ok: false, error: error instanceof Error ? error.message : "Erro ao enviar e-mail." }, 500);
  }
});
