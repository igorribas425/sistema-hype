/* Homologação segura — não executa escrita em Supabase nem pagamentos. */
(()=>{"use strict";
const blockedHosts=new Set(["txxoqfcwqncqyiqgzboz.supabase.co","hypeloungeclub.com.br","www.hypeloungeclub.com.br","api.asaas.com","api.brevo.com"]);
const readOnly=true;
function forbid(value,method){
 try{const raw=typeof value==="string"?value:(value?.url||String(value||""));const url=new URL(raw,location.href),host=url.hostname.toLowerCase(),verb=String(method||"GET").toUpperCase();
 if(blockedHosts.has(host))return true;
 // Sem banco MALIBU: bloquear toda escrita, para qualquer destino, não só Supabase.
 if(readOnly&&!["GET","HEAD","OPTIONS"].includes(verb))return true;
 // Nenhum projeto Supabase deve ser consultado neste ambiente.
 if(readOnly&&host.endsWith(".supabase.co"))return true;
 return false;}catch{return readOnly&&!["GET","HEAD","OPTIONS"].includes(String(method||"GET").toUpperCase())}
}
const fetchOriginal=window.fetch;
if(fetchOriginal)window.fetch=function(input,init){const method=init?.method||input?.method||"GET";if(forbid(input,method))return Promise.reject(new Error("Ambiente de homologação: solicitação bloqueada para proteger produção"));return fetchOriginal.call(this,input,init)};
const xhrOpen=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url,...rest){if(forbid(url,method))throw new Error("Ambiente de homologação: gravação bloqueada");return xhrOpen.call(this,method,url,...rest)};
if(navigator.sendBeacon){const original=navigator.sendBeacon.bind(navigator);try{navigator.sendBeacon=function(url,data){if(forbid(url,"POST"))return false;return original(url,data)}}catch{}}
// Impedir envio nativo de FORM para endpoints herdados da Hype.
document.addEventListener("submit",e=>{
 if(!readOnly)return;
 e.preventDefault();
 e.stopImmediatePropagation?.();
 const form=e.target;
 if(!form||String(form.tagName||"").toUpperCase()!=="FORM")return;
 let notice=form.querySelector?.(".malibu-preview-form-notice");
 if(!notice){
  notice=document.createElement("p");
  notice.className="malibu-preview-form-notice";
  notice.style.cssText="color:#fff;background:#35202c;border:1px solid #b27291;border-radius:10px;padding:12px;font:700 13px/1.5 system-ui;margin-top:12px";
  form.appendChild(notice);
 }
 notice.textContent="MALIBU EM HOMOLOGAÇÃO: este formulário é somente uma prévia. Nenhum pedido, cadastro ou pagamento foi enviado.";
},true);
const allowedExternalPreview=new Set(["malibu-menores.vercel.app"]);
function externalUnsafe(href){
 try{
  const url=new URL(href,location.href);
  return /^https?:$/.test(url.protocol)&&url.origin!==location.origin&&!allowedExternalPreview.has(url.hostname);
 }catch{return true}
}
// Nunca enviar o cliente ao WhatsApp ou checkout herdado da Hype durante homologação.
const originalOpen=window.open;
if(typeof originalOpen==="function"){
 window.open=function(url,...rest){
  if(readOnly&&externalUnsafe(url))return null;
  return originalOpen.call(this,url,...rest);
 };
}
document.addEventListener("click",e=>{
 const a=e.target?.closest?.("a[href]");
 if(a&&(forbid(a.href,"GET")||(readOnly&&externalUnsafe(a.href)))){
  e.preventDefault();
  e.stopImmediatePropagation?.();
 }
},true);
})();
