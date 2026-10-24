/* HYPE V120 — Painel reservado ao ADM e gerente: autorizações de menores */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const URL='https://txxoqfcwqncqyiqgzboz.supabase.co/functions/v1/hype-minors-authorization';
let loading=false,rows=[],events=[],openedId=null;
function credentials(){
 try{if(typeof HYPE!=='undefined'&&HYPE.user&&HYPE.pass&&['admin','gerente'].includes(HYPE.role))
 return {username:HYPE.user,password:HYPE.pass};}catch(_){}
 return null;
}
function status(text,bad=false){
 const el=$('minorAdminStatus');if(el){el.textContent=text;el.style.color=bad?'#ff9ea9':'#a7efd4';}
}
async function rpc(action,more={}){
 const c=credentials();if(!c)throw new Error('Entre com uma conta ADM ou gerente.');
 const reply=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...c,...more})});
 const data=await reply.json().catch(()=>({}));
 if(!reply.ok||!data.ok)throw new Error(data.error||'Sem resposta do servidor.');
 return data;
}
const showDate=(date)=>{try{return date?new Date(date).toLocaleString('pt-BR'):'—';}catch(_){return '—'}};
const maskCpf=(cpf)=>{const d=String(cpf||'').replace(/\D/g,'');return d.length===11?'***.***.'+d.slice(6,9)+'-'+d.slice(9):'—';};
const text=(tag,t,cls)=>{const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=t;return el;};
function eventName(id){return id==null?'TODAS AS FESTAS HYPE':(events.find(x=>Number(x.id)===Number(id))?.name||('Evento #'+id));}
async function load(){
 if(loading)return;
 if(!credentials()){status('Somente ADM e gerente podem acessar esta área.',true);return;}
 loading=true;
 status('Carregando declarações...');
 try{
  const filter=Number($('minorAdminEvent')?.value||0);
  const data=await rpc('list',filter?{eventId:filter}:{});
  rows=data.rows||[];events=data.events||[];
  const select=$('minorAdminEvent'),previous=select.value;
  select.replaceChildren();
  const all=document.createElement('option');all.value='';all.textContent='Gerais e por evento';select.appendChild(all);
  events.forEach(ev=>{const opt=document.createElement('option');opt.value=String(ev.id);opt.textContent=ev.name+' — '+ev.event_date;select.appendChild(opt);});
  if([...select.options].some(x=>x.value===previous))select.value=previous;
  render();
  status(rows.length+' declaração(ões) carregada(s). Confira documento original e regras de entrada.');
 }catch(e){status('Erro: '+e.message,true);}
 finally{loading=false;}
}
function render(){
 const container=$('minorAdminList');container.replaceChildren();
 $('minorCountPending').textContent=String(rows.filter(r=>r.status==='pendente').length);
 $('minorCountChecked').textContent=String(rows.filter(r=>r.status==='conferido').length);
 $('minorCountRejected').textContent=String(rows.filter(r=>r.status==='recusado').length);
 if(!rows.length){container.appendChild(text('p','Nenhuma autorização encontrada.','m120-empty'));return;}
 for(const row of rows){
  const card=document.createElement('article');card.className='m120-card';
  const content=document.createElement('div');content.className='m120-card-content';
  const h=text('strong',row.minor_name,'m120-name');
  const st=text('span',row.status.toUpperCase(),'m120-status m120-'+row.status);
  const line=document.createElement('div');line.className='m120-title';line.append(h,st);
  const sub=text('small',eventName(row.event_id)+' • Responsável: '+row.guardian_name+' • '+showDate(row.created_at));
  content.append(line,sub);
  const b=document.createElement('button');b.type='button';b.className='m120-btn';b.textContent='VER FOTOS DO MENOR, RESPONSÁVEL E ASSINATURA';b.addEventListener('click',()=>detail(row.id));
  card.append(content,b);container.appendChild(card);
 }
}

