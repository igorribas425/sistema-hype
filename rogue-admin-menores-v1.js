/* Hype admin: consulta segura dos menores da Rogue, sem mutações. */
(()=>{"use strict";
 const $=id=>document.getElementById(id);
 const URL="https://etxvkvdsnqqdkonvbgzf.supabase.co/functions/v1/rogue-hype-minors-readonly-v1";
 const STATUS={pendente:"⏳ PENDENTE",conferido:"✅ CONFERIDO",recusado:"⛔ RECUSADO"};
 let rows=[],loaded=false,running=false,showAll=false,currentId=null;
 function creds(){
  try{if(typeof HYPE!=="undefined"&&HYPE.user&&HYPE.pass&&["admin","gerente"].includes(HYPE.role))
  return {username:HYPE.user,password:HYPE.pass};}catch(_){}
  return null;
 }
 function setStatus(message,error=false){const e=$("rogueMinorStatus");if(!e)return;e.textContent=message;e.dataset.error=String(error)}
 function element(tag,text,className){
  const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text??"");if(className)e.className=className;return e;
 }
 function clear(el){while(el?.firstChild)el.removeChild(el.firstChild)}
 async function api(action,params={}){
   const c=creds();if(!c)throw Error("Acesso restrito a ADM ou gerente da Hype.");
   const r=await fetch(URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...c,...params}),cache:"no-store",credentials:"omit"});
   const data=await r.json().catch(()=>({}));
   if(!r.ok||data.ok!==true)throw Error(String(data.error||"Não foi possível consultar a Rogue.").slice(0,220));
   return data;
 }
 function render(){
  const pending=rows.filter(x=>x.status==="pendente").length;
  const checked=rows.filter(x=>x.status==="conferido").length;
  const rejected=rows.filter(x=>x.status==="recusado").length;
  $("rogueMinorCountPending").textContent=pending;
  $("rogueMinorCountChecked").textContent=checked;
  $("rogueMinorCountRejected").textContent=rejected;
  const query=($("rogueMinorSearch").value||"").trim().toLocaleLowerCase("pt-BR");
  const filtered=rows.filter(r=>{
   const hay=[r.minor_name,r.guardian_name,r.id].map(v=>String(v||"").toLocaleLowerCase("pt-BR")).join(" ");
   return (!query?showAll||r.status==="pendente":hay.includes(query));
  });
  const list=$("rogueMinorList");clear(list);
  if(!filtered.length){list.append(element("p",query?"Nenhuma ficha corresponde à pesquisa.":showAll?"Nenhuma autorização cadastrada.":"Sem autorizações pendentes."));return;}
  for(const item of filtered){
   const row=element("article",undefined,"rm-row");
   const left=element("div");
   left.append(element("strong",String(item.minor_name||"Menor não identificado")));
   left.append(element("small","Responsável: "+String(item.guardian_name||"Não informado")));
   const created=String(item.created_at||"").slice(0,10);
   left.append(element("small",(STATUS[item.status]||String(item.status||"Sem status"))+" • "+(created||"Data não informada")));
   const btn=element("button","VER FICHA");btn.type="button";btn.addEventListener("click",()=>detail(item.id));
   row.append(left,btn);list.append(row);
  }
 }
 function field(box,label,value){
  const item=element("div",undefined,"rm-field");
  item.append(element("b",label),element("span",String(value??"—")||"—"));box.append(item);
 }
 function photo(wrapper,label,url){
  if(!url||typeof url!=="string")return;
  try{const u=new URL(url);if(u.protocol!=="https:"||u.hostname!=="etxvkvdsnqqdkonvbgzf.supabase.co")return}catch{return}
  const item=element("div",undefined,"rm-picture");
  item.append(element("strong",label));
  const pic=document.createElement("img");pic.alt=label;pic.src=url;pic.loading="lazy";pic.referrerPolicy="no-referrer";item.append(pic);
  wrapper.append(item);
 }
 async function detail(id){
  if(!/^[a-f0-9-]{36}$/i.test(String(id||"")))return;
  const target=$("rogueMinorDetail");target.hidden=false;clear(target);
  target.append(element("p","Buscando documentos privados da Rogue…"));
  setStatus("Consultando a ficha selecionada...");
  try{
   const data=await api("detail",{id}),r=data.row||{};
   clear(target);target.append(element("h3","Ficha de autorização da Rogue"));
   const box=element("div",undefined,"rm-info");
   field(box,"Menor",r.minor_name);field(box,"CPF do menor",r.minor_cpf);
   field(box,"Nascimento do menor",r.minor_birth_date);field(box,"E-mail do menor",r.minor_email);
   field(box,"Responsável",r.guardian_name);field(box,"CPF do responsável",r.guardian_cpf);
   field(box,"Nascimento do responsável",r.guardian_birth_date);
   field(box,"Vínculo",r.relation);field(box,"WhatsApp",r.guardian_phone);field(box,"E-mail do responsável",r.guardian_email);
   field(box,"Situação",STATUS[r.status]||r.status);field(box,"Validade",r.expires_at?.slice(0,10));
   field(box,"Observações da análise",r.review_note);
   target.append(box);
   const imgs=element("div",undefined,"rm-pictures");
   photo(imgs,"Foto do responsável",data.photoUrl);photo(imgs,"Documento do responsável",data.documentUrl);
   photo(imgs,"Assinatura",data.signatureUrl);photo(imgs,"Selfie do menor",data.minorFaceUrl);
   photo(imgs,"Documento do menor",data.minorDocumentUrl);
   target.append(imgs);
   const note=element("p","Documentos com acesso temporário. Confirme documentos originais presencialmente. Aprovação e reenvio continuam desativados.");
   note.className="rm-description";target.append(note);
   setStatus("Ficha carregada para conferência. Nenhuma alteração foi feita.");
   target.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(err){clear(target);target.append(element("p",String(err.message||err)));setStatus("Falha ao consultar a ficha: "+String(err.message||err),true)}
 }
 async function load(){
  if(running)return;
  running=true;$("rogueMinorRefresh").disabled=true;setStatus("Consultando solicitações da Rogue...");
  try{
   const data=await api("list");rows=Array.isArray(data.rows)?data.rows:[];
   loaded=true;render();setStatus("Rogue: "+rows.length+" autorização(ões) encontradas. Somente consulta; nenhuma alteração realizada.");
  }catch(err){setStatus("Erro: "+String(err.message||err),true)}
  finally{running=false;$("rogueMinorRefresh").disabled=false}
 }
 function init(){
  $("rogueMinorRefresh")?.addEventListener("click",load);
  $("rogueMinorShowAll")?.addEventListener("click",()=>{
   showAll=!showAll;$("rogueMinorShowAll").textContent=showAll?"⏳ SOMENTE PENDENTES":"📂 VER TODOS OS STATUS";render();
  });
  $("rogueMinorSearch")?.addEventListener("input",render);
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
 window.RogueMinorAdminV1={load};
})();
