import { createClient } from "npm:@supabase/supabase-js@2.57.4";
/* HYPE — somente cenário sintético, isolado dos cadastros e ingressos reais */
const ALLOWED=new Set(["https://hypeloungeclub.com.br","https://www.hypeloungeclub.com.br"]);
const TABLE="hype_minor_demo_v127";
const RESP=(req:Request,payload:unknown,status=200)=>{
 const origin=req.headers.get("origin")||"";
 return new Response(JSON.stringify(payload),{status,headers:{
 "Content-Type":"application/json","Cache-Control":"no-store",
 "Access-Control-Allow-Origin":ALLOWED.has(origin)?origin:"https://hypeloungeclub.com.br",
 "Access-Control-Allow-Methods":"OPTIONS,POST",
 "Access-Control-Allow-Headers":"content-type,authorization,apikey,x-client-info",
 "Vary":"Origin"
 }});
};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:RESP(req,{}).headers});
 if(req.method!=="POST")return RESP(req,{ok:false,error:"Método não permitido"},405);
 const origin=req.headers.get("origin")||"";
 if(!ALLOWED.has(origin))return RESP(req,{ok:false,error:"Acesso permitido somente pelo site oficial"},403);
 try{
  const raw=await req.text();
  if(raw.length>2000)return RESP(req,{ok:false,error:"Dados de demonstração inválidos"},413);
  const b=JSON.parse(raw||"{}");
  const action=String(b.action||"").slice(0,40);
  const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!secret)throw Error("Serviço indisponível");
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});

  if(action==="submit"){
    // O visitante não pode enviar nomes, CPFs, documento, selfie ou assinatura ao servidor de testes.
    if(Object.keys(b).some(k=>k!=="action"))return RESP(req,{ok:false,error:"Este teste aceita apenas o cenário fictício fixo."},400);
    const oneHourAgo=new Date(Date.now()-60*60*1000).toISOString();
    const count=await db.from(TABLE).select("id",{count:"exact",head:true}).gte("created_at",oneHourAgo);
    if(count.error)throw Error("Falha ao validar limite dos testes.");
    if((count.count||0)>=60)return RESP(req,{ok:false,error:"Limite de demonstrações atingido. Tente mais tarde."},429);
    const insert=await db.from(TABLE).insert({status:"pendente"}).select("id,created_at,status").single();
    if(insert.error)throw Error("Falha ao criar o teste.");
    return RESP(req,{ok:true,record:insert.data,mode:"demo",message:"Teste recebido pelo ADM. Nenhum ingresso ou autorização real foi criado."});
  }

  if(action==="preview"){
    const id=String(b.id||"");
    if(!/^[a-f0-9-]{36}$/i.test(id))return RESP(req,{ok:false,error:"Link de demonstração inválido"},400);
    const row=await db.from(TABLE).select("id,status").eq("id",id).maybeSingle();
    if(row.error||!row.data)return RESP(req,{ok:false,error:"Teste fictício não encontrado"},404);
    if(row.data.status!=="conferido")return RESP(req,{ok:false,error:"Este teste ainda não foi conferido no Admin"},403);
    // Apenas informações inteiramente sintéticas: nenhum dado de clientes ou autorizações reais.
    return RESP(req,{ok:true,mode:"demo",id:row.data.id,status:row.data.status,
      minorName:"Lucas Exemplo",minorCpf:"000.000.000-01",
      guardianName:"Mariana Exemplo",guardianEmail:"igorribas425@gmail.com",
      minorEmail:"matheusanjosb@gmail.com",eventName:"Festa fictícia HYPE",
      price:30,sector:"Pista — Menor 16-17",allNight:true});
  }

  const username=String(b.username||"").trim().slice(0,100);
  const password=String(b.password||"");
  if(!username||!password)return RESP(req,{ok:false,error:"Acesso restrito ao ADM"},403);
  const who=await db.rpc("verify_staff",{p_username:username,p_password:password});
  const staff=Array.isArray(who.data)?who.data[0]:who.data;
  if(who.error||!staff||!["admin","gerente"].includes(String(staff.role||"").toLowerCase()))
     return RESP(req,{ok:false,error:"Acesso permitido somente para ADM ou gerente."},403);

  if(action==="list"){
    const q=await db.from(TABLE).select("id,created_at,status,reviewed_at,reviewed_by").order("created_at",{ascending:false}).limit(40);
    if(q.error)throw Error("Não foi possível listar demonstrações.");
    return RESP(req,{ok:true,mailReady:Boolean(((Deno.env.get("HYPE_MINOR_APPS_SCRIPT_URL")||"")&&(Deno.env.get("HYPE_MINOR_EMAIL_SECRET")||""))||((Deno.env.get("BREVO_API_KEY")||"")&&(Deno.env.get("BREVO_FROM_EMAIL")||Deno.env.get("RESEND_FROM_EMAIL")))||((Deno.env.get("RESEND_API_KEY")||Deno.env.get("HYPE_RESEND_API_KEY"))&&Deno.env.get("HYPE_NOTIFICATION_FROM"))),rows:q.data||[],sample:{minor_name:"Lucas Exemplo",minor_cpf:"000.000.000-01",guardian_name:"Mariana Exemplo",guardian_cpf:"000.000.000-02",relation:"Mãe"},mode:"demo"});
  }
  if(action==="review"){
    const id=String(b.id||""),status=String(b.status||"");
    if(!/^[a-f0-9-]{36}$/i.test(id)||!["pendente","conferido","recusado"].includes(status))return RESP(req,{ok:false,error:"Parâmetros inválidos."},400);
    const up=await db.from(TABLE).update({status,reviewed_at:status==="pendente"?null:new Date().toISOString(),reviewed_by:status==="pendente"?null:String(staff.username||username)})
      .eq("id",id).select("id,status").maybeSingle();
    if(up.error||!up.data)throw Error("Teste não encontrado.");
    let emailSent=false,emailError="",manualLink="";
    const emails=["igorribas425@gmail.com","matheusanjosb@gmail.com"];
    if(status==="conferido"){
      emailError="A demonstração não envia link de compra. Baixe o PDF fictício e confira o QR Code no Admin.";
    }
    if(status==="recusado"){
      const link="";
      if(status==="conferido")manualLink=link;
      try{
        const ans=await fetch(url+"/functions/v1/hype-minor-email",{
          method:"POST",
          headers:{"Content-Type":"application/json","Authorization":"Bearer "+secret},
          body:JSON.stringify({kind:status==="conferido"?"demo":"demo_rejected",emails,
            link:status==="conferido"?link:"",minorName:"Lucas Exemplo",eventName:"Festa fictícia HYPE"})
        });
        const d=await ans.json().catch(()=>({}));
        if(!ans.ok||!d.ok)throw Error(d.error||"Envio não confirmado");
        emailSent=true;
        manualLink="";
      }catch(err){emailError=err instanceof Error?err.message:"Falha de envio";}
      await db.from(TABLE).update({email_notified_at:emailSent?new Date().toISOString():null,email_notification_error:emailError||null}).eq("id",id);
    }
    return RESP(req,{ok:true,record:up.data,mode:"demo",emailSent,emailError,emails,manualLink});
  }
  if(action==="delete"){
    const id=String(b.id||"");
    if(!/^[a-f0-9-]{36}$/i.test(id))return RESP(req,{ok:false,error:"Protocolo inválido."},400);
    const del=await db.from(TABLE).delete().eq("id",id).select("id").maybeSingle();
    if(del.error)throw Error("Falha ao excluir teste.");
    return RESP(req,{ok:true,deleted:!!del.data});
  }
  return RESP(req,{ok:false,error:"Ação inválida."},400);
 }catch(err){
   console.error("[HYPE_MINOR_DEMO]",err instanceof Error?err.message:String(err));
   return RESP(req,{ok:false,error:"Não foi possível concluir a simulação."},500);
 }
});
