import {createClient} from "npm:@supabase/supabase-js@2.57.4";
const origins=new Set(["https://hypeloungeclub.com.br","https://www.hypeloungeclub.com.br"]);
function out(req:Request,data:any,status=200){const origin=req.headers.get("origin")||"";return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":origins.has(origin)?origin:"https://hypeloungeclub.com.br","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"content-type,apikey,authorization,x-client-info","Vary":"Origin"}});}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:out(req,{}).headers});
 if(req.method!=="POST")return out(req,{ok:false,error:"Método inválido"},405);
 const origin=req.headers.get("origin")||"";
 if(origin&&!origins.has(origin))return out(req,{ok:false,error:"Origem bloqueada"},403);
 try{
  const b=await req.json(),id=String(b.id||"");
  if(!/^[a-f0-9-]{36}$/i.test(id))return out(req,{ok:false,error:"Protocolo inválido"},400);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"",role=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!supabaseUrl||!role)throw Error("Serviço indisponível");
  const db=createClient(supabaseUrl,role,{auth:{persistSession:false,autoRefreshToken:false}});
  const user=String(b.username||"").trim(),pass=String(b.password||"");
  if(!user||!pass)return out(req,{ok:false,error:"Acesso restrito"},403);
  const who=await db.rpc("verify_staff",{p_username:user,p_password:pass});
  const staff=Array.isArray(who.data)?who.data[0]:who.data;
  if(who.error||!staff||!["admin","gerente"].includes(staff.role))return out(req,{ok:false,error:"Sem permissão"},403);
  const record=await db.from("hype_minor_authorizations_v120")
     .select("id,status,event_id,guardian_email,minor_email,minor_name,minor_birth_date,minor_face_photo_path,minor_document_path,guardian_document_path,checkout_ticket_id")
     .eq("id",id).maybeSingle();
  const a=record.data;
  if(record.error||!a||!["conferido","recusado"].includes(a.status))return out(req,{ok:false,error:"Decisão ainda não concluída"},409);
  const emailGood=(v:any)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||"").trim());
  const emails=[a.guardian_email,a.minor_email].map((x:any)=>String(x||"").trim().toLowerCase());
  if(!emails.every(emailGood))return out(req,{ok:false,error:"Faltam os dois Gmails na autorização. Solicite um novo cadastro."},409);
  const ev=a.event_id?await db.from("events").select("name,event_date,active").eq("id",a.event_id).maybeSingle():null;
  if(a.event_id&&(ev?.error||!ev?.data))throw Error("Evento indisponível");
  const eventLabel=a.event_id?ev?.data?.name:"TODAS AS FESTAS HYPE";
  const eventDate=a.event_id?ev?.data?.event_date:
    new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  let sent=false,mailError="",provider="";
  try{
    let sendBody:any={kind:a.status==="conferido"?"authorization_pdf":"rejected",
      emails,minorName:a.minor_name,eventName:eventLabel};
    if(a.status==="conferido"){
      const bd=new Date(a.minor_birth_date+"T12:00:00Z"),ed=new Date(eventDate+"T12:00:00Z");
      let years=ed.getUTCFullYear()-bd.getUTCFullYear();
      if(ed.getUTCMonth()<bd.getUTCMonth()||(ed.getUTCMonth()===bd.getUTCMonth()&&ed.getUTCDate()<bd.getUTCDate()))years--;
      if(![16,17].includes(years)||!a.minor_face_photo_path||!a.minor_document_path||!a.guardian_document_path)
        throw Error("Cadastro sem idade elegível ou sem fotos dos documentos.");
      const fileResponse=await fetch(supabaseUrl+"/functions/v1/hype-minor-pdf",{
        method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+role},
        body:JSON.stringify({id})});
      const file=await fileResponse.json().catch(()=>({}));
      if(!fileResponse.ok||!file.ok||!file.base64)throw Error(file.error||"Não foi possível gerar o PDF da autorização.");
      sendBody={...sendBody,filename:file.filename,pdfBase64:file.base64};
    }
    const response=await fetch(supabaseUrl+"/functions/v1/hype-minor-email",{
      method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+role},
      body:JSON.stringify(sendBody)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true)throw Error(data.error||"Serviço não confirmou o envio.");
    sent=true;provider=String(data.provider||"gmail").slice(0,30);
  }catch(e){mailError=e instanceof Error?e.message:"Falha de notificação";}
  await db.from("hype_minor_authorizations_v120").update({
    email_notified_at:sent?new Date().toISOString():null,email_notification_error:mailError||null
  }).eq("id",id);
  return out(req,{ok:true,emailSent:sent,emailError:mailError,emails,provider,
    message:sent?"PDF da autorização enviado aos dois Gmails.":"Análise salva. O envio automático do PDF ainda não foi confirmado."});

 }catch(e){console.error("notify",e instanceof Error?e.message:String(e));return out(req,{ok:false,error:"Não foi possível preparar as notificações"},500)}
});