import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const DEFAULT_ORIGINS = ["https://hypeloungeclub.com.br","https://www.hypeloungeclub.com.br"];

function corsHeaders(req: Request){
  const origin=req.headers.get("origin")||"";
  return {
    "Access-Control-Allow-Origin": DEFAULT_ORIGINS.includes(origin)?origin:DEFAULT_ORIGINS[0],
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Content-Type":"application/json",
    "Vary":"Origin"
  };
}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:corsHeaders(req)});}
function firstRow(data:any){return Array.isArray(data)?data[0]:data;}

async function asaasRequest(path:string){
  const apiKey=Deno.env.get("ASAAS_API_KEY")||Deno.env.get("ASAAS_ACCESS_TOKEN");
  if(!apiKey) throw new Error("ASAAS_API_KEY não configurada.");
  const base=(Deno.env.get("ASAAS_API_URL")||"https://api.asaas.com/v3").replace(/\/$/,"");
  const res=await fetch(`${base}${path}`,{headers:{accept:"application/json",access_token:apiKey,"User-Agent":"Hype Lounge Club"}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){
    const msg=Array.isArray(data?.errors)?data.errors.map((x:any)=>x?.description||x?.message||x?.code).filter(Boolean).join(" | "):data?.message||data?.error||"Erro na API do Asaas.";
    throw new Error(msg);
  }
  return data;
}
async function verifyStaff(sb:any,body:any){
  const username=String(body?.username||"").trim();
  const password=String(body?.password||"");
  if(!username||!password) return null;
  const r=await sb.rpc("verify_staff",{p_username:username,p_password:password});
  if(r.error) throw new Error(r.error.message);
  const row=firstRow(r.data);
  return row&&["admin","gerente","caixa"].includes(String(row.role||""))?row:null;
}
async function verifyDevice(sb:any,body:any){
  const key=String(body?.device_key||"").trim();
  if(key.length<20) return null;
  const r=await sb.rpc("portaria_device_status_v18",{p_device_key:key});
  if(r.error) throw new Error(r.error.message);
  const row=firstRow(r.data);
  return row?.active===true?row:null;
}


/* HYPE V205: mesma confirmação Pix + tentativa imediata de e-mail Resend.
   Nunca marcar enviado antes de o provedor aceitar o QR. */
function coverUrlV205(cover:unknown,eventId:unknown){
 const raw=String(cover||"");
 if(!raw.startsWith("data:image/"))return raw;
 const base=Deno.env.get("SUPABASE_URL")||"";
 const id=Number(eventId);
 return base&&Number.isInteger(id)&&id>0
  ?base.replace(/\/$/,"")+"/functions/v1/event-cover?event_id="+encodeURIComponent(String(id)):"";
}
async function emailAfterPixV205(sb:any,t:any,serviceRole:string,url:string){
 const email=String(t.email||"").trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("E-mail do comprador inválido.");
 if(!t.ticket_code||!t.qr_token)throw new Error("Ingresso sem código ou QR Code para envio.");
 const [eventResult,lotResult]=await Promise.all([
  sb.from("events").select("name,artist_name,event_date,opening_time,venue,cover_image").eq("id",t.event_id).maybeSingle(),
  sb.from("ticket_lots").select("name,sector").eq("id",t.lot_id).maybeSingle()
 ]);
 if(eventResult.error||lotResult.error)throw new Error("Não foi possível carregar os dados do ingresso.");
 const ev=eventResult.data||{},lot=lotResult.data||{};
 const response=await fetch(url.replace(/\/$/,"")+"/functions/v1/hype-resend-ticket",{
  method:"POST",
  headers:{"Content-Type":"application/json","Authorization":"Bearer "+serviceRole},
  body:JSON.stringify({
   payment_status:"Pago",email,customer_name:t.customer_name,
   event_name:ev.name||"HYPE LOUNGE CLUB",artist_name:ev.artist_name||"",
   event_date:ev.event_date||"",opening_time:ev.opening_time||"",venue:ev.venue||"",
   event_cover_image:coverUrlV205(ev.cover_image,t.event_id),
   lot_name:lot.name||"Ingresso",sector:lot.sector||"",
   gender:t.gender||"",price:Number(t.price||0),
   ticket_code:t.ticket_code,qr_token:t.qr_token
  }),
  signal:AbortSignal.timeout(22000)
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok||result.ok!==true){
  throw new Error(String(result.error||"Resend não aceitou o QR Code.").slice(0,220));
 }
 const marked=await sb.from("tickets")
  .update({email_sent_at:new Date().toISOString()})
  .eq("id",t.id).eq("payment_status","Pago").is("email_sent_at",null);
 if(marked.error)throw new Error("Resend aceitou o e-mail, mas não foi possível registrar o envio: "+marked.error.message);
 return true;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(req)});
  if(req.method!=="POST") return json(req,{ok:false,error:"Método não permitido."},405);
  try{
    const body=await req.json().catch(()=>({}));
    const ticketId=Number(body?.ticket_id||0);
    if(!Number.isInteger(ticketId)||ticketId<=0) return json(req,{ok:false,error:"ticket_id inválido."},400);

    const url=Deno.env.get("SUPABASE_URL");
    const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!key) throw new Error("Configuração interna do Supabase ausente.");
    const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

    const [staff,device]=await Promise.all([verifyStaff(sb,body),verifyDevice(sb,body)]);
    if(!staff&&!device) return json(req,{ok:false,error:"Sem permissão para sincronizar pagamento."},403);

    const tRes=await sb.from("tickets").select("id,event_id,lot_id,ticket_code,qr_token,customer_name,email,gender,price,payment_status,payment_method,paid_at,email_sent_at,asaas_payment_id").eq("id",ticketId).maybeSingle();
    if(tRes.error) throw new Error(tRes.error.message);
    const t:any=tRes.data;
    if(!t) return json(req,{ok:false,error:"Ingresso não encontrado."},404);
    if(t.payment_status==="Pago") return json(req,{ok:true,paid:true,already_paid:true,ticket_id:t.id});
    if(t.payment_status!=="Pendente"||!t.asaas_payment_id) return json(req,{ok:true,paid:false,status:t.payment_status||"SEM COBRANÇA",ticket_id:t.id});

    const payment=await asaasRequest(`/payments/${encodeURIComponent(String(t.asaas_payment_id))}`);
    const status=String(payment?.status||"").toUpperCase();
    const value=Number(payment?.value);
    if(Number.isFinite(value)&&Math.abs(value-Number(t.price||0))>0.009) throw new Error("Valor do Asaas diferente do valor do ingresso.");
    if(String(payment?.externalReference||"")&&String(payment.externalReference)!==String(t.id)) throw new Error("Cobrança Asaas não pertence a este ingresso.");

    const paid=["RECEIVED","CONFIRMED"].includes(status);
    if(!paid) return json(req,{ok:true,paid:false,status,ticket_id:t.id});

    const paidAt=t.paid_at||new Date().toISOString();
    // Corrida entre dois celulares/abas: só quem efetivamente mudou de pendente
    // para pago dispara o QR, evitando que duas sincronizações enviem duplicados.
    const upd=await sb.from("tickets").update({
      payment_status:"Pago",
      paid_at:paidAt,
      payment_method:"PIX Asaas",
      asaas_payment_id:String(payment.id)
    }).eq("id",t.id).eq("payment_status","Pendente").select("id");
    if(upd.error) throw new Error(upd.error.message);
    const newlyConfirmed=Array.isArray(upd.data)&&upd.data.length===1;

    if(newlyConfirmed){
      const audit=await sb.from("audit_logs").insert({
        staff_user_id:staff?.id||null,
        action:"PAGAMENTO_ASAAS_SINCRONIZADO",
        ticket_id:t.id,
        metadata:{event_id:t.event_id,asaas_payment_id:String(payment.id),status,device_id:device?.device_id||null}
      });
      if(audit.error)console.error("[HYPE][asaas-sync] log pagamento",audit.error.message);
    }

    let emailSent=false,emailError="";
    if(newlyConfirmed&&!t.email_sent_at){
      try{
        emailSent=await emailAfterPixV205(sb,t,key,url);
      }catch(err){
        emailError=String(err instanceof Error?err.message:err).slice(0,220);
        console.error("[HYPE][asaas-sync] Pix pago, e-mail pendente",{ticket_id:t.id,error:emailError});
        // O pagamento é válido mesmo que falhe o Resend.
        const logged=await sb.from("audit_logs").insert({
          staff_user_id:null,action:"INGRESSO_EMAIL_PROVIDER_ERRO",ticket_id:t.id,
          metadata:{error:emailError,origem:"asaas-sync",provider:"resend",retry_after_minutes:30}
        });
        if(logged.error)console.error("[HYPE][asaas-sync] log email",logged.error.message);
      }
    }
    // Se outra aba confirmou, ela é a responsável pelo envio; cron recupera
    // eventuais falhas posteriores, sem alterar o status de pagamento.
    return json(req,{ok:true,paid:true,status,ticket_id:t.id,paid_at:paidAt,
      email_sent:emailSent,email_pending:newlyConfirmed&&!emailSent,
      ...(emailError?{email_error:emailError}:{})});
  }catch(error){
    return json(req,{ok:false,error:error instanceof Error?error.message:"Erro ao sincronizar pagamento."},500);
  }
});