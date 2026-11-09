/* Rogue — bloqueio de acesso cruzado. Não altera a HYPE original. */
(()=>{"use strict";
const forbidden=new Set(["txxoqfcwqncqyiqgzboz.supabase.co","hypeloungeclub.com.br","www.hypeloungeclub.com.br"]);
function block(url){try{const u=new URL(String(url?.url||url||""),location.href);return forbidden.has(u.hostname.toLowerCase())}catch{return false}}
const originalFetch=window.fetch;
if(originalFetch) window.fetch=function(input,init){if(block(input))return Promise.reject(new Error("Conexão com a HYPE bloqueada para este clone"));return originalFetch.call(this,input,init)};
const oldOpen=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url,...args){if(block(url))throw new Error("Conexão com HYPE bloqueada");return oldOpen.call(this,method,url,...args)};
if(navigator.sendBeacon){const oldBeacon=navigator.sendBeacon.bind(navigator);try{navigator.sendBeacon=function(url,data){if(block(url))return false;return oldBeacon(url,data)}}catch{}}
})();