async function sendNotification(id){
 const creds=credentials();if(!creds)throw Error('Acesso restrito ao ADM.');
 const resp=await fetch('https://txxoqfcwqncqyiqgzboz.supabase.co/functions/v1/hype-minor-notify',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id,...creds})
 });
 const data=await resp.json().catch(()=>({}));
 if(!resp.ok||!data.ok)throw Error(data.error||'Falha ao notificar');
 return data;
}
function showNotificationResult(data){
 const root=$('minorAdminDetail');if(!root)return;
 const box=document.createElement('div');box.className='m120-warning';
 const ok=Boolean(data.emailSent);
 box.append(text('strong',ok?'✅ Pedido de envio aceito pelo Gmail. Isso não garante entrega: confira os destinatários, Spam e eventuais devoluções.':'⚠️ Análise registrada, mas o e-mail com PDF não foi confirmado.'));
 if(!ok){
  box.append(text('p',String(data.emailError||'Verifique o serviço de envio.')));
  box.append(text('p','Use o botão BAIXAR PDF COMPLETO no Admin e envie o documento manualmente aos dois destinatários enquanto corrige o Gmail.'));
 }
 root.prepend(box);
}
let pdfObjectUrl=null;
function pdfMessage(msg,error=false){
 const root=$('minorAdminDetail');
 if(!root)return null;
 let el=$('minorPdfResult');
 if(!el){
  el=document.createElement('div');el.id='minorPdfResult';
  el.setAttribute('role','status');el.setAttribute('aria-live','polite');
  el.style.cssText='margin-top:15px;padding:15px;border:1px solid #805069;border-radius:12px;background:#21131e;color:#fff;font-size:14px';
  const buttons=root.querySelector('.m120-actions');
  if(buttons)buttons.after(el);else root.append(el);
 }
 el.replaceChildren();
 const heading=document.createElement('strong');heading.textContent=msg;
 heading.style.color=error?'#ffb2c4':'#b8f5d3';el.append(heading);
 el.scrollIntoView({block:'nearest',behavior:'smooth'});
 return el;
}
async function downloadAuthorizationPDF(row){
 const creds=credentials();
 if(!creds||row.status!=='conferido'){
  status('Somente ADM ou gerente com autorização aprovada pode baixar o PDF.',true);
  pdfMessage('Acesso restrito ou autorização ainda não conferida.',true);return;
 }
 const panel=pdfMessage('⏳ Gerando PDF completo com fotos, documentos, assinatura e QR Code...');
 status('Gerando PDF completo com fotos, documentos e assinatura...');
 try{
  const res=await fetch('https://txxoqfcwqncqyiqgzboz.supabase.co/functions/v1/hype-minor-pdf',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:row.id,...creds})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok||data.ok!==true||!data.base64)throw Error(data.error||'Falha do serviço de PDF (HTTP '+res.status+').');
  const bytesAsText=atob(data.base64),bytes=new Uint8Array(bytesAsText.length);
  for(let i=0;i<bytes.length;i++)bytes[i]=bytesAsText.charCodeAt(i);
  if(bytes.length<500||String.fromCharCode(...bytes.slice(0,4))!=='%PDF')throw Error('O servidor não retornou um PDF válido.');
  if(pdfObjectUrl)window.URL.revokeObjectURL(pdfObjectUrl);
  pdfObjectUrl=window.URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const target=panel||pdfMessage('PDF pronto');
  target.replaceChildren();
  target.append(text('strong','✅ PDF gerado! Escolha uma das opções abaixo.'));
  const controls=document.createElement('div');
  controls.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin-top:12px';
  const download=document.createElement('a');
  download.href=pdfObjectUrl;download.download=data.filename||'HYPE-AUTORIZACAO.pdf';
  download.className='m120-btn m120-green';
  download.style.cssText='text-decoration:none;display:inline-block;padding:12px 14px;border-radius:10px;color:white';
  download.textContent='⬇️ BAIXAR PDF';
  const view=document.createElement('a');
  view.href=pdfObjectUrl;view.target='_blank';view.rel='noopener noreferrer';
  view.className='m120-btn m120-ghost';
  view.style.cssText='text-decoration:none;display:inline-block;padding:12px 14px;border-radius:10px;color:white';
  view.textContent='👁️ ABRIR PDF';
  controls.append(download,view);target.append(controls);
  target.append(text('p','Se o navegador bloquear o download automático, toque diretamente em BAIXAR PDF ou ABRIR PDF.'));
  status('PDF gerado. Utilize BAIXAR PDF ou ABRIR PDF na ficha.',false);
  try{download.click();}catch(_){}
 }catch(err){
  const message='Não foi possível baixar o PDF: '+String(err.message||err);
  pdfMessage(message,true);status(message,true);
 }
}

