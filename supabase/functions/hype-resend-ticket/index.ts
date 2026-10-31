import QRCode from "npm:qrcode@1.5.4";

const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store"}
});
function safe(value:unknown,limit=200){
  return String(value??"").trim().slice(0,limit);
}
function esc(value:unknown){
  return safe(value,500).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
}
function emailValid(v:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function equal(a:string,b:string){
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  let diff=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++)
    diff|=(x[i%x.length]||0)^(y[i%y.length]||0);
  return diff===0;
}
function fmtDate(value:unknown){
  const raw=safe(value,40);
  if(!raw)return "Consulte os detalhes do evento";
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match?match[3]+"/"+match[2]+"/"+match[1]:raw;
}
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return respond({ok:false,error:"Método inválido"},405);
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const header=req.headers.get("Authorization")||"";
  if(!service||!equal(header,"Bearer "+service))return respond({ok:false,error:"Não autorizado"},403);
  // Brevo torna-se o provedor principal apenas quando sua chave for configurada no Supabase.
  // Sem BREVO_API_KEY, o fluxo atual do Resend permanece inalterado.
  const brevoKey=Deno.env.get("BREVO_API_KEY")||"";
  const brevoFrom=Deno.env.get("BREVO_FROM_EMAIL")||Deno.env.get("RESEND_FROM_EMAIL")||"";
  const apiKey=Deno.env.get("RESEND_API_KEY")||"";
  const from=Deno.env.get("RESEND_FROM_EMAIL")||"";
  if(brevoKey&&!emailValid(brevoFrom))return respond({ok:false,configured:false,error:"Remetente Brevo inválido. Confira BREVO_FROM_EMAIL."},503);
  if(!brevoKey&&(!apiKey||!from))return respond({ok:false,configured:false,error:"Configure BREVO_API_KEY e BREVO_FROM_EMAIL, ou RESEND_API_KEY e RESEND_FROM_EMAIL."},503);
  try{
    const raw=await req.text();
    if(raw.length>14000)return respond({ok:false,configured:true,error:"Dados do e-mail muito grandes"},413);
    const b=JSON.parse(raw);
    const email=safe(b.email,254).toLowerCase();
    const name=safe(b.customer_name,120);
    const code=safe(b.ticket_code,65);
    const token=safe(b.qr_token,140);
    const event=safe(b.event_name,120)||"HYPE LOUNGE CLUB";
    if(!emailValid(email)||!name||!token||!code||!/^(HYPE-|LISTA-)/i.test(code)||b.payment_status!=="Pago")
      return respond({ok:false,configured:true,error:"Ingresso/Lista não confirmado ou destinatário inválido"},422);
    const sector=safe(b.sector||b.lot_name,80)||"Ingresso";
    const price=Number(b.price)||0;
    const priceLabel=price<=0?"FREE":price.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
    const png=await QRCode.toDataURL(token,{width:440,margin:3,errorCorrectionLevel:"M"});
    const base64=png.split(",")[1];
    if(!base64)throw new Error("Falha ao gerar QR Code");
    const eventDay=fmtDate(b.event_date);
    const venue=safe(b.venue,180);
    // Retoma o modelo visual do ingresso HYPE (arte do evento + detalhes + QR).
    // O layout evita emoji/icones especiais que exibiam caracteres quebrados no Gmail.
    const isGuest=Boolean(b.guest_list);
    const lot=safe(b.lot_name||b.sector,100)||"Ingresso";
    const gender=safe(b.gender,50);
    const opening=safe(b.opening_time,40);
    const artist=safe(b.artist_name,150);
    const message=safe(b.guest_list_message,230);
    const coverRaw=safe(b.event_cover_image,1000);
    let cover="";
    try {
      const parsed=new URL(coverRaw);
      const validHosts=["hypeloungeclub.com.br","www.hypeloungeclub.com.br","igorribas425.github.io","txxoqfcwqncqyiqgzboz.supabase.co"];
      if(parsed.protocol==="https:"&&validHosts.includes(parsed.hostname)&&!parsed.username&&!parsed.password){
        cover=parsed.toString();
      }
    }catch(_){}
    const heading=isGuest?"LISTA HYPE APROVADA":"INGRESSO CONFIRMADO";
    // Link individual: bilhete pago/FREE é consultado pelo código, não cria outro Pix.
    // Convidados da lista usam o PNG anexado, sem novo cadastro.
    const accessUrl=isGuest?"https://hypeloungeclub.com.br/lista.html":
      "https://hypeloungeclub.com.br/cliente.html?ticket="+encodeURIComponent(code);
    const accessLabel=isGuest?"ABRIR SITE DA LISTA HYPE":"ABRIR MEU QR CODE NO SITE";
    const subject=(isGuest?"Lista HYPE aprovada - ":"Ingresso confirmado - ")+event;
    const details=(label,value)=>
      value?"<tr><td style='padding:8px 4px;color:#c1b9c6;font:14px Arial,sans-serif;width:38%;vertical-align:top'>"+esc(label)+"</td><td style='padding:8px 4px;color:#ffffff;font:bold 15px Arial,sans-serif;overflow-wrap:anywhere;word-break:break-word'>"+esc(value)+"</td></tr>":"";
    const posterHtml=cover?
      "<tr><td style='padding:0 18px 16px'><img src='"+esc(cover)+"' alt='Arte do evento "+esc(event)+"' width='524' style='display:block;width:100%;max-width:524px;height:auto;border:0;border-radius:14px'></td></tr>":"";
    const html="<!doctype html><html lang='pt-BR'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1'></head>"
      +"<body style='background-color:#0b0b10;color:#fff;margin:0;padding:16px 8px;font-family:Arial,Helvetica,sans-serif'>"
      +"<table role='presentation' cellpadding='0' cellspacing='0' border='0' align='center' width='100%' style='max-width:560px;margin:0 auto;background-color:#101016;border:1px solid #34303b;border-radius:18px'>"
      +"<tr><td style='text-align:center;padding:27px 18px 12px'>"
      +"<div style='font:bold 23px Arial,sans-serif;letter-spacing:3px;color:#ffffff'>HYPE <span style='color:#ff3e89'>LOUNGE</span> CLUB</div>"
      +"<p style='color:#ff78aa;font:bold 12px Arial,sans-serif;letter-spacing:2px;margin:14px 0'>"+heading+"</p>"
      +"</td></tr>"
      +posterHtml
      +"<tr><td style='padding:15px 27px 19px;text-align:center'>"
      +"<p style='color:#c9c2ce;font-size:12px;letter-spacing:4px;margin:5px 0 12px'>HYPE LOUNGE CLUB</p>"
      +"<h1 style='font:bold 29px Arial,sans-serif;line-height:1.2;margin:0 0 14px;color:#fff'>"+esc(event)+"</h1>"
      +(artist?"<p style='color:#cfc8d4;font-size:16px;margin:0 0 12px'>"+esc(artist)+"</p>":"")
      +"<p style='color:#d8cfdd;font-size:14px;margin:0 0 8px'>"+esc(eventDay)+(opening?" &bull; "+esc(opening):"")+"</p>"
      +(venue?"<p style='color:#aaa4b1;font-size:13px;margin:0'>"+esc(venue)+"</p>":"")
      +"</td></tr>"
      +"<tr><td style='padding:7px 22px 16px'>"
      +"<div style='border:1px solid #494450;background:#17161d;border-radius:16px;padding:20px 19px'>"
      +"<div style='font:bold 12px Arial,sans-serif;color:#b6aebd;letter-spacing:2px;border-bottom:1px solid #494450;padding-bottom:17px;margin-bottom:15px'>SEU INGRESSO</div>"
      +"<p style='font:bold 17px Arial,sans-serif;color:#ffffff;margin:0 0 15px'>"+esc(name)+"</p>"
      +"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse'>"
      +details("Categoria",lot)
      +details("Setor",sector&&sector.toLowerCase()!==lot.toLowerCase()?sector:"")
      +details("Gênero",gender)
      +details("Valor",priceLabel)
      +details("Código",code)
      +"</table></div></td></tr>"
      +"<tr><td style='padding:9px 18px 3px;text-align:center'>"
      +"<div style='background:#ffffff;border-radius:17px;display:inline-block;padding:13px'>"
      +"<img src='cid:hype-ticket-qr' alt='QR Code oficial do ingresso HYPE' width='270' height='270' style='width:270px;height:270px;max-width:100%;display:block;border:0'>"
      +"</div>"
      +"<p style='color:#d4cbd8;font-size:13px;line-height:1.6;margin:22px 12px 10px'>"+(message?esc(message):"Apresente este QR Code junto com seu documento na portaria.")+"</p>"
      +"<p style='color:#9f96a4;font-size:12px;margin:5px 12px 17px'>O QR Code &eacute; individual. N&atilde;o compartilhe com outras pessoas.</p>"
      +"<a href='"+esc(accessUrl)+"' style='display:inline-block;background:#ef367b;padding:14px 23px;border-radius:9px;color:#ffffff;text-decoration:none;font:bold 13px Arial,sans-serif;letter-spacing:1px'>"+accessLabel+"</a>"
      +"<p style='color:#aa9fac;font-size:12px;margin:18px 10px 8px'>Se a imagem do QR n&atilde;o aparecer, abra o PNG anexado. Para ingressos pagos e FREE, use tamb&eacute;m o bot&atilde;o acima para abrir o QR diretamente no site. N&atilde;o compre novamente.</p>"
      +"</td></tr>"
      +"<tr><td style='text-align:center;padding:20px 20px 26px;color:#827b8a;font-size:11px'>HYPE LOUNGE CLUB &bull; Ingresso oficial</td></tr>"
      +"</table></body></html>";
    const plain=heading+"\n\n"+name+"\nEvento: "+event+"\nData: "+eventDay+"\nLocal: "+venue+"\nCategoria: "+lot+"\nSetor: "+sector+"\nGênero: "+gender+"\nValor: "+priceLabel+"\nCódigo: "+code+"\n\nApresente o QR Code PNG anexo com seu documento. Acesse "+accessUrl+"\n";
    const payload:any={
      from,to:[email],subject,html,text:plain,
      attachments:[{filename:"QR-"+code.replace(/[^A-Z0-9-]/gi,"")+".png",content:base64,content_type:"image/png",content_id:"hype-ticket-qr"}]
    };
    const reply=Deno.env.get("RESEND_REPLY_TO");
    if(reply&&emailValid(reply))payload.reply_to=reply;
    if(brevoKey){
      // E-mail transacional simples, legível sem imagens externas.
      // Evita HTML pesado/arte externa que pode prejudicar a leitura e a classificação.
      // QR oficial permanece em PNG anexado. Ingressos pagos/FREE têm link individual.
      const brevoDetails=[
        ["Titular",name],["Evento",event],["Data",eventDay],
        ["Local",venue],["Categoria",lot],["Valor",priceLabel],["Código",code]
      ].filter(([,value])=>Boolean(value)).map(([label,value])=>
        "<tr><td style='padding:7px 10px 7px 0;color:#52525b;vertical-align:top'>"+esc(label)+"</td>"+
        "<td style='padding:7px 0;color:#18181b;font-weight:600;vertical-align:top'>"+esc(value)+"</td></tr>"
      ).join("");
      const brevoButton=isGuest?"":(
        "<p style='margin:22px 0'><a href='"+esc(accessUrl)+"'"+
        " style='display:inline-block;padding:13px 18px;background:#c02667;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold'>"+
        "Abrir meu ingresso no site da HYPE</a></p>"
      );
      const brevoHtml="<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'>"+
        "<meta name='viewport' content='width=device-width,initial-scale=1'></head>"+
        "<body style='margin:0;background:#ffffff;color:#18181b;font:15px/1.6 Arial,Helvetica,sans-serif'>"+
        "<main style='max-width:580px;margin:0 auto;padding:24px'>"+
        "<div style='font-size:19px;font-weight:bold;color:#b91c5c'>HYPE Lounge Club</div>"+
        "<h1 style='font-size:23px;line-height:1.3;margin:18px 0 10px;color:#18181b'>"+
        (isGuest?"Sua entrada na Lista HYPE foi aprovada":"Seu ingresso está confirmado")+"</h1>"+
        "<p>Olá, "+esc(name)+".</p>"+
        "<p>"+(isGuest?"Seu cadastro foi aprovado para o evento abaixo.":"Seu pagamento foi confirmado e seu ingresso está liberado.")+
        " O QR Code individual está no <strong>arquivo PNG anexado a este e-mail</strong>.</p>"+
        "<table role='presentation' style='border-collapse:collapse;width:100%;border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7'>"+
        brevoDetails+"</table>"+
        brevoButton+
        "<p>"+(isGuest?"Abra o PNG anexado e apresente com seu documento na portaria.":
        "Se não conseguir abrir o anexo, use o botão acima para consultar o QR Code original no site. Não é necessário comprar outro ingresso.")+"</p>"+
        "<p style='color:#52525b;font-size:13px'>Este é um e-mail automático sobre seu ingresso da HYPE Lounge Club. "+
        "Por segurança, o QR Code é individual e válido conforme as regras do evento.</p>"+
        "<p style='font-size:12px;color:#71717a'>HYPE Lounge Club | hypeloungeclub.com.br</p>"+
        "</main></body></html>";
      const brevoPayload:any={
        sender:{name:"HYPE Lounge Club",email:brevoFrom},
        to:[{email,name}],
        subject,htmlContent:brevoHtml,textContent:plain,
        attachment:[{name:"QR-"+code.replace(/[^A-Z0-9-]/gi,"")+".png",content:base64}]
      };
      const answer=await fetch("https://api.brevo.com/v3/smtp/email",{
        method:"POST",headers:{"api-key":brevoKey,"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify(brevoPayload),signal:AbortSignal.timeout(18000)
      });
      const data=await answer.json().catch(()=>({}));
      if(!answer.ok||!data?.messageId){
        const err=safe(data?.message||data?.code||"Provedor recusou o envio",200);
        console.error("[HYPE][Brevo] Falhou",{status:answer.status});
        return respond({ok:false,configured:true,error:"Brevo: "+err},answer.status===429?429:502);
      }
      console.log("[HYPE][Brevo] Aceito",{id:data.messageId});
      return respond({ok:true,configured:true,provider:"brevo",message_id:data.messageId});
    }
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(18000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.id){
      const err=safe(data?.message||data?.error||"Provedor recusou o envio",210);
      console.error("[HYPE][Resend] Falhou", {status:response.status,type:safe(data?.name,60)});
      return respond({ok:false,configured:true,error:"Resend: "+err},response.status===429?429:502);
    }
    console.log("[HYPE][Resend] Aceito",{id:data.id});
    return respond({ok:true,configured:true,provider:"resend",message_id:data.id});
  }catch(err){
    const msg=err instanceof Error?err.message:"Falha no provedor";
    console.error("[HYPE][Resend] Erro técnico",msg.slice(0,160));
    return respond({ok:false,configured:true,error:"Resend indisponível: "+msg.slice(0,150)},502);
  }
});