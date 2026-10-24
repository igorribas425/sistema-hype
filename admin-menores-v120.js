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
function eventName(id){return events.find(x=>Number(x.id)===Number(id))?.name||('Evento #'+id);}
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
  const all=document.createElement('option');all.value='';all.textContent='Todos os eventos';select.appendChild(all);
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
 if(!rows.length){container.appendChild(text('p','Nenhuma declaração encontrada para este evento.','m120-empty'));return;}
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
   ['WhatsApp',r.guardian_phone],['E-mail do responsável',r.guardian_email||'Não informado (cadastro antigo)'],['Vínculo declarado',r.relation],
   ['Conferido por',r.reviewed_by||'Pendente'],['Ingresso vinculado',r.checkout_ticket_id?'ID '+r.checkout_ticket_id+' • origem: menor autorizado':'Ainda não comprado'],['Observação',r.review_note||'—']
  ];
  fields.forEach(([k,v])=>{list.append(text('dt',k),text('dd',String(v||'—')));});
  el.appendChild(list);
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
  labelB.append(checkedRules,text('span','Verifiquei as regras de admissão do evento e a legislação aplicável. O menor não terá acesso a bebidas alcoólicas.'));
  el.append(labelA,labelB);
  const hasGuardianDocument=Boolean(r.guardian_document_path&&data.documentUrl);
  const hasMinorFace=Boolean(r.minor_face_photo_path&&data.minorFaceUrl);
  const hasMinorDocument=Boolean(r.minor_document_path&&data.minorDocumentUrl);
  const eventDate=events.find(e=>Number(e.id)===Number(r.event_id))?.event_date;
  const years=eventDate?new Date(eventDate+'T12:00:00Z').getUTCFullYear()-new Date(r.minor_birth_date+'T12:00:00Z').getUTCFullYear()-((eventDate.slice(5,10)<r.minor_birth_date.slice(5,10))?1:0):-1;
  const eligibleAge=years===16||years===17;
  const docsReady=hasGuardianDocument&&hasMinorFace&&hasMinorDocument&&eligibleAge;
  if(!docsReady)el.appendChild(text('p','⚠️ Só é possível conferir adolescentes de 16 ou 17 anos na data do evento, com selfie e documento do menor e documento do responsável. Solicite uma nova declaração se faltar algo.','m120-warning'));
  const note=document.createElement('textarea');note.placeholder='Observações da conferência (opcional)';note.maxLength=400;note.rows=3;note.value=r.review_note||'';note.className='m120-note';el.append(note);
  const buttons=document.createElement('div');buttons.className='m120-actions';
  const accept=document.createElement('button');accept.type='button';accept.className='m120-btn m120-green';accept.textContent='✅ MARCAR CONFERIDO';
  const reject=document.createElement('button');reject.type='button';reject.className='m120-btn m120-red';reject.textContent='⛔ RECUSAR';
  if(!docsReady){accept.disabled=true;accept.title='Exige idade 16–17 anos, selfie e documento do menor, e documento do responsável';}
  const close=document.createElement('button');close.type='button';close.className='m120-btn m120-ghost';close.textContent='FECHAR';
  close.addEventListener('click',()=>{openedId=null;el.hidden=true;el.replaceChildren();});
  async function decide(next){
    if(next==='conferido'&&!docsReady){status('É necessário ter 16–17 anos na data do evento e selfie e documento do menor e do responsável.',true);return;}
    if(!checkedDoc.checked||!checkedRules.checked){status('Marque as duas conferências antes de salvar a decisão.',true);el.scrollIntoView({block:'center'});return;}
    if(!confirm('Confirmar a decisão "'+next+'"? Isto não libera a entrada automaticamente.'))return;
    accept.disabled=true;reject.disabled=true;
    try{
      await rpc('review',{id,status:next,note:note.value,documentsChecked:true,eventEligibilityChecked:true});
      status('Análise preliminar salva. A portaria deverá verificar documentos originais antes da entrada.');
      await load();
      if(openedId===id)await detail(id);
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
  email.textContent=r.status==='conferido'?'📧 ENVIAR LINK DE COMPRA':'📧 RESPONDER POR E-MAIL';
  email.disabled=!/^\S+@\S+\.\S+$/.test(String(r.guardian_email||''));
  email.title=email.disabled?'Cadastro sem e-mail válido. Confira com o responsável.':'Preparar aviso por e-mail';
  email.addEventListener('click',async()=>{
    const address=String(r.guardian_email||'').trim();
    if(!/^\S+@\S+\.\S+$/.test(address))return status('Este cadastro não possui e-mail válido.',true);
    const title='HYPE Lounge Club • Autorização para '+r.minor_name;
    let body='';
    if(r.status==='conferido'){
      email.disabled=true;email.textContent='GERANDO LINK PRIVADO...';
      try{
        const d=await rpc('issue_checkout',{id:r.id});
        const link=d.purchaseLink;
        body='Olá, '+r.guardian_name+'!\n\nA autorização para '+r.minor_name+' no evento '+eventName(r.event_id)+' foi conferida pela HYPE.\n\nA compra está disponível exclusivamente neste link:\n'+link+'\n\nO ingresso Pista para a noite toda custa R$ 30, em nome e CPF do menor autorizado. Realize o PIX e aguarde o QR Code no e-mail do responsável.\n\nA conferência não garante entrada: documentos originais e regras legais de admissão serão verificados na portaria. É proibido fornecer bebidas alcoólicas a menores de 18 anos.\n\nHYPE Lounge Club';
        const box=document.createElement('div');box.className='m120-warning';
        const explanation=text('p','LINK PRIVADO GERADO. O e-mail será aberto para você apertar Enviar. Se preferir, copie o link abaixo:');
        const field=document.createElement('input');field.value=link;field.readOnly=true;field.style.cssText='width:100%;padding:12px;border-radius:8px;color:#fff;background:#100c11;border:1px solid #9c6a83';
        const copy=document.createElement('button');copy.type='button';copy.className='m120-btn m120-ghost';copy.textContent='📋 COPIAR LINK';
        copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link);status('Link copiado. Envie somente ao responsável.',false);}catch(_){field.focus();field.select();status('Selecione e copie o link.',true);}});
        box.append(explanation,field,copy);el.appendChild(box);
        status('Link exclusivo preparado. Não houve envio automático; confirme o envio no seu e-mail.');
      }catch(err){status('Falha ao gerar link: '+err.message,true);return;}
      finally{email.disabled=false;email.textContent='📧 ENVIAR LINK DE COMPRA';}
    }else{
      body='Olá, '+r.guardian_name+'!\n\nSobre a autorização para '+r.minor_name+' no evento '+eventName(r.event_id)+': a declaração ainda não foi aprovada para compra. Entre em contato com a equipe da HYPE para esclarecimentos.\n\nHYPE Lounge Club';
    }
    window.location.href='mailto:'+encodeURIComponent(address)+'?subject='+encodeURIComponent(title)+'&body='+encodeURIComponent(body);
  });
  buttons.append(accept,reject,whatsapp,email,close);el.appendChild(buttons);
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