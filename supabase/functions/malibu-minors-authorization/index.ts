import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const ORIGINS=new Set(["https://rogue-vendas.vercel.app","https://rogue-vendas.vercel.app","https://malibu-menores.vercel.app"]);
const TABLE="malibu_minor_authorizations_v1", BUCKET="malibu-guardian-private-v1";
const str=(v:any,n=120)=>String(v??"").trim().slice(0,n);
const digits=(v:any)=>String(v??"").replace(/\D/g,"");
function reply(req:Request,data:any,status=200){
 const origin=req.headers.get("origin")||"";
 return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://rogue-vendas.vercel.app",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"content-type,authorization,apikey,x-client-info","Vary":"Origin"}});
}
function validCpf(s:string){
 if(!/^\d{11}$/.test(s)||/^(\d)\1{10}$/.test(s))return false;
 for(let n=9;n<=10;n++){let sum=0;for(let i=0;i<n;i++)sum+=Number(s[i])*(n+1-i);if(Number(s[n])!==(sum*10)%11%10)return false;}
 return true;
}
function years(date:string,now:string){
 const d=new Date(date+"T12:00:00Z"),t=new Date(now+"T12:00:00Z");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(d.getTime())||d.toISOString().slice(0,10)!==date||isNaN(t.getTime()))return -1;
 return t.getUTCFullYear()-d.getUTCFullYear()-(t.getUTCMonth()<d.getUTCMonth()||(t.getUTCMonth()===d.getUTCMonth()&&t.getUTCDate()<d.getUTCDate())?1:0);
}
function img(v:any,kind:"jpeg"|"png",max=410000){
 const m=String(v||"").match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
 if(!m||m[1]!==kind||m[2].length>600000)throw Error("Imagem inválida ou muito grande");
 const s=atob(m[2]);if(s.length<120||s.length>max)throw Error("Imagem excede o limite");
 const bytes=Uint8Array.from(s,x=>x.charCodeAt(0));
 if(kind==="jpeg"&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error("Foto inválida");
 if(kind==="png"&&!(bytes[0]===137&&bytes[1]===80&&bytes[2]===78))throw Error("Assinatura inválida");
 return bytes;
}
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
async function permitted(db:any,b:any){
 const u=str(b.username,80),p=String(b.password||"");
 if(!u||!p)return null;
 const r=await db.rpc("verify_staff",{p_username:u,p_password:p});
 const a=Array.isArray(r.data)?r.data[0]:r.data;
 return !r.error&&a&&["admin","gerente"].includes(a.role)?a:null;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:reply(req,{}).headers});
 if(req.method!=="POST")return reply(req,{ok:false,error:"Método não permitido"},405);
 if(req.headers.get("origin")&&!ORIGINS.has(req.headers.get("origin")||""))return reply(req,{ok:false,error:"Origem não permitida"},403);
 try{
  const raw=await req.text();
  if(raw.length>3500000)return reply(req,{ok:false,error:"Fotos muito grandes"},413);
  const b=JSON.parse(raw),action=str(b.action,40);
  const url=Deno.env.get("SUPABASE_URL")||"",secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!secret)throw Error("Serviço indisponível");
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  if(action==="events")return reply(req,{ok:true,events:[]});
  if(action==="submit"){
   if(b.attend!==true||b.noAlcohol!==true||b.privacy!==true||b.guardianConfirmed!==true)
    return reply(req,{ok:false,error:"Aceite os termos obrigatórios."},400);
   const minorName=str(b.minorName),minorCpf=digits(b.minorCpf),minorBirth=str(b.minorBirth,10),minorEmail=str(b.minorEmail,254).toLowerCase();
   const guardianName=str(b.guardianName),guardianCpf=digits(b.guardianCpf),guardianBirth=str(b.guardianBirth,10);
   const guardianPhone=digits(b.guardianPhone),guardianEmail=str(b.guardianEmail,254).toLowerCase(),relation=str(b.relation,40);
   const emailOk=(s:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
   if(minorName.length<5||guardianName.length<5||!validCpf(minorCpf)||!validCpf(guardianCpf)||minorCpf===guardianCpf)
    return reply(req,{ok:false,error:"Confira nomes e CPFs informados."},400);
   if(![16,17].includes(years(minorBirth,today())))return reply(req,{ok:false,error:"Somente adolescentes com 16 ou 17 anos podem se cadastrar."},400);
   if(years(guardianBirth,today())<18||years(guardianBirth,today())>110)return reply(req,{ok:false,error:"Confira a data do responsável."},400);
   if(!emailOk(minorEmail)||(guardianEmail&&!emailOk(guardianEmail))||guardianPhone.length<10||guardianPhone.length>11||!["Pai","Mãe","Responsável legal"].includes(relation))
    return reply(req,{ok:false,error:"Confira e-mail, telefone e vínculo do responsável."},400);
   const found=await db.from(TABLE).select("id").eq("minor_cpf",minorCpf).limit(1);
   if(found.error)throw Error("Falha ao verificar CPF");
   if(found.data?.length)return reply(req,{ok:false,error:"Já existe autorização Malibu para este CPF. Consulte a administração."},409);
   const images=[
    ["selfie-menor.jpg",img(b.minorFacePhoto,"jpeg"),"image/jpeg","minor_face_photo_path"],
    ["documento-menor.jpg",img(b.minorDocumentPhoto,"jpeg"),"image/jpeg","minor_document_path"],
    ["responsavel.jpg",img(b.photo,"jpeg"),"image/jpeg","guardian_photo_path"],
    ["documento-responsavel.jpg",img(b.documentPhoto,"jpeg"),"image/jpeg","guardian_document_path"],
    ["assinatura.png",img(b.signature,"png",180000),"image/png","signature_path"]
   ] as const;
   const id=crypto.randomUUID(),storage=db.storage.from(BUCKET),paths:string[]=[],saved:Record<string,string>={};
   try{
    for(const [name,bytes,mime,field] of images){
     const path=id+"/"+name;const r=await storage.upload(path,bytes,{contentType:mime,upsert:false});
     if(r.error)throw Error("Falha ao salvar uma foto ou documento");
     paths.push(path);saved[field]=path;
    }
    const expiry=new Date(minorBirth+"T12:00:00Z");expiry.setUTCFullYear(expiry.getUTCFullYear()+18);
    const record={id,event_id:null,minor_name:minorName,minor_cpf:minorCpf,minor_birth_date:minorBirth,minor_email:minorEmail,
     guardian_name:guardianName,guardian_cpf:guardianCpf,guardian_birth_date:guardianBirth,
     guardian_phone:guardianPhone,guardian_email:guardianEmail,relation,
     ...saved,guardian_declares_responsibility:true,guardian_acknowledges_no_alcohol:true,privacy_consent:true,
     status:"pendente",expires_at:expiry.toISOString()};
    const r=await db.from(TABLE).insert(record).select("id").single();
    if(r.error){if(r.error.code==="23505")throw Error("Este CPF já possui uma autorização na Malibu");throw Error("Falha ao salvar a declaração");}
    return reply(req,{ok:true,protocol:id,status:"pendente",message:"Cadastro Malibu recebido. Aguarde a conferência pela equipe."});
   }catch(e){if(paths.length)await storage.remove(paths);throw e;}
  }
  const actor=await permitted(db,b);
  if(!actor)return reply(req,{ok:false,error:"Acesso restrito ao administrador ou gerente."},403);
  const id=str(b.id,40);
  const goodId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if(action==="list"){
   const r=await db.from(TABLE).select("id,event_id,minor_name,minor_cpf,guardian_name,guardian_cpf,status,created_at,reviewed_at,expires_at,email_notified_at,email_notification_error").order("created_at",{ascending:false}).limit(500);
   if(r.error)throw Error("Falha ao carregar autorizações");
   return reply(req,{ok:true,rows:r.data||[],events:[]});
  }
  if(["detail","review","correct_email"].includes(action)&&!goodId)return reply(req,{ok:false,error:"Protocolo inválido"},400);
  if(action==="detail"){
   const r=await db.from(TABLE).select("*").eq("id",id).maybeSingle();
   if(r.error||!r.data)return reply(req,{ok:false,error:"Cadastro não encontrado"},404);
   const {source_hash,...row}=r.data,st=db.storage.from(BUCKET);
   const keys=[["photoUrl","guardian_photo_path"],["documentUrl","guardian_document_path"],
    ["signatureUrl","signature_path"],["minorFaceUrl","minor_face_photo_path"],["minorDocumentUrl","minor_document_path"]];
   const links:Record<string,string|null>={};
   for(const [key,col] of keys){const path=row[col];const res=path?await st.createSignedUrl(path,120):null;links[key]=res?.data?.signedUrl||null;}
   return reply(req,{ok:true,row,...links});
  }
  if(action==="review"){
   const status=str(b.status,20),note=str(b.note,400);
   if(!["conferido","recusado"].includes(status)||b.documentsChecked!==true||b.eventEligibilityChecked!==true)
    return reply(req,{ok:false,error:"É obrigatória a revisão dos documentos e das regras de admissão."},400);
   const r=await db.from(TABLE).select("minor_birth_date,minor_face_photo_path,minor_document_path,guardian_document_path,checkout_ticket_id").eq("id",id).maybeSingle();
   if(r.error||!r.data)return reply(req,{ok:false,error:"Autorização não encontrada"},404);
   if(r.data.checkout_ticket_id)return reply(req,{ok:false,error:"Autorização vinculada a ingresso; consulte o ADM."},409);
   if(status==="conferido"&&(![16,17].includes(years(r.data.minor_birth_date,today()))||!r.data.minor_face_photo_path||!r.data.minor_document_path||!r.data.guardian_document_path))
    return reply(req,{ok:false,error:"Idade ou documentos obrigatórios inválidos"},409);
   const v=await db.from(TABLE).update({status,reviewed_at:new Date().toISOString(),reviewed_by:actor.username||actor.name,
    review_note:note,checkout_token_hash:null,checkout_token_expires_at:null}).eq("id",id).select("id,status").single();
   if(v.error)throw Error("Falha ao registrar decisão");
   return reply(req,{ok:true,row:v.data});
  }
  if(action==="correct_email"){
   const field=str(b.field,30),email=str(b.email,180).toLowerCase();
   if(!["guardian_email","minor_email"].includes(field)||b.contactVerified!==true||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return reply(req,{ok:false,error:"Confirme o e-mail com o responsável."},400);
   const r=await db.from(TABLE).update({[field]:email,email_notified_at:null,email_notification_error:"Gmail corrigido; aguardando reenvio."}).eq("id",id).select("id").maybeSingle();
   if(r.error||!r.data)return reply(req,{ok:false,error:"Não foi possível atualizar o e-mail"},409);
   return reply(req,{ok:true,email,field});
  }
  if(action==="purge"){
   const r=await db.from(TABLE).select("id,guardian_photo_path,guardian_document_path,signature_path,minor_face_photo_path,minor_document_path").lt("expires_at",new Date().toISOString()).limit(100);
   if(r.error)throw Error("Falha ao verificar registros vencidos");
   let removed=0;
   for(const x of r.data||[]){
    const paths=[x.guardian_photo_path,x.guardian_document_path,x.signature_path,x.minor_face_photo_path,x.minor_document_path].filter(Boolean);
    const wipe=await db.storage.from(BUCKET).remove(paths);
    if(wipe.error)continue;
    const del=await db.from(TABLE).delete().eq("id",x.id);if(!del.error)removed++;
   }
   return reply(req,{ok:true,removed});
  }
  return reply(req,{ok:false,error:"Ação inválida"},400);
 }catch(e){console.error("MALIBU_MINOR",e instanceof Error?e.message:String(e));return reply(req,{ok:false,error:e instanceof Error?e.message:"Falha no serviço"},400);}
});