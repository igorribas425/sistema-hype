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

function mailEsc(value: unknown) {
  return String(value??"").replace(/[&<>"']/g,(x)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]||x));
}
async function sendAlreadyHasTicketNotice(supabase:any,eventId:number,cpf:string,enteredEmail:string) {
  // A verificação do CPF + e-mail da compra e o intervalo anti-spam são atômicos no banco.
  // Não envia para e-mail novo informado por terceiros e não expõe o ingresso ao formulário.
  const {data,error}=await supabase.rpc("hype_claim_ticket_list_notice_v230",{
    p_event_id:eventId,p_cpf:cpf,p_email:enteredEmail
  });
  if(error){console.warn("[HYPE][lista-aviso] Falha ao verificar duplicidade");return;}
  const ticket=firstRow(data);
  if(!ticket?.claimed || !ticket?.ticket_id || !ticket?.destination)return;
  let status="failed",providerId="",reason="";
  try{
    const key=Deno.env.get("BREVO_API_KEY")||"";
    const from=Deno.env.get("BREVO_FROM_EMAIL")||Deno.env.get("RESEND_FROM_EMAIL")||"";
    if(!key||!from)throw new Error("Brevo não configurado");
    const eventName=String(ticket.event_name||"a festa da HYPE").slice(0,130);
    const customer=String(ticket.full_name||"Cliente HYPE").slice(0,140);
    const site="https://hypeloungeclub.com.br/cliente.html?event="+encodeURIComponent(String(eventId));
    const html="<div style='font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#111015;color:#fff;padding:25px;border-radius:16px'>"+
      "<div style='font-weight:800;font-size:23px;letter-spacing:3px'>HYPE <span style='color:#ed3886'>LOUNGE</span> CLUB</div>"+
      "<h2 style='margin-top:25px'>Você já garantiu seu ingresso! 🎟️</h2>"+
      "<p>Olá, "+mailEsc(customer)+"!</p>"+
      "<p>Recebemos uma tentativa de cadastro na Lista FREE ou Lista/Promoter para <b>"+mailEsc(eventName)+"</b>."+
      " Identificamos que você <b>já possui um ingresso confirmado</b> para esta festa.</p>"+
      "<p>Por isso, não é necessário entrar em outra lista e nenhum segundo QR Code será criado.</p>"+
      "<p>Se precisar consultar seu ingresso original, acesse o site da HYPE. Caso não consiga abrir o QR, apresente seu nome completo e documento na portaria para conferência do cadastro.</p>"+
      "<p style='margin:26px 0'><a href='"+site+"' style='background:#e6337e;color:white;padding:13px 17px;text-decoration:none;border-radius:9px;font-weight:bold'>CONSULTAR MEU INGRESSO</a></p>"+
      "<p style='font-size:12px;color:#bcb6c0'>Este aviso é informativo; não cancela nem altera seu ingresso. Não é um novo ingresso ou QR Code.</p></div>";
    const response=await fetch("https://api.brevo.com/v3/smtp/email",{
      method:"POST",
      headers:{"api-key":key,"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({
        sender:{name:"HYPE Lounge Club",email:from},
        to:[{email:String(ticket.destination).trim().toLowerCase()}],
        subject:"HYPE | Você já possui ingresso para "+eventName,
        htmlContent:html
      }),signal:AbortSignal.timeout(16000)
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok||!body?.messageId)throw Error("Brevo: HTTP "+response.status);
    status="sent";providerId=String(body.messageId).slice(0,180);
  }catch(err){
    reason=String(err instanceof Error?err.message:err).slice(0,180);
    console.warn("[HYPE][lista-aviso] Brevo não aceitou envio",{status:reason});
  }
  const {error:saveError}=await supabase.from("hype_ticket_list_notice_v230").update({
    status,sent_at:status==="sent"?new Date().toISOString():null,provider_id:providerId||null,error:reason||null
  }).eq("ticket_id",ticket.ticket_id).eq("event_id",eventId);
  if(saveError)console.warn("[HYPE][lista-aviso] Falha ao atualizar histórico");
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
    const promoterCode = requiredText(form, "promoter_code", 65).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,62}$/.test(promoterCode)) throw new Error("Link de convite inválido.");
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

    const result = await supabase.rpc("public_promoter_guest_submit_v206", {
      p_promoter_code: promoterCode,
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
    if (result.error) {
      const errorText=String(result.error.message||"");
      if (/Ja existe ingresso para este CPF nesta festa/i.test(errorText)) {
        await sendAlreadyHasTicketNotice(supabase,eventId,cpf,email);
        throw new Error("Você já possui um ingresso para esta festa. Não é possível entrar novamente na Lista/Promoter. Consulte o ingresso original ou informe seu nome e documento na portaria.");
      }
      throw new Error(errorText);
    }
    const row = firstRow(result.data) || {};
    if (row.ok !== true) throw new Error(row.message || "Não foi possível concluir o cadastro.");
    if(String(row.message||"").includes("Ja existe cadastro")) {
      await sendAlreadyHasTicketNotice(supabase,eventId,cpf,email);
    }

    return json(req, {
      ok: true,
      message: row.message || "Convite enviado para análise.",
      list_id: row.list_id || null,
      event_id: row.event_id || eventId,
      event_name: row.event_name || "",
      status: row.status || "Pendente",
      promoter_code: promoterCode,
    });
  } catch (error) {
    if (uploadedPath && supabase) {
      await supabase.storage.from(BUCKET).remove([uploadedPath]).catch(() => undefined);
    }
    return json(req, { ok: false, error: error instanceof Error ? error.message : "Não foi possível concluir o cadastro." }, 400);
  }
});

