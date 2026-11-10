/* Homologação segura — não executa escrita em Supabase nem pagamentos. */
(()=>{"use strict";
const blockedHosts=new Set(["txxoqfcwqncqyiqgzboz.supabase.co","hypeloungeclub.com.br","www.hypeloungeclub.com.br","api.asaas.com","api.brevo.com"]);
const readOnly=true;
function forbid(value,method){
 try{const raw=typeof value==="string"?value:(value?.url||String(value||""));const url=new URL(raw,location.href),host=url.hostname.toLowerCase(),verb=String(method||"GET").toUpperCase();
 if(blockedHosts.has(host))return true;
 // Rogue ADM: permite somente autenticação (senha/refresh/logout), nunca escrita administrativa.
 const authOnly = host==="etxvkvdsnqqdkonvbgzf.supabase.co" && location.pathname==="/admin.html" && verb==="POST" && ((url.pathname==="/auth/v1/token" && ["password","refresh_token"].includes(url.searchParams.get("grant_type"))) || url.pathname==="/auth/v1/logout");
 if(authOnly)return false;
 if(readOnly&&host.endsWith(".supabase.co")&&!["GET","HEAD","OPTIONS"].includes(verb))return true;
 return false;}catch{return false}
}
const fetchOriginal=window.fetch;
if(fetchOriginal)window.fetch=function(input,init){const method=init?.method||input?.method||"GET";if(forbid(input,method))return Promise.reject(new Error("Ambiente de homologação: solicitação bloqueada para proteger produção"));return fetchOriginal.call(this,input,init)};
const xhrOpen=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url,...rest){if(forbid(url,method))throw new Error("Ambiente de homologação: gravação bloqueada");return xhrOpen.call(this,method,url,...rest)};
if(navigator.sendBeacon){const original=navigator.sendBeacon.bind(navigator);try{navigator.sendBeacon=function(url,data){if(forbid(url,"POST"))return false;return original(url,data)}}catch{}}
document.addEventListener("click",e=>{const a=e.target?.closest?.("a[href]");if(a&&forbid(a.href,"GET"))e.preventDefault()},true);
})();
