/* HYPE V161 — Consulta pelos aparelhos autorizados da Portaria, sem login duplicado.
   Supabase valida o dispositivo antes de revelar nomes ou gerar PDFs privados. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const AUTH="https://txxoqfcwqncqyiqgzboz.supabase.co/functions/v1/hype-minors-authorization";
const DEVICE_KEY="hype_portaria_device_key_v18";
const PDF="https://txxoqfcwqncqyiqgzboz.supabase.co/functions/v1/hype-minor-pdf";
let rows=[],ready=false,busy=false,pdfUrl=null;
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const years=(date,t)=>{if(!date)return-1;let y=Number(t.slice(0,4))-Number(date.slice(0,4));if(t.slice(5)<String(date).slice(5))y--;return y;};
function alertMsg(msg,error=false){const el=$("minorDoorStatus");if(el){el.textContent=msg;el.style.color=error?"#ffb2c0":"#b9f9d5";}}
function access(){
  if($("portariaApp")?.classList.contains("hidden"))throw Error("Aguarde a autorização da Portaria.");
  const deviceKey=localStorage.getItem(DEVICE_KEY)||"";
  if(!/^[a-f0-9]{64}$/i.test(deviceKey))throw Error("O aparelho não está autorizado. Solicite acesso pelo Admin.");
  return {deviceKey,eventId:Math.max(0,Number($("eventSelect")?.value)||0)};
}
async function request(url,b){
 const resp=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b),cache:"no-store"});
 const data=await resp.json().catch(()=>({}));
 if(!resp.ok||!data.ok)throw Error(data.error||"Falha ao consultar o sistema");
 return data;
}
function cleanup(){if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl=null;}const viewer=$("minorDoorPdfViewer");if(viewer){viewer.hidden=true;viewer.replaceChildren();}}
function openToggle(){
 const panel=$("minorDoorPanel"),isOpening=panel.hidden;
 panel.hidden=!isOpening;
 const toggle=$("minorDoorToggle");
 toggle.setAttribute("aria-expanded",String(isOpening));
 toggle.textContent=isOpening?"VER MENOS ▴":"VER MAIS ▾";
 $("minorDoorSection")?.classList.toggle("minor-door-open",isOpening);
 if(isOpening){
   if(!ready)load();
   else render();
 }else{
   cleanup();
 }
}
function relevant(r){
 const eventId=Number($("eventSelect")?.value||0);
 return r.event_id==null||Number(r.event_id)===eventId;
}
function normalize(value){
 return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").trim();
}
function render(){
 const box=$("minorDoorList"),search=normalize($("minorDoorSearch").value);
 const subset=rows.filter(relevant).filter(r=>!search||[r.minor_name,r.guardian_name,r.id].some(x=>normalize(x).includes(search)));
 box.replaceChildren();
 $("minorDoorTotal").textContent=subset.length+" autorização(ões) aprovada(s) e válida(s)";
 if(!subset.length){const empty=document.createElement("p");empty.className="minor-door-hint";empty.textContent=search?"Nenhum menor aprovado encontrado para este nome.":"Nenhuma autorização válida encontrada para este evento.";box.append(empty);return;}
 for(const r of subset){
  const card=document.createElement("article");card.className="minor-door-person";
  const info=document.createElement("div");info.className="minor-door-person-info";
  const name=document.createElement("strong");name.textContent=r.minor_name||"Adolescente";
  const small=document.createElement("span");small.textContent="Responsável: "+(r.guardian_name||"—")+" • "+(r.event_id==null?"Autorização geral":"Evento específico");
  const button=document.createElement("button");button.type="button";button.className="btn green";button.textContent="📄 VER PDF";button.dataset.id=r.id;
  button.addEventListener("click",()=>showPDF(r,button));
  info.append(name,small);card.append(info,button);box.append(card);
 }
}
async function load(){
 if(busy)return;
 let credentials;try{credentials=access();}catch(err){alertMsg(err.message,true);return;}
 const btn=$("minorDoorLoad");busy=true;btn.disabled=true;btn.textContent="ATUALIZANDO...";
 cleanup();ready=false;$("minorDoorList").replaceChildren();
 $("minorDoorTotal").textContent="Carregando autorizações...";
 try{
  const result=await request(AUTH,{action:"door_list",...credentials});
  rows=Array.isArray(result.rows)?result.rows:[];
  ready=true;render();
  alertMsg("✅ Autorizações carregadas. Pesquise pelo nome ou toque em VER PDF.");
  if(rows.length>=200)alertMsg("Exibidos até 200 registros válidos. Para cadastros antigos, use o Admin.");
 }catch(err){rows=[];$("minorDoorTotal").textContent="Consulta indisponível";alertMsg("❌ "+err.message,true);}
 finally{busy=false;btn.disabled=false;btn.textContent="↻ ATUALIZAR AUTORIZAÇÕES";}
}
async function showPDF(record,btn){
 if(busy)return;
 if(!ready){alertMsg("Consulte a lista primeiro.",true);return;}
 let credentials;try{credentials=access();}catch(err){alertMsg(err.message,true);return;}
 busy=true;btn.disabled=true;btn.textContent="GERANDO PDF...";cleanup();
 try{
  const result=await request(PDF,{id:record.id,...credentials});
  const b64=String(result.base64||"");
  if(!b64.startsWith("JVBER"))throw Error("O arquivo recebido não é um PDF válido.");
  const bin=atob(b64),bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  pdfUrl=window.URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
  const box=$("minorDoorPdfViewer");
  const title=document.createElement("h4");title.textContent="📄 Autorização de "+record.minor_name;
  const open=document.createElement("a");open.href=pdfUrl;open.target="_blank";open.rel="noopener noreferrer";
  open.className="btn green minor-door-pdf-link";open.textContent="👁️ ABRIR PDF COMPLETO";
  const save=document.createElement("a");save.href=pdfUrl;save.download=result.filename||"HYPE-AUTORIZACAO.pdf";
  save.className="btn minor-door-pdf-link";save.textContent="⬇️ BAIXAR PDF";
  const hint=document.createElement("p");hint.className="minor-door-hint";hint.textContent="O PDF inclui selfie, documentos, assinatura e QR Code. Confira os originais e as regras do evento. Não é ingresso.";
  box.replaceChildren(title,open,save,hint);box.hidden=false;
  box.scrollIntoView({block:"nearest",behavior:"smooth"});
  alertMsg("✅ PDF gerado. Toque em ABRIR PDF COMPLETO.");
 }catch(err){alertMsg("❌ PDF não abriu: "+err.message,true);}
 finally{busy=false;btn.disabled=false;btn.textContent="📄 VER PDF";}
}
function init(){
 const panel=$("minorDoorPanel");
 if(panel)panel.hidden=true;
 const button=$("minorDoorToggle");
 if(button){button.textContent="VER MAIS ▾";button.setAttribute("aria-expanded","false");}
 $("minorDoorSection")?.classList.remove("minor-door-open");
 button?.addEventListener("click",openToggle);
 $("minorDoorLoad")?.addEventListener("click",load);
 $("minorDoorSearch")?.addEventListener("input",()=>{if(ready)render();else if(!$("minorDoorPanel").hidden&&!busy)load();});
 $("minorDoorSearch")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();if(ready)render();else load();}});
 $("eventSelect")?.addEventListener("change",()=>{cleanup();rows=[];ready=false;if(!$("minorDoorPanel").hidden)load();});
 window.addEventListener("pagehide",cleanup);
 // Não descartar PDF ao mudar para a aba de visualização no Safari; sai ao fechar a página.
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();