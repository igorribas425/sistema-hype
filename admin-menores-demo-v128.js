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

 function demoPortal(id){return "https://hypeloungeclub.com.br/menores-demo-validar.html?demo="+encodeURIComponent(id);}
 function portraitSvg(minor){
   const name=minor?"Lucas Exemplo":"Mariana Exemplo";
   const b=minor?"#5b7798":"#a25a87",tone=minor?"#bcb3a9":"#ca9d98";
   const svg='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="420" viewBox="0 0 480 420">'+
    '<rect width="480" height="420" fill="#f0e9ef"/><rect x="0" y="0" width="480" height="55" fill="#82284e"/>'+
    '<text x="240" y="35" fill="#fff" font-family="Arial" font-weight="bold" font-size="23" text-anchor="middle">RETRATO ILUSTRATIVO</text>'+
    '<circle cx="240" cy="190" r="95" fill="'+tone+'"/><path d="M115 355 Q120 255 240 260 Q355 255 365 355" fill="'+b+'"/>'+
    '<path d="M150 145 Q165 75 240 85 Q320 80 333 148 Q295 106 240 109 Q185 104 150 145" fill="#3e3340"/>'+
    '<text x="240" y="389" text-anchor="middle" fill="#392c3a" font-family="Arial" font-size="24" font-weight="bold">'+name+'</text>'+
    '<text x="240" y="410" text-anchor="middle" fill="#b72a5e" font-family="Arial" font-size="15">SIMULACAO - NAO E FOTO REAL</text></svg>';
   return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
 }
 function documentSvg(minor){
   const name=minor?"Lucas Exemplo":"Mariana Exemplo";
   const cpf=minor?"000.000.000-01":"000.000.000-02";
   const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="365" viewBox="0 0 600 365">'+
    '<rect width="600" height="365" rx="18" fill="#fff8fc"/><rect width="600" height="55" fill="#7d234e"/>'+
    '<text x="25" y="36" font-family="Arial" font-size="27" font-weight="bold" fill="white">DOCUMENTO CENOGRAFICO</text>'+
    '<rect x="23" y="78" width="150" height="170" fill="#d4b3c4"/>'+
    '<circle cx="98" cy="138" r="42" fill="#8f647c"/><path d="M40 230 Q44 173 97 182 Q150 175 155 230" fill="#8f647c"/>'+
    '<text x="197" y="105" font-family="Arial" font-size="20" fill="#382333">NOME</text>'+
    '<text x="197" y="138" font-family="Arial" font-size="25" font-weight="bold" fill="#382333">'+name+'</text>'+
    '<text x="197" y="181" font-family="Arial" font-size="20" fill="#382333">CPF FICTICIO</text>'+
    '<text x="197" y="213" font-family="Arial" font-size="22" fill="#382333">'+cpf+'</text>'+
    '<rect x="0" y="277" width="600" height="88" fill="#bc285f"/>'+
    '<text x="300" y="323" text-anchor="middle" font-family="Arial" font-size="29" font-weight="bold" fill="white">SEM VALIDADE LEGAL</text>'+
    '<text x="300" y="348" text-anchor="middle" font-family="Arial" font-size="14" fill="white">EXCLUSIVAMENTE PARA TESTAR O PDF DA HYPE</text></svg>';
   return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
 }
 async function svgPng(svgUri,width=640){
   const image=new Image();image.src=svgUri;await image.decode();
   const c=document.createElement("canvas");
   c.width=width;c.height=Math.round(width*image.naturalHeight/image.naturalWidth);
   const ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
   ctx.drawImage(image,0,0,c.width,c.height);
   return c.toDataURL("image/png");
 }
 async function demoPDF(id){
   if(!window.jspdf?.jsPDF)throw Error("Biblioteca de PDF não carregou; utilize o PDF de demonstração disponibilizado na conversa ou tente novamente com Ctrl+F5.");
   if(!window.HypeQRCode?.toDataUrl)throw Error("Gerador local de QR Code indisponível; atualize o Admin com Ctrl+F5.");
   const verify=await api("list");
   const row=(verify.rows||[]).find(r=>r.id===id);
   if(!row||row.status!=="conferido")throw Error("Confirme o teste fictício no Admin antes de baixar o PDF.");
   const link=demoPortal(id);
   const [qr,faceMinor,faceGuardian,docMinor,docGuardian,signature]=await Promise.all([
     Promise.resolve(window.HypeQRCode.toDataUrl(link,520)),
     svgPng(portraitSvg(true)),svgPng(portraitSvg(false)),svgPng(documentSvg(true)),
     svgPng(documentSvg(false)),svgPng(fakeArt("assinatura"))
   ]);
   const pdf=new window.jspdf.jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
   const ink=[42,33,41],pink=[192,38,96],gray=[102,83,101];
   const drawBase=(num)=>{
     pdf.setFillColor(27,17,26);pdf.rect(0,0,210,33,"F");
     pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(18);
     pdf.text("HYPE LOUNGE CLUB",16,16);
     pdf.setTextColor(255,164,191);pdf.setFontSize(9);
     pdf.text("DOCUMENTO DE DEMONSTRACAO - SEM VALIDADE",16,24);
     pdf.setDrawColor(232,203,215);pdf.line(16,273,194,273);
     pdf.setTextColor(112,102,110);pdf.setFontSize(9);
     pdf.text("HYPE | SIMULACAO | Pagina "+num+" de 2 | NAO E INGRESSO",16,280);
     pdf.setFont("helvetica","bold");pdf.setTextColor(240,217,227);pdf.setFontSize(30);
     pdf.text("TESTE FICTICIO",106,265,{align:"center"});
   };
   const line=(lbl,val,y)=>{
     pdf.setFont("helvetica","bold");pdf.setFontSize(10);pdf.setTextColor(...pink);
     pdf.text(lbl.toUpperCase(),16,y);
     pdf.setFont("helvetica","normal");pdf.setTextColor(...ink);
     pdf.text(pdf.splitTextToSize(String(val),110),74,y);
   };
   drawBase(1);pdf.setTextColor(...ink);pdf.setFont("helvetica","bold");pdf.setFontSize(16);
   pdf.text("Autorizacao de menor - modelo ficticio",16,44);
   pdf.setFont("helvetica","normal");pdf.setFontSize(10);pdf.setTextColor(...gray);
   pdf.text("Fluxo: cadastro > analise no Admin > PDF com QR > conferencia > compra no evento.",16,52);
   const fields=[
     ["Menor","Lucas Exemplo"],["CPF do menor","000.000.000-01 (INVENTADO)"],
     ["Nascimento menor","15/08/2010"],["Gmail do menor","matheusanjosb@gmail.com"],
     ["Responsavel","Mariana Exemplo"],["CPF responsavel","000.000.000-02 (INVENTADO)"],
     ["Nascimento responsavel","12/04/1985 (FICTICIO)"],["Vinculo","Mae"],
     ["Telefone","(00) 00000-0000"],["Gmail responsavel","igorribas425@gmail.com"],
     ["Evento","Evento ficticio HYPE"],["Preco no evento","Pista / Noite toda / R$ 30,00"],
     ["Pagamento","SOMENTE PRESENCIAL"],["Situacao do teste","CONFERIDO NO AMBIENTE FICTICIO"]
   ];
   let y=64;for(const [key,value] of fields){line(key,value,y);y+=9.3;}
   pdf.setFillColor(251,237,245);pdf.roundedRect(16,199,116,47,3,3,"F");
   pdf.setTextColor(...pink);pdf.setFont("helvetica","bold");pdf.setFontSize(12);
   pdf.text("QR DE DEMONSTRACAO",22,209);
   pdf.setTextColor(...ink);pdf.setFont("helvetica","normal");pdf.setFontSize(9.5);
   pdf.text(pdf.splitTextToSize("Apresente este QR para demonstrar a consulta. Ele nao permite entrada, pagamento ou compra real.",102),22,219);
   pdf.addImage(qr,"PNG",141,192,54,54);
   pdf.setFontSize(8);pdf.setTextColor(...gray);
   pdf.text("Protocolo: "+id,16,256);
   pdf.addPage();drawBase(2);
   pdf.setTextColor(...ink);pdf.setFont("helvetica","bold");pdf.setFontSize(16);
   pdf.text("Fotos e documentos ilustrativos",16,44);
   pdf.setTextColor(...gray);pdf.setFont("helvetica","normal");pdf.setFontSize(10);
   pdf.text("Na autorizacao verdadeira, esta pagina mostrara os arquivos enviados no cadastro.",16,52);
   pdf.setFont("helvetica","bold");pdf.setTextColor(...pink);pdf.setFontSize(11);
   pdf.text("SELFIE FICTICIA DO MENOR",16,63);
   pdf.text("SELFIE FICTICIA DO RESPONSAVEL",113,63);
   pdf.addImage(faceMinor,"PNG",16,68,80,69);
   pdf.addImage(faceGuardian,"PNG",113,68,80,69);
   pdf.text("DOCUMENTO FICTICIO DO MENOR",16,151);
   pdf.text("DOCUMENTO FICTICIO RESPONSAVEL",113,151);
   pdf.addImage(docMinor,"PNG",16,157,80,49);
   pdf.addImage(docGuardian,"PNG",113,157,80,49);
   pdf.text("ASSINATURA ILUSTRATIVA DO RESPONSAVEL",16,221);
   pdf.addImage(signature,"PNG",16,225,92,35);
   pdf.setFillColor(251,234,241);pdf.roundedRect(116,223,78,38,3,3,"F");
   pdf.setTextColor(...pink);pdf.setFontSize(11);pdf.text("AVISO OBRIGATORIO",121,233);
   pdf.setTextColor(...ink);pdf.setFont("helvetica","normal");pdf.setFontSize(8);
   pdf.text(pdf.splitTextToSize("Nenhuma imagem representa pessoa ou documento real. Este PDF nao vale como autorizacao legal ou ingresso.",68),121,240);
   pdf.save("HYPE-TESTE-AUTORIZACAO-"+id.slice(0,8)+".pdf");
 }
 function addDemoButtons(parent,id){
   const btn=el("button","📄 BAIXAR PDF FICTICIO COMPLETO (FOTOS + QR)","m120-btn m120-green");
   btn.type="button";
   btn.style.cssText="display:block;width:100%;padding:13px;margin:12px 0;font-weight:850";
   btn.addEventListener("click",async()=>{
     btn.disabled=true;btn.textContent="GERANDO PDF FICTICIO...";
     try{await demoPDF(id);info("PDF ficticio completo gerado para conferencia. Nenhum ingresso foi criado.");}
     catch(e){info("Falha ao gerar PDF: "+e.message,true);}
     finally{btn.disabled=false;btn.textContent="📄 BAIXAR PDF FICTICIO COMPLETO (FOTOS + QR)";}
   });
   parent.append(btn);
   const a=el("a","🔎 SIMULAR LEITURA DO QR CODE","m120-btn");
   a.href=demoPortal(id);a.target="_blank";a.rel="noopener noreferrer";
   a.style.cssText="display:block;text-align:center;background:#53213b;color:white;text-decoration:none;padding:13px;border-radius:9px;margin-bottom:12px;font-weight:850";
   parent.append(a);
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
       addDemoButtons(details,id);
     }
     if(next==="pendente"){info("Teste voltou para pendente.");return;}
     if(next==="conferido"){info("Teste ficticio aprovado. Baixe o PDF com QR Code neste painel; envio automatico do anexo ainda nao habilitado.");details.append(el("p","🧪 PDF ficticio disponivel para download. O e-mail automatico com anexo ainda nao esta conectado."));return;}
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
   if(row.status==="conferido")addDemoButtons(target,row.id);
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
 async function createTest(){
   const button=$("m128Create");if(button)button.disabled=true;
   try{
     const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"submit"})});
     const data=await r.json().catch(()=>({}));
     if(!r.ok||!data.ok)throw Error(data.error||"Falha ao criar teste ficticio");
     await load();info("Lucas Exemplo ficticio criado como PENDENTE. Clique em VER TESTE para simular a aprovacao.");
   }catch(e){info("Falha ao criar teste: "+e.message,true);}
   finally{if(button)button.disabled=false;}
 }
 function init(){$("m128Refresh")?.addEventListener("click",load);$("m128Create")?.addEventListener("click",createTest)}
 window.HypeMinorDemoV128={load};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
