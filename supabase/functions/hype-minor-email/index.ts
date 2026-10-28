import { createClient } from "npm:@supabase/supabase-js@2.57.4";
function res(data:any,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
function esc(v:any){return String(v??"").replace(/[&<>"']/g,(x)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]||x));}

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return res({ok:false,error:"Método não permitido"},405);
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const auth=req.headers.get("Authorization")||"";
 if(!service||auth!=="Bearer "+service)return res({ok:false,error:"Sem permissão"},403);
 try{
  const body=await req.json();
  const kind=String(body.kind||"");
  if(!["demo","demo_rejected","approved","rejected","authorization_pdf"].includes(kind))return res({ok:false,error:"Tipo de envio inválido"},400);
  const recipients=Array.from(new Set((Array.isArray(body.emails)?body.emails:[])
    .map((e:any)=>String(e||"").trim().toLowerCase())
    .filter((e:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))));
  if(recipients.length<1||recipients.length>2)return res({ok:false,error:"Informe 1 ou 2 Gmails válidos"},400);
  if(kind==="authorization_pdf"){
    const b64=String(body.pdfBase64||"");
    const filename=String(body.filename||"HYPE-AUTORIZACAO.pdf");
    const minor=String(body.minorName||"Adolescente").slice(0,100);
    const event=String(body.eventName||"HYPE Lounge Club").slice(0,100);
    if(!/^[A-Za-z0-9+/=\r\n]+$/.test(b64)||b64.length<5000||b64.length>5800000||
       !/^HYPE-AUTORIZACAO-[0-9a-f]{8}\.pdf$/i.test(filename))
      return res({ok:false,error:"PDF de autorização inválido"},400);
    const subject="HYPE | Autorização conferida de "+minor+" — PDF com QR Code";
    const html="<div style='font:15px/1.65 Arial,sans-serif;background:#f8f1f5;padding:24px;color:#30202b'><div style='max-width:590px;margin:auto;background:white;border:1px solid #e4d0da;border-radius:18px;overflow:hidden'><div style='background:#1c101e;color:white;padding:25px 28px;border-bottom:5px solid #c52d63'><b style='font-size:25px'>HYPE LOUNGE CLUB</b><p style='margin-bottom:0;color:#ffc0d4'>AUTORIZAÇÃO DE MENORES</p></div><div style='padding:25px'><p style='background:#dff5e6;padding:13px;border-radius:9px;color:#11643a;font-weight:bold'>✅ AUTORIZAÇÃO CONFERIDA</p><h2 style='color:#3f2340'>Olá! A autorização de "+esc(minor)+" foi conferida.</h2><p>Evento: <strong>"+esc(event)+"</strong></p><p>O documento de autorização com QR Code, informações cadastradas, fotos dos documentos e assinatura do responsável está <strong>anexado em PDF</strong> a este e-mail.</p><h3 style='color:#a92658'>Como apresentar na Hype</h3><p>O próprio adolescente pode apresentar o PDF e o QR Code à equipe, junto com seus documentos originais. A equipe verifica o cadastro e as regras do evento; caso um acompanhante seja exigido, a autorização não o dispensa.</p><p>Se tudo estiver regular, o ingresso Pista de <strong>R$ 30,00 para a noite toda</strong> será comprado <strong>somente presencialmente na Hype</strong>.</p><p style='padding:14px;background:#fff0f3;border:1px solid #e7c6d0;border-radius:8px;color:#913c58'><b>Importante:</b> este PDF é uma autorização, não é ingresso, não comprova pagamento e não libera entrada automaticamente. É proibido fornecer bebidas alcoólicas a menores de 18 anos.</p><p style='color:#947c8e;font-size:12px'>HYPE Lounge Club • Confirme sempre os documentos originais na portaria.</p></div></div></div>";
    const apiKey=Deno.env.get("RESEND_API_KEY")||Deno.env.get("HYPE_RESEND_API_KEY")||"";
    const from=Deno.env.get("RESEND_FROM_EMAIL")||Deno.env.get("HYPE_NOTIFICATION_FROM")||"";
    if(apiKey&&from){
      const sent=await fetch("https://api.resend.com/emails",{
        method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
        body:JSON.stringify({from,to:recipients,subject,html,attachments:[{filename,content:b64}]})
      });
      const data=await sent.json().catch(()=>({}));
      if(sent.ok&&data.id)return res({ok:true,accepted:true,recipient_count:recipients.length,provider:"resend",provider_id:data.id});
      return res({ok:false,error:"Resend não aceitou o PDF: "+String(data.message||sent.status).slice(0,170)},502);
    }
    return res({ok:false,configured:false,error:"Resend dos menores não configurado: verifique RESEND_API_KEY e RESEND_FROM_EMAIL.",needs_setup:true},503);
  }
  const apiKey=Deno.env.get("RESEND_API_KEY")||Deno.env.get("HYPE_RESEND_API_KEY")||"";
  const from=Deno.env.get("RESEND_FROM_EMAIL")||Deno.env.get("HYPE_NOTIFICATION_FROM")||"";
  if(!apiKey||!from)return res({ok:false,configured:false,error:"Resend dos menores não configurado: verifique RESEND_API_KEY e RESEND_FROM_EMAIL.",needs_setup:true},503);
  const url=String(body.link||"");
  if((kind==="approved"||kind==="demo")&&(!url.startsWith("https://hypeloungeclub.com.br/")&&!url.startsWith("https://www.hypeloungeclub.com.br/")))return res({ok:false,error:"Link oficial inválido"},400);
  const minor=String(body.minorName||"Adolescente").slice(0,120);
  const event=String(body.eventName||"HYPE Lounge Club").slice(0,120);
  const confirmed=kind==="demo"||kind==="approved";
  const subject=(kind.startsWith("demo")?"[TESTE FICTÍCIO] ":"")+(confirmed?"HYPE — Autorização conferida e link de compra":"HYPE — Resultado da autorização");
  const message=kind==="demo_rejected"?"Simulação fictícia da HYPE. A análise do cadastro sintético foi RECUSADA. Não existem ingresso, cobrança, nem adolescente real vinculados.":kind==="demo"?
    "Simulação fictícia do painel ADM da HYPE. Nenhum menor foi identificado, nenhuma compra foi liberada, nenhuma cobrança e nenhum ingresso real foram gerados.":
    confirmed?"A autorização de "+minor+" para "+event+" foi conferida pela HYPE. O link exclusivo permite comprar ingresso de Pista, noite toda, por R$ 30. A entrada depende da conferência presencial de documentos e das regras do evento.":
    "A autorização de "+minor+" para "+event+" não foi aprovada. Entre em contato com a HYPE para esclarecimentos.";
  const html="<div style='font:16px/1.6 Arial,sans-serif;max-width:590px;padding:26px;color:#25151c'><h2 style='color:#c22258'>HYPE LOUNGE CLUB</h2><h3>"+esc(subject)+"</h3><p>"+esc(message)+"</p>"+(confirmed?"<p><a style='background:#c22258;color:#fff;text-decoration:none;padding:13px 17px;border-radius:8px;display:inline-block' href='"+esc(url)+"'>"+(kind==="demo"?"ABRIR LINK FICTÍCIO":"COMPRAR INGRESSO AUTORIZADO")+"</a></p><p style='overflow-wrap:anywhere'>"+esc(url)+"</p>":"")+"<p style='color:#855d70;font-size:13px'>É proibido fornecer bebidas alcoólicas a menores de 18 anos. O documento original será conferido na portaria.</p></div>";
  const fetchResult=await fetch("https://api.resend.com/emails",{
    method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({from,to:recipients,subject,html})
  });
  const out=await fetchResult.json().catch(()=>({}));
  if(!fetchResult.ok||!out.id)return res({ok:false,error:"Serviço de e-mail recusou o envio: "+String(out.message||fetchResult.status).slice(0,150)},502);
  return res({ok:true,accepted:true,recipient_count:recipients.length,provider:"resend",provider_id:out.id});
 }catch(e){console.error("minor-mail",e instanceof Error?e.message:String(e));return res({ok:false,error:"Falha no serviço de notificações"},500)}
});