import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {PDFDocument,StandardFonts,rgb} from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.4";
const origins=new Set(["https://hypeloungeclub.com.br","https://www.hypeloungeclub.com.br"]);
function reply(req:Request,data:any,status=200){const origin=req.headers.get("origin")||"";return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":origins.has(origin)?origin:"https://hypeloungeclub.com.br","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"content-type,authorization,apikey,x-client-info","Vary":"Origin"}})}
const text=(v:any,max=120)=>String(v??"").trim().slice(0,max).replace(/[\u{10000}-\u{10FFFF}]/gu,"").replace(/[\u200b-\u200f\u2028-\u202f]/g,"");
const hex=(s:any)=>/^[a-f0-9]{8}-[a-f0-9-]{27,28}$/i.test(String(s||""));
function asBase64(bytes:Uint8Array){let out="";for(let i=0;i<bytes.length;i+=16384){out+=String.fromCharCode(...bytes.slice(i,i+16384));}return btoa(out)}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:reply(req,{}).headers});
 if(req.method!=="POST")return reply(req,{ok:false,error:"Método inválido"},405);
 const origin=req.headers.get("origin")||"";
 if(origin&&!origins.has(origin))return reply(req,{ok:false,error:"Origem não permitida"},403);
 try{
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",url=Deno.env.get("SUPABASE_URL")||"";
  if(!service||!url)throw Error("Ambiente indisponível");
  const b=await req.json();
  const id=String(b.id||"");
  if(!hex(id))return reply(req,{ok:false,error:"Protocolo inválido"},400);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const internal=req.headers.get("Authorization")==="Bearer "+service;
  const deviceKey=String(b.deviceKey||"").trim();
  if(deviceKey&&!internal)return reply(req,{ok:false,error:"Use credenciais do ADM autorizado da Malibu."},403);
  let portariaDevice=false;
  if(!internal){
    if(deviceKey){
      if(!/^[a-f0-9]{64}$/i.test(deviceKey))return reply(req,{ok:false,error:"Credencial da Portaria inválida"},403);
      const access=await db.rpc("portaria_device_status_v18",{p_device_key:deviceKey});
      const device=Array.isArray(access.data)?access.data[0]:access.data;
      if(access.error||!device||device.active!==true||device.revoked_at)
        return reply(req,{ok:false,error:"Este aparelho não está autorizado no Admin"},403);
      portariaDevice=true;
    }else{
      const username=String(b.username||"").trim(),password=String(b.password||"");
      if(!username||!password)return reply(req,{ok:false,error:"Acesso restrito"},403);
      const verified=await db.rpc("verify_staff",{p_username:username,p_password:password});
      const staff=Array.isArray(verified.data)?verified.data[0]:verified.data;
      if(verified.error||!staff||!["admin","gerente"].includes(staff.role))
        return reply(req,{ok:false,error:"Acesso não autorizado"},403);
    }
  }
  const q=await db.from("malibu_minor_authorizations_v1").select("*").eq("id",id).maybeSingle();
  const a=q.data;
  if(q.error||!a)return reply(req,{ok:false,error:"Autorização não encontrada"},404);
  if(a.status!=="conferido")return reply(req,{ok:false,error:"Somente autorizações conferidas podem gerar documento"},409);
  if(portariaDevice){
    const activeEvent=Math.floor(Number(b.eventId)||0);
    if(a.event_id!==null&&Number(a.event_id)!==activeEvent)
      return reply(req,{ok:false,error:"Este PDF pertence a outro evento"},403);
    if(a.expires_at&&Date.parse(a.expires_at)<Date.now())
      return reply(req,{ok:false,error:"Autorização vencida"},410);
    console.log("[PORTARIA_MINOR_DOCUMENT] "+id.slice(0,8)+" • evento "+activeEvent);
  }
  const ev=a.event_id?await db.from("events").select("name,event_date").eq("id",a.event_id).maybeSingle():null;
  if(a.event_id&&(ev?.error||!ev?.data))throw Error("Evento indisponível");
  const eventLabel=a.event_id?ev?.data?.name:"TODAS AS FESTAS MALIBU";
  const eventDate=a.event_id?ev?.data?.event_date:null;
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const birth=String(a.minor_birth_date||"");
  const years=Number(today.slice(0,4))-Number(birth.slice(0,4))-(today.slice(5)<birth.slice(5)?1:0);
  if(a.event_id===null&&(![16,17].includes(years)||(a.expires_at&&Date.parse(a.expires_at)<Date.now())))
    return reply(req,{ok:false,error:"Autorização geral vencida ao completar 18 anos."},410);
  const bucket=db.storage.from("malibu-guardian-private-v1");
  const paths=[a.minor_face_photo_path,a.minor_document_path,a.guardian_photo_path,a.guardian_document_path,a.signature_path];
  if(paths.some(p=>!p))return reply(req,{ok:false,error:"Selfie, documentos ou assinatura incompletos"},409);
  const images=await Promise.all(paths.map(p=>bucket.download(p)));
  if(images.some(v=>v.error||!v.data))return reply(req,{ok:false,error:"Não foi possível recuperar as fotos privadas"},500);
  const pdf=await PDFDocument.create();pdf.setTitle("MALIBU - Autorização de menor");pdf.setAuthor("MALIBU Lounge Club");
  const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const burg=rgb(.72,.12,.31),ink=rgb(.18,.14,.19),gray=rgb(.46,.40,.45),white=rgb(1,1,1);
  const page1=pdf.addPage([595.28,841.89]);
  function header(page:any,subtitle:string){
   page.drawRectangle({x:0,y:747,width:595.28,height:94,color:rgb(.11,.075,.13)});
   page.drawText("MALIBU",{x:42,y:799,size:24,font:bold,color:white});
   page.drawText(subtitle,{x:42,y:776,size:12,font:bold,color:rgb(1,.69,.80)});
   page.drawRectangle({x:0,y:741,width:595.28,height:6,color:burg});
  }
  const fmt=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||""))return text(s);const [y,m,d]=s.split("-");return d+"/"+m+"/"+y};
  const val=(a:any)=>text(a,95).replace(/[\r\n]+/g," ");
  function row(page:any,y:number,label:string,value:any){page.drawText(label,{x:42,y,size:10,font:bold,color:burg});const valueText=val(value);let str=valueText;while(str&&font.widthOfTextAtSize(str,10)>355)str=str.slice(0,-1);page.drawText(str||"-",{x:191,y,size:10,font,color:ink})}
  header(page1,"AUTORIZAÇÃO CONFERIDA • APRESENTAÇÃO PRESENCIAL");
  page1.drawText("Dados declarados pelo menor e pelo responsável",{x:42,y:714,size:15,font:bold,color:ink});
  const data=[
   ["Abrangência",eventLabel],["Validade",a.event_id?fmt(eventDate):"Até completar 18 anos; se não revogada"],
   ["Nome do menor",a.minor_name],["CPF do menor",a.minor_cpf],
   ["Nascimento do menor",fmt(a.minor_birth_date)],["Gmail do menor",a.minor_email],
   ["Nome do responsável",a.guardian_name],["CPF do responsável",a.guardian_cpf],
   ["Nascimento responsável",fmt(a.guardian_birth_date)],["WhatsApp responsável",a.guardian_phone],
   ["Gmail do responsável",a.guardian_email],["Vínculo declarado",a.relation],
   ["Analisado por",a.reviewed_by||"Equipe MALIBU"],["Data da análise",a.reviewed_at?new Date(a.reviewed_at).toLocaleDateString("pt-BR",{timeZone:"UTC"}):"-"],
   ["Ingresso", "Consultar na portaria"],
   ["Pagamento","SOMENTE NA MALIBU, NO EVENTO"]
  ];
  let y=680;for(const [label,value] of data){row(page1,y,label,value);y-=23;}
  page1.drawRectangle({x:42,y:251,width:511,height:52,color:rgb(.97,.91,.94),borderColor:burg,borderWidth:1});
  page1.drawText("AUTORIZAÇÃO CONFERIDA - NÃO É INGRESSO",{x:52,y:281,size:12,font:bold,color:burg});
  page1.drawText("A entrada depende de documentos originais e regras de cada festa.",{x:52,y:265,size:9,font,color:ink});
  const qrUrl="https://hypeloungeclub.com.br/malibu-menores-portaria.html?protocolo="+id;
  const qr=QRCode.create(qrUrl,{errorCorrectionLevel:"M"});
  const mod=qr.modules.size,unit=2.05,ox=43,oy=42;
  page1.drawRectangle({x:ox-8,y:oy-8,width:mod*unit+16,height:mod*unit+16,color:white});
  const m=qr.modules.data;
  for(let r=0;r<mod;r++)for(let c=0;c<mod;c++)if(m[r*mod+c])page1.drawRectangle({x:ox+c*unit,y:oy+(mod-r-1)*unit,width:unit+0.01,height:unit+0.01,color:ink});
  page1.drawText("QR CODE DE AUTORIZAÇÃO",{x:192,y:176,size:13,font:bold,color:burg});
  page1.drawText("A equipe lê o QR e consulta o cadastro no sistema restrito.",{x:192,y:157,size:9,font,color:ink});
  page1.drawText("O próprio menor pode apresentar o QR e seus documentos.",{x:192,y:141,size:9,font,color:ink});
  page1.drawText("Isso não dispensa acompanhante quando a regra exigir.",{x:192,y:125,size:9,font,color:ink});
  page1.drawText("Protocolo: "+id,{x:192,y:94,size:8,font,color:gray});
  page1.drawText("É proibido fornecer bebidas alcoólicas a menores de 18 anos.",{x:42,y:23,size:9,font:bold,color:burg});
  const page2=pdf.addPage([595.28,841.89]);header(page2,"ANEXO DE IDENTIFICAÇÃO • FOTOS E ASSINATURA");
  page2.drawText("Imagens fornecidas durante o cadastro",{x:42,y:708,size:15,font:bold,color:ink});
  async function photo(blob:Blob,index:number){const bytes=new Uint8Array(await blob.arrayBuffer());return index===4?pdf.embedPng(bytes):pdf.embedJpg(bytes)}
  const embedded=await Promise.all(images.map((v,i)=>photo(v.data!,i)));
  function photoBlock(label:string,img:any,x:number,y:number,w:number,h:number){
   page2.drawText(label,{x,y:y+h+12,size:10,font:bold,color:burg});
   page2.drawRectangle({x,y,width:w,height:h,color:rgb(.98,.97,.98),borderColor:rgb(.84,.73,.79),borderWidth:1});
   const scale=Math.min((w-12)/img.width,(h-12)/img.height);
   page2.drawImage(img,{x:x+(w-img.width*scale)/2,y:y+(h-img.height*scale)/2,width:img.width*scale,height:img.height*scale});
  }
  photoBlock("SELFIE DO MENOR",embedded[0],42,466,241,187);
  photoBlock("DOCUMENTO DO MENOR",embedded[1],312,466,241,187);
  photoBlock("SELFIE DO RESPONSÁVEL",embedded[2],42,246,241,171);
  photoBlock("DOCUMENTO DO RESPONSÁVEL",embedded[3],312,246,241,171);
  photoBlock("ASSINATURA DO RESPONSÁVEL",embedded[4],42,77,511,116);
  page2.drawText("Fotos e documentos sujeitos à conferência presencial dos originais.",{x:42,y:43,size:9,font,color:gray});
  page2.drawText("Somente a MALIBU pode validar a autorização. Este PDF não comprova pagamento.",{x:42,y:27,size:9,font:bold,color:burg});
  const bytes=await pdf.save({useObjectStreams:true});
  if(bytes.length>4200000)return reply(req,{ok:false,error:"PDF ultrapassou o tamanho permitido. Ajuste as fotos do cadastro."},413);
  return reply(req,{ok:true,id,filename:"MALIBU-AUTORIZACAO-"+id.slice(0,8)+".pdf",mime:"application/pdf",base64:asBase64(bytes),minorName:a.minor_name,eventName:eventLabel,guardianEmail:a.guardian_email,minorEmail:a.minor_email});
 }catch(err){console.error("[MALIBU_MINOR_PDF]",err instanceof Error?err.message:String(err));return reply(req,{ok:false,error:"Não foi possível gerar o PDF desta autorização"},500)}
});