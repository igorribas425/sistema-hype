/* HYPE v128 — Testes fictícios isolados no ADM, sem autorização real */
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const API="https://txxoqfcwqncqyiqgzboz.supabase.co/functions/v1/hype-minors-demo";
 let loading=false,rows=[],sample=null;
 function staff(){
   try{if(typeof HYPE!=='undefined'&&HYPE.user&&HYPE.pass&&["admin","gerente"].includes(HYPE.role))return {username:HYPE.user,password:HYPE.pass};}
   catch(_){}
   return null;
 }
 async function api(action,extra={}){
   const c=staff();
   if(!c)throw Error("Entre com acesso ADM ou gerente.");
   const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...c,...extra})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok||data.ok!==true)throw Error(data.error||"Falha ao carregar testes.");
   return data;
 }
 function info(txt,bad=false){
   const el=$("m128Status");if(el){el.textContent=txt;el.style.color=bad?"#ff9eae":"#a5edc8";}
 }
 function el(tag,value,cls){
   const x=document.createElement(tag);if(value!==undefined)x.textContent=String(value);
   if(cls)x.className=cls;return x;
 }
 function time(value){try{return new Date(value).toLocaleString("pt-BR");}catch(_){return "—";}}
 function fakeArt(kind){
   const face=kind==="selfie";
   const svg=face?
    `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="300" viewBox="0 0 340 300"><rect width="340" height="300" fill="#27202d"/><circle cx="170" cy="122" r="63" fill="#b98ea7"/><ellipse cx="170" cy="268" rx="110" ry="86" fill="#b98ea7"/><rect y="4" width="340" height="42" fill="#681d3c"/><text x="170" y="31" fill="white" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold">SELFIE FICTÍCIA</text><text x="170" y="292" fill="white" text-anchor="middle" font-family="Arial" font-size="12">NÃO É FOTO REAL</text></svg>`:
    kind==="documento"?
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300"><rect width="480" height="300" fill="#f3edf0"/><text x="20" y="40" fill="#401c2a" font-family="Arial" font-size="22" font-weight="bold">DOCUMENTO FICTÍCIO</text><rect x="22" y="65" width="110" height="138" fill="#cba7b9"/><circle cx="77" cy="105" r="25" fill="#744a68"/><ellipse cx="77" cy="184" rx="43" ry="40" fill="#744a68"/><text x="147" y="90" fill="#311524" font-family="Arial" font-size="18">Mariana Exemplo</text><text x="147" y="125" fill="#311524" font-family="Arial" font-size="15">CPF: 000.000.000-02</text><text x="147" y="156" fill="#311524" font-family="Arial" font-size="15">SEM VALIDADE</text><rect y="218" width="480" height="82" fill="#aa2552"/><text x="240" y="265" fill="white" text-anchor="middle" font-family="Arial" font-size="24" font-weight="bold">SOMENTE TESTE</text></svg>`:
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="210"><rect width="480" height="210" fill="white"/><text x="25" y="95" font-family="cursive" font-size="35" font-style="italic" fill="#352635">Mariana Exemplo</text><text x="25" y="145" font-family="Arial" font-size="18" font-weight="bold" fill="#b01748">ASSINATURA FICTÍCIA</text></svg>`;
   return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
 }
 async function load(){
   if(loading||!staff())return;
   loading=true;info("Buscando demonstrações...");
   try{
     const out=await api("list");rows=out.rows||[];sample=out.sample;
     const list=$("m128List");if(!list)return;
     list.replaceChildren();
     $("m128Count").textContent=String(rows.length);
     if(!rows.length){list.appendChild(el("p","Ainda não há testes recebidos. Envie uma simulação pelo formulário de demonstração."));}
     for(const row of rows){
       const card=el("div",undefined,"m128-row");
       const left=el("div");
       const title=el("strong","🧪 TESTE • Lucas Exemplo — "+row.status.toUpperCase());
       const sub=el("small",time(row.created_at)+" • "+String(row.id).slice(0,8));
       sub.style.display="block";sub.style.color="#baadb7";
       left.append(title,sub);
       const button=el("button","VER TESTE","m120-btn");button.type="button";
       button.addEventListener("click",()=>show(row));
       card.append(left,button);list.append(card);
     }
     info(rows.length+" teste(s) fictício(s) no ADM. Não são autorizações de verdade.");
     if(out.mailReady===false)info("⚠️ E-mail automático não configurado. Ao confirmar, abra a mensagem preparada para os dois Gmails.",true);
   }catch(e){info("Erro ao carregar testes: "+e.message,true);}
   finally{loading=false;}
 }
 async function review(id,next){
   try{
     const response=await api("review",{id,status:next});
     await load();
     const details=$("m128Detail");
     details.replaceChildren();details.hidden=false;
     details.append(el("h3","🧪 Resultado do teste: "+next.toUpperCase()));
     details.append(el("p","Gmails destinatários: "+(response.emails||[]).join(", ")));
     if(next==="conferido"){
       const link=el("a","🔗 ABRIR SITE DO TESTE VINCULADO","m120-btn");
       link.href="https://hypeloungeclub.com.br/menor-comprar.html?demo="+encodeURIComponent(id)+"&v=20261024-v135";
       link.target="_blank";link.rel="noopener noreferrer";
       link.style.cssText="display:block;padding:13px;background:#633349;color:#fff;text-decoration:none;border-radius:9px;margin:12px 0;text-align:center;font-weight:700";
       details.append(link);
     }
     if(next==="pendente"){info("Teste voltou para pendente.");return;}
     if(response.emailSent){
       info("Mensagem aceita pelo provedor de e-mail; confira Gmail e Spam.");
       details.append(el("p","✅ Envio aceito para os dois endereços."));
     }else{
       info("Teste analisado, mas o envio automático NÃO foi confirmado.",true);
       details.append(el("p","⚠️ "+(response.emailError||"Envio não confirmado.")));
       const a=el("a","📧 ABRIR E-MAIL PREENCHIDO PARA OS DOIS","m120-btn");
       const body="TESTE FICTÍCIO DA HYPE. Nenhuma compra real foi liberada."+(response.manualLink?"\n\nLink de demonstração:\n"+response.manualLink:"");
       a.href="mailto:"+(response.emails||[]).map(encodeURIComponent).join(",")+"?subject="+encodeURIComponent("HYPE — teste fictício de autorização")+"&body="+encodeURIComponent(body);
       a.style.cssText="display:block;padding:13px;background:#c83264;color:white;border-radius:9px;margin-top:12px";
       details.append(a);
     }
   }catch(e){info("Falha: "+e.message,true);}
 }
 async function remove(id){
   if(!confirm("Excluir somente este teste fictício? Nenhum ingresso real será afetado."))return;
   try{await api("delete",{id});$("m128Detail").hidden=true;await load();}
   catch(e){info("Falha ao excluir: "+e.message,true);}
 }
 function show(row){
   const target=$("m128Detail");target.replaceChildren();target.hidden=false;
   target.appendChild(el("h3","🧪 Ficha fictícia — "+row.status.toUpperCase()));
   const p=el("p","Enviado para o ADM em "+time(row.created_at)+" • Protocolo "+row.id);p.style.fontSize="12px";target.append(p);
   const fields=[
    ["Menor fictício","Lucas Exemplo"],["CPF fictício","000.000.000-01"],
    ["Responsável fictícia","Mariana Exemplo"],["CPF fictício","000.000.000-02"],
    ["Vínculo fictício","Mãe"],["Nascimento","2010-08-15"],
    ["Gmail do responsável","igorribas425@gmail.com"],["Gmail do menor","matheusanjosb@gmail.com"],["Evento","Demonstração sem ingresso real"]
   ];
   const dl=el("dl",undefined,"m120-detail-grid");
   for(const [k,v]of fields){dl.append(el("dt",k),el("dd",v));}
   target.append(dl);
   const images=el("div",undefined,"m120-image-grid");
   for(const kind of ["selfie","documento","assinatura"]){
     const card=el("div",undefined,"m120-image");
     card.append(el("strong",kind==="selfie"?"Selfie fictícia":kind==="documento"?"Documento fictício":"Assinatura fictícia"));
     const img=document.createElement("img");img.src=fakeArt(kind);img.alt="Simulação de "+kind;card.append(img);images.append(card);
   }
   target.append(images);
   const warn=el("p","Atenção: marcar este teste como CONFERIDO não autoriza ninguém a entrar e não libera pagamento ou ingresso.","m120-warning");
   target.append(warn);
   const actions=el("div",undefined,"m120-actions");
   for(const [label,next,cls] of [["✅ Simular conferido","conferido","m120-green"],["⛔ Simular recusado","recusado","m120-red"],["↻ Voltar pendente","pendente","m120-ghost"]]){
     const button=el("button",label,"m120-btn "+cls);button.type="button";
     button.addEventListener("click",()=>review(row.id,next));actions.append(button);
   }
   const erase=el("button","🗑 Excluir teste","m120-btn m120-ghost");erase.type="button";
   erase.addEventListener("click",()=>remove(row.id));actions.append(erase);
   const close=el("button","Fechar","m120-btn m120-ghost");close.type="button";
   close.addEventListener("click",()=>{target.hidden=true});actions.append(close);
   target.append(actions);target.scrollIntoView({behavior:"smooth",block:"start"});
 }
 function init(){$("m128Refresh")?.addEventListener("click",load)}
 window.HypeMinorDemoV128={load};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
