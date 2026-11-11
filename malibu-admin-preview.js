(()=>{"use strict";
 const $=id=>document.getElementById(id),STORE="malibu_event_drafts_local_v1";
 const titles={"financeiro":["Financeiro","Vendas, caixa e valores acumulados"],"promoters":["Promoters","Links de vendas e ranking"],"lista":["Lista / FREE","Convidados e aprovações"],"listapromoter":["Lista/Promoter","Convites e convidados"],"portaria":["Portaria","QR, busca e check-in"],"clientes":["Clientes","Ingressos, status e busca"],"cadastros":["Cadastros","Clientes e frequência"],"eventos":["Eventos & Lotes","Festas, valores e categorias"],"avaliacao":["Avaliações","Comentários e feedback"],"ferramentas":["Sorteio & Acessos","Equipe e dispositivos"],"menores":["Menores de idade","Autorizações de responsáveis"],"vendas":["Vendas manuais","Solicitações e confirmação"]};
 const read=()=>{try{const d=JSON.parse(localStorage.getItem(STORE)||"[]");return Array.isArray(d)?d.slice(0,50):[]}catch{return[]}};
 const save=a=>{try{localStorage.setItem(STORE,JSON.stringify(a));return true}catch{return false}};
 const el=(tag,t)=>{const x=document.createElement(tag);if(t!==undefined)x.textContent=String(t);return x};
 function home(hist=true){$("v95AdminHome").hidden=false;$("malibuBar").hidden=true;document.querySelectorAll("[data-malibu-section]").forEach(x=>x.hidden=true);if(hist)history.replaceState(null,"",location.pathname+location.search);window.scrollTo(0,0)}
 function open(key,hist=true){if(!Object.hasOwn(titles,key))return home(hist);$("v95AdminHome").hidden=true;$("malibuBar").hidden=false;document.querySelectorAll("[data-malibu-section]").forEach(x=>x.hidden=x.dataset.malibuSection!==key);$("sectionTitle").textContent=titles[key][0];$("sectionSubtitle").textContent=titles[key][1];if(key==="eventos")render();if(hist)history.replaceState(null,"","#"+key);window.scrollTo(0,0)}
 function render(){
 const c=$("eventList");if(!c)return;c.replaceChildren();
 const a=read();if(!a.length){const x=el("div","Nenhum rascunho de evento salvo neste navegador.");x.className="empty";c.append(x);return}
 for(const r of a.slice().reverse()){
  const d=el("div");d.className="eventcard";const l=el("div");l.append(el("strong",r.name));
  l.append(el("small",r.date+" · "+r.venue+" · "+(r.artist||"Sem atrações informadas")));
  l.append(el("small","Lote "+r.lot+" · R$ "+Number(r.price).toLocaleString("pt-BR",{minimumFractionDigits:2})+" · "+r.qty+" ingressos — RASCUNHO LOCAL"));
  const b=el("button","EXCLUIR TESTE");b.type="button";
  b.addEventListener("click",()=>{if(confirm("Excluir este rascunho de teste?")){save(read().filter(x=>x.id!==r.id));render()}});
  d.append(l,b);c.append(d)
 }
 }
 function start(){
  document.querySelectorAll("[data-malibu-open]").forEach(b=>b.addEventListener("click",()=>open(b.dataset.malibuOpen)));
  $("backHome").addEventListener("click",()=>home());
  window.addEventListener("hashchange",()=>{const k=location.hash.slice(1);if(Object.hasOwn(titles,k))open(k,false);else home(false)});
  $("eventForm").addEventListener("submit",event=>{
   event.preventDefault();
   const name=$("eventName").value.trim(),date=$("eventDate").value,venue=$("eventVenue").value.trim(),artist=$("eventArtist").value.trim(),lot=$("lotName").value.trim(),price=Number($("lotPrice").value),qty=Number($("lotQty").value);
   if(name.length<4||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!Number.isFinite(price)||price<0||!Number.isSafeInteger(qty)||qty<1){$("eventStatus").textContent="Confira os dados do evento, preço e quantidade.";return}
   const a=read();if(a.length>=50){$("eventStatus").textContent="Limite de 50 rascunhos locais.";return}
   const ok=save([...a,{id:String(Date.now())+"-"+Math.round(Math.random()*100000),name,date,venue,artist,lot,price,qty,source:"local-preview"}]);
   $("eventStatus").textContent=ok?"Evento salvo APENAS neste navegador. Não publicado no banco ou site.":"Falha ao salvar rascunho neste navegador.";
   if(ok)render();
  });
  $("exportEvents").addEventListener("click",()=>{
   const a=read();if(!a.length){alert("Nenhum evento local para exportar.");return}
   const b=new Blob([JSON.stringify({brand:"Malibu",preview:true,events:a},null,2)],{type:"application/json"});
   const u=URL.createObjectURL(b),l=document.createElement("a");l.href=u;l.download="malibu-eventos-teste.json";l.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
  });
  const k=location.hash.slice(1);if(Object.hasOwn(titles,k))open(k,false);else home(false);
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();