async function detail(id){
 openedId=id;const el=$('minorAdminDetail');el.hidden=false;
 el.replaceChildren(text('p','Carregando ficha e documentos...'));
 el.scrollIntoView({behavior:'smooth',block:'start'});
 try{
  const data=await rpc('detail',{id});
  if(id!==openedId)return;
  const r=data.row;
  el.replaceChildren();
  el.appendChild(text('h3','📄 Autorização • '+eventName(r.event_id)));
  const flag=text('p','Status: '+r.status.toUpperCase()+' • Cadastrado em '+showDate(r.created_at),'m120-important');el.appendChild(flag);
  const list=document.createElement('dl');list.className='m120-detail-grid';
  const fields=[
   ['Nome do menor',r.minor_name],['CPF do menor',r.minor_cpf],
   ['Nascimento do menor',r.minor_birth_date],['Nome do responsável',r.guardian_name],
   ['CPF do responsável',r.guardian_cpf],['Nascimento do responsável',r.guardian_birth_date],
   ['WhatsApp',r.guardian_phone],['E-mail do responsável',r.guardian_email||'Não informado (cadastro antigo)'],['Gmail do menor',r.minor_email||'Não informado (cadastro antigo)'],['Vínculo declarado',r.relation],
   ['Validade',r.event_id==null?'Todas as festas HYPE, até 18 anos ou revogação':'Somente a festa original'],['Conferido por',r.reviewed_by||'Pendente'],['Ingresso vinculado',r.checkout_ticket_id?'ID '+r.checkout_ticket_id+' • origem: menor autorizado':'Ainda não comprado'],['Observação',r.review_note||'—']
  ];
  fields.forEach(([k,v])=>{list.append(text('dt',k),text('dd',String(v||'—')));});
  el.appendChild(list);
  if(r.email_notification_error&&!r.email_notified_at){
    const bad=text('p','⚠️ ENTREGA DO GMAIL NÃO CONFIRMADA: '+r.email_notification_error,'m120-warning');
    bad.id='minorEmailDeliveryAlert';
    bad.style.cssText='border:1px solid #b45373;background:#341b28;padding:14px;border-radius:12px';
    el.append(bad);
  }
  const correction=document.createElement('section');
  correction.style.cssText='margin:16px 0;padding:16px;border:1px solid #76485a;border-radius:13px;background:#1b1420';
  correction.append(text('h4','📧 Conferir ou corrigir endereço de Gmail'));
  correction.append(text('p','Peça ao responsável para confirmar o endereço correto diretamente pelo WhatsApp antes de trocar. Esta alteração não mexe nas fotos, na aprovação nem no ingresso.'));
  const bounceInfo=String(r.email_notification_error||'');
  const matchedAddress=bounceInfo.match(/Gmail devolvido a ([^\s()]+@[^\s()]+) \(550 5\.1\.1/i);
  const returnedAddress=matchedAddress?matchedAddress[1].toLowerCase():
    (/endereço inexistente|550 5\.1\.1/i.test(bounceInfo)?String(r.guardian_email||'').trim().toLowerCase():null);
  const choices=[['Gmail do responsável','guardian_email',r.guardian_email],['Gmail do menor','minor_email',r.minor_email]];
  const verifiedLabel=document.createElement('label');
  verifiedLabel.style.cssText='display:flex;align-items:start;gap:9px;margin:10px 0';
  const confirmed=document.createElement('input');confirmed.type='checkbox';confirmed.style.cssText='width:20px;height:20px;flex:none;margin:3px 0';
  verifiedLabel.append(confirmed,text('span','Confirmo que verifiquei o endereço atualizado diretamente com o responsável.'));
  correction.append(verifiedLabel);
  for(const [label,field,value] of choices){
    const labelEl=document.createElement('label');labelEl.style.cssText='display:block;margin:12px 0 5px';
    labelEl.append(text('strong',label));
    const inp=document.createElement('input');inp.type='email';inp.value=value||'';inp.maxLength=180;
    inp.autocomplete='off';inp.style.cssText='width:100%;padding:12px;border:1px solid #715169;border-radius:9px;background:#0d0b11;color:#fff';
    const save=document.createElement('button');save.type='button';save.className='m120-btn';
    save.textContent='SALVAR '+label.toUpperCase();save.style.marginTop='7px';
    const feedback=document.createElement('p');
    feedback.setAttribute('role','status');
    feedback.setAttribute('aria-live','polite');
    feedback.style.cssText='margin:7px 0 13px;font-size:13px;min-height:18px;color:#a7efd4';
    save.addEventListener('click',async(event)=>{
      event.preventDefault();event.stopPropagation();
      if(!confirmed.checked){feedback.style.color='#ffb9c8';feedback.textContent='Confirme que falou com o responsável.';return;}
      if(!inp.checkValidity()){feedback.style.color='#ffb9c8';feedback.textContent='Confira o endereço de Gmail.';return;}
      if(!confirm('Você verificou este Gmail com o responsável? O PDF contém documentos pessoais.'))return;
      save.disabled=true;save.textContent='SALVANDO...';
      feedback.style.color='#a7efd4';feedback.textContent='Salvando o Gmail...';
      try{
        const result=await rpc('correct_email',{id,field,email:inp.value.trim(),contactVerified:true});
        const email=String(result.email||inp.value.trim()).toLowerCase();
        const changed=r[field]!==email;
        r[field]=email;
        inp.value=email;
        const dt=Array.from(list.querySelectorAll('dt')).find(node=>node.textContent===(field==='guardian_email'?'E-mail do responsável':'Gmail do menor'));
        if(dt&&dt.nextElementSibling)dt.nextElementSibling.textContent=email;
        const stillReturned=!!(returnedAddress&&
          [r.guardian_email,r.minor_email].some(value=>String(value||'').trim().toLowerCase()===returnedAddress));
        if(changed){
          const resend=el.querySelector('#minorResendPdf');
          if(resend){
            resend.disabled=stillReturned;
            resend.title=stillReturned?'O endereço devolvido pelo Google ainda está em um dos campos. Corrija os dois.':'Confira os Gmails antes de reenviar o PDF.';
          }
          const oldAlert=el.querySelector('#minorEmailDeliveryAlert');
          if(oldAlert)oldAlert.textContent=stillReturned
             ?'⚠️ O endereço inexistente ainda está em um dos Gmails. Corrija antes de reenviar.'
             :'✅ Gmails corrigidos. Confirme os dois destinatários e clique em REENVIAR PDF.';
        }
        feedback.style.color=stillReturned?'#ffcf9b':'#a7efd4';
        feedback.textContent=stillReturned
          ?'✅ Este Gmail foi salvo. ATENÇÃO: o endereço devolvido ainda está no outro campo. Corrija o outro também.'
          :'✅ Gmail salvo! Esta ficha permanece aberta. Confira os dois endereços antes de reenviar o PDF.';
        status(result.message||'Gmail salvo com sucesso.',false);
        save.textContent='✅ GMAIL SALVO';
      }catch(err){
        feedback.style.color='#ffb9c8';
        feedback.textContent='❌ Não salvou: '+err.message;
        status('Erro ao corrigir Gmail: '+err.message,true);
        save.textContent='TENTAR SALVAR';
      }finally{save.disabled=false;}
    });
    correction.append(labelEl,inp,save,feedback);
  }
  el.append(correction);
  const docs=document.createElement('div');docs.className='m120-image-grid';
  for(const [label,url] of [
    ['📷 Selfie facial do menor (16-17 anos)',data.minorFaceUrl],
    ['🪪 Documento do menor',data.minorDocumentUrl],
    ['📷 Selfie enviada pelo responsável',data.photoUrl],
    ['🪪 RG/CNH do responsável (foto)',data.documentUrl],
    ['✍️ Assinatura do responsável',data.signatureUrl]
  ]){
    const item=document.createElement('div');item.className='m120-image';
    item.appendChild(text('strong',label));const im=document.createElement('img');im.alt=label;im.loading='lazy';im.referrerPolicy='no-referrer';
    if(url)im.src=url;else item.appendChild(text('p',label.includes('RG/CNH')?'Foto do documento não cadastrada nesta declaração.':'Imagem temporariamente indisponível'));
    item.appendChild(im);docs.appendChild(item);
  }
  el.appendChild(docs);
  const warn=text('p','🚫 Álcool proibido para menores de 18 anos, sem exceções. Uma declaração do responsável não substitui a autorização exigida pela lei ou por autoridade competente. Selfie, foto do documento e assinatura não equivalem à verificação presencial da identidade.','m120-warning');
  el.appendChild(warn);
  const labelA=document.createElement('label');labelA.className='m120-check';
  const checkedDoc=document.createElement('input');checkedDoc.type='checkbox';
  labelA.append(checkedDoc,text('span','Analisei os dados da declaração e os documentos informados; a conferência dos originais acontecerá na portaria.'));
  const labelB=document.createElement('label');labelB.className='m120-check';
  const checkedRules=document.createElement('input');checkedRules.type='checkbox';
  labelB.append(checkedRules,text('span','Estou ciente de que cada evento pode ter regras próprias de admissão, que devem ser conferidas na portaria. O menor não terá acesso a bebidas alcoólicas.'));
  el.append(labelA,labelB);
  const hasGuardianDocument=Boolean(r.guardian_document_path&&data.documentUrl);
  const hasMinorFace=Boolean(r.minor_face_photo_path&&data.minorFaceUrl);
  const hasMinorDocument=Boolean(r.minor_document_path&&data.minorDocumentUrl);
  const reference=r.event_id==null
    ?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
    :events.find(e=>Number(e.id)===Number(r.event_id))?.event_date;
  const years=reference?Number(reference.slice(0,4))-Number(r.minor_birth_date.slice(0,4))-(reference.slice(5)<r.minor_birth_date.slice(5)?1:0):-1;
  const eligibleAge=years===16||years===17;
  const docsReady=hasGuardianDocument&&hasMinorFace&&hasMinorDocument&&eligibleAge;
  if(!docsReady)el.appendChild(text('p','⚠️ Só é possível conferir adolescentes com 16 ou 17 anos, selfie e documentos de ambos. Autorização geral vence ao completar 18 anos. Solicite uma nova declaração se faltar algo.','m120-warning'));
  const note=document.createElement('textarea');note.placeholder='Observações da conferência (opcional)';note.maxLength=400;note.rows=3;note.value=r.review_note||'';note.className='m120-note';el.append(note);
  const buttons=document.createElement('div');buttons.className='m120-actions';
  const accept=document.createElement('button');accept.type='button';accept.className='m120-btn m120-green';accept.textContent='✅ MARCAR CONFERIDO';
  const reject=document.createElement('button');reject.type='button';reject.className='m120-btn m120-red';reject.textContent='⛔ RECUSAR';
  if(!docsReady){accept.disabled=true;accept.title='Exige idade 16–17 anos, selfie e documento do menor, e documento do responsável';}
  const close=document.createElement('button');close.type='button';close.className='m120-btn m120-ghost';close.textContent='FECHAR';
  close.addEventListener('click',()=>{openedId=null;el.hidden=true;el.replaceChildren();});
  async function decide(next){
    if(next==='conferido'&&!docsReady){status('É necessário ter 16–17 anos, selfie e documento do menor e do responsável.',true);return;}
    if(!checkedDoc.checked||!checkedRules.checked){status('Marque as duas conferências antes de salvar a decisão.',true);el.scrollIntoView({block:'center'});return;}
    if(!confirm('Confirmar a decisão "'+next+'"? Isto não libera a entrada automaticamente.'))return;
    accept.disabled=true;reject.disabled=true;
    try{
      await rpc('review',{id,status:next,note:note.value,documentsChecked:true,eventEligibilityChecked:true});
      if(next==='conferido'){
        let delivery;
        try { delivery=await sendNotification(id); }
        catch(err) { delivery={emailSent:false,emailError:err.message}; }
        await load();
        if(openedId===id){await detail(id);showNotificationResult(delivery);}
        status(delivery.emailSent?'Pedido de envio aceito pelo Gmail. Confirme recebimento e eventuais devoluções.':'Autorização aprovada, mas o PDF não foi enviado: '+String(delivery.emailError||'Falha desconhecida'),!delivery.emailSent);
      }else{
        let delivery;
        try{delivery=await sendNotification(id);}
        catch(err){delivery={emailSent:false,emailError:err.message,emails:[r.guardian_email,r.minor_email].filter(Boolean),manualLink:null};}
        await load();
        if(openedId===id){await detail(id);showNotificationResult(delivery);}
        status(delivery.emailSent?'Recusa registrada; e-mails enviados.':'Recusa registrada; envio por e-mail não confirmado.',!delivery.emailSent);
      }
    }catch(e){status('Falha ao salvar: '+e.message,true);}finally{accept.disabled=!docsReady;reject.disabled=false;}
  }
  accept.addEventListener('click',()=>decide('conferido'));
  reject.addEventListener('click',()=>decide('recusado'));
  const whatsapp=document.createElement('button');
  whatsapp.type='button';whatsapp.className='m120-btn m120-ghost';whatsapp.textContent='💬 FALAR COM RESPONSÁVEL';
  whatsapp.addEventListener('click',()=>{
    const number=String(r.guardian_phone||'').replace(/\D/g,'');
    if(number.length<10||number.length>11){status('Número de WhatsApp do responsável inválido.',true);return;}
    const msg='Olá! Aqui é da HYPE Lounge Club. Sobre a autorização para '+r.minor_name+' no evento '+eventName(r.event_id)+': precisamos confirmar a análise e os próximos passos para o ingresso. Lembramos que a autorização não dispensa a conferência documental na portaria e menores não podem consumir bebidas alcoólicas.';
    window.open('https://wa.me/55'+number+'?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');
  });
  const email=document.createElement('button');
  email.type='button';email.className='m120-btn m120-ghost';
  email.textContent='📧 REENVIAR RESULTADO DA RECUSA';
  email.disabled=r.status!=='recusado';
  email.addEventListener('click',async()=>{
    if(r.status!=='recusado')return;
    if(!confirm('Reenviar resultado da recusa para os dois Gmails?'))return;
    email.disabled=true;email.textContent='TENTANDO ENVIAR...';
    try{
      const result=await sendNotification(r.id);
      showNotificationResult(result);
      status(result.emailSent?'Solicitação de envio aceita para os dois Gmails.':'Envio automático NÃO confirmado; use o link de e-mail manual.',!result.emailSent);
    }catch(err){status('Falha na notificação: '+err.message,true);}
    finally{email.disabled=false;email.textContent='📧 REENVIAR RESULTADO AOS DOIS GMAILS';}
  });
  if(r.status==="conferido"){
    const resend=document.createElement("button");resend.type="button";resend.className="m120-btn m120-green";
    resend.textContent="📧 REENVIAR PDF AOS DOIS GMAILS";
    resend.id='minorResendPdf';
    const bounced=Boolean(r.email_notification_error&&/endereço inexistente|550 5\.1\.1/i.test(r.email_notification_error));
    if(bounced){resend.disabled=true;resend.title="Corrija o Gmail inexistente e reabra a ficha antes de reenviar.";}
    resend.addEventListener("click",async()=>{
      resend.disabled=true;resend.textContent="ENVIANDO PDF...";
      try{
        const result=await sendNotification(r.id);
        showNotificationResult(result);
        status(result.emailSent?"Envio aceito pelo Gmail, mas entrega ainda não confirmada.":"Envio do PDF não confirmado: "+String(result.emailError||"Erro desconhecido"),!result.emailSent);
      }catch(e){status("Erro no envio do PDF: "+e.message,true);}
      finally{resend.disabled=false;resend.textContent="📧 REENVIAR PDF AOS DOIS GMAILS";}
    });
    buttons.append(resend);
    const pdf=document.createElement("button");pdf.type="button";pdf.className="m120-btn m120-green";
    pdf.textContent="📄 BAIXAR AUTORIZAÇÃO PDF + QR CODE";
    pdf.addEventListener("click",()=>downloadAuthorizationPDF(r));
    buttons.append(pdf);
    const validator=document.createElement("a");
    validator.href="menores-portaria.html?protocolo="+encodeURIComponent(r.id);
    validator.target="_blank";validator.rel="noopener noreferrer";
    validator.textContent="🔎 ABRIR CONFERÊNCIA DO QR";
    validator.className="m120-btn m120-ghost";
    validator.style.cssText="text-decoration:none;display:inline-flex;align-items:center;justify-content:center";
    buttons.append(validator);
  }
  if(r.status==='conferido'){accept.disabled=true;accept.textContent='✅ JÁ CONFERIDO';}
  buttons.append(accept,reject,whatsapp,close);if(r.status==='recusado')buttons.append(email);el.appendChild(buttons);
 }catch(e){el.replaceChildren(text('p','Erro ao abrir ficha: '+e.message));}
}
async function purge(){
 if(!confirm('Excluir definitivamente arquivos e declarações vencidas? Esta ação não pode ser desfeita.'))return;
 try{const result=await rpc('purge');status('Registros vencidos excluídos: '+result.removed);await load();}catch(e){status('Falha ao limpar registros: '+e.message,true);}
}
function init(){
 $('minorRefresh')?.addEventListener('click',load);
 $('minorAdminEvent')?.addEventListener('change',load);
 $('minorPurge')?.addEventListener('click',purge);
}
window.HypeMinorAdminV120={load};
document.addEventListener('DOMContentLoaded',init);
})();