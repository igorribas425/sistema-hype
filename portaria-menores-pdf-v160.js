/* HYPE V160 — Consulta de autorizações aprovada na Portaria.
   Apenas Admin/Gerente pode listar e baixar PDFs privados. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const AUTH="https://txxoqfcwqncqyiqgzboz.supabase.co/functions/v1/hype-minors-authorization";
const PDF="https://txxoqfcwqncqyiqgzboz.supabase.co/functions/v1/hype-minor-pdf";
let rows=[],ready=false,busy=false,pdfUrl=null;
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const years=(date,t)=>{if(!date)return-1;let y=Number(t.slice(0,4))-Number(date.slice(0,4));if(t.slice(5)<String(date).slice(5))y--;return y;};
function alertMsg(msg,error=false){const el=$("minorDoorStatus");if(el){el.textContent=msg;el.style.color=error?"#ffb2c0":"#b9f9d5";}}
function access(){const username=$("minorDoorUser").value.trim(),password=$("minorDoorPass").value;if(!username||!password)throw Error("Informe usuário e senha de Admin ou gerente.");return {username,password};}
async function request(url,b){
 const resp=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b),cache:"no-store"});
 const data=await resp.json().catch(()=>({}));
 if(!resp.ok||!data.ok)throw Error(data.error||"Falha ao consultar o sistema");
 return data;
}
function cleanup(){if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl=null;}const viewer=$("minorDoorPdfViewer");if(viewer){viewer.hidden=true;viewer.replaceChildren();}}
function openToggle(){
 const panel=$("minorDoorPanel"),hidden=!panel.hidden;
 panel.hidden=hidden;
 $("minorDoorToggle").setAttribute("aria-expanded",String(!hidden));
 if(!hidden){panel.scrollIntoView({block:"start",behavior:"smooth"});if(!ready)alertMsg("Entre com usuário e senha de Admin ou gerente para consultar os PDFs.");}
 else cleanup();
}
function relevant(r){
 if(r.status!=="conferido")return false;
 if(r.expires_at&&Date.parse(r.expires_at)<Date.now())return false;
 const eventId=Number($("eventSelect")?.value||0);
 return r.event_id==null||Number(r.event_id)===eventId;
}
function render(){
 const box=$("minorDoorList"),search=$("minorDoorSearch").value.trim().toLocaleLowerCase("pt-BR");
 const subset=rows.filter(relevant).filter(r=>!search||[r.minor_name,r.guardian_name,r.id].some(x=>String(x||"").toLocaleLowerCase("pt-BR").includes(search)));
 box.replaceChildren();
 $("minorDoorTotal").textContent=subset.length+" autorização(ões) aprovada(s) e válida(s)";
 if(!subset.length){const empty=document.createElement("p");empty.className="minor-door-hint";empty.textContent="Nenhuma autorização válida encontrada para este evento.";box.append(empty);return;}
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
 const btn=$("minorDoorLoad");busy=true;btn.disabled=true;btn.textContent="CONSULTANDO...";
 cleanup();ready=false;$("minorDoorList").replaceChildren();
 try{
  const result=await request(AUTH,{action:"list",...credentials});
  rows=Array.isArray(result.rows)?result.rows:[];
  ready=true;render();
  alertMsg("✅ Consulta protegida carregada. Compare os documentos originais na entrada.");
  if(rows.length>=120){alertMsg("Foram carregados os 120 cadastros mais recentes. Use o Admin para consultar registros mais antigos.");}
 }catch(err){alertMsg("❌ "+err.message,true);}
 finally{busy=false;btn.disabled=false;btn.textContent="🔎 CONSULTAR AUTORIZAÇÕES";}
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
 $("minorDoorToggle")?.addEventListener("click",openToggle);
 $("minorDoorLoad")?.addEventListener("click",load);
 $("minorDoorSearch")?.addEventListener("input",()=>{if(ready)render()});
 $("eventSelect")?.addEventListener("change",()=>{cleanup();if(ready)render()});
 window.addEventListener("pagehide",cleanup);
 document.addEventListener("visibilitychange",()=>{if(document.hidden){cleanup();}});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();