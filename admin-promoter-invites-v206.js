(()=>{
'use strict';
const $=id=>document.getElementById(id);
const cfg=window.HYPE_SUPABASE_CONFIG||{};
const sb=window.supabase?.createClient(cfg.url,cfg.anonKey);
const arr=x=>Array.isArray(x)?x:(x?[x]:[]);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowParts=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).reduce((o,x)=>(x.type==='literal'?o:(o[x.type]=x.value,o)),{});
function eventFinishedV206(day){
 const parts=nowParts(),today=[parts.year,parts.month,parts.day].join('-');
 const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-1);
 const yesterday=date.toISOString().slice(0,10);
 return !!day && (day<yesterday||(day===yesterday&&Number(parts.hour)>=8));
}
const auth=()=>({p_username:HYPE?.user||'',p_password:HYPE?.pass||''});
async function rpc(name,params){
 if(!sb)throw Error('Supabase indisponível.');
 const {data,error}=await sb.rpc(name,params);
 if(error)throw error;
 return arr(data);
}
const status=message=>{if($('v206StatusText'))$('v206StatusText').textContent=message;};
const registrationUrl='https://hypeloungeclub.com.br/promoter-convite.html';
let events=[],promoters=[],guests=[];
async function copyRegistration(){
 try{await navigator.clipboard.writeText(registrationUrl);}
 catch(_){const t=document.createElement('textarea');t.value=registrationUrl;document.body.append(t);t.select();document.execCommand('copy');t.remove();}
 status('Link geral de cadastro copiado.');
}
async function shareRegistration(){
 if(navigator.share){try{await navigator.share({title:'Cadastro Promoter de Convidados HYPE',url:registrationUrl});return;}catch(_){}}
 return copyRegistration();
}
function metric(label,n){return '<div><small>'+esc(label)+'</small><b>'+Number(n||0)+'</b></div>';}
function render(){
 const promoter=$('v206Promoter')?.value||'',filter=$('v206Status')?.value||'';
 const list=guests.filter(g=>(!promoter||g.promoter_code===promoter)&&
  (!filter||filter==='Arquivados'||(
   filter==='Ausente'?(g.status==='Liberado'&&eventFinishedV206(g.event_date)):
   filter==='SemCheckin'?(g.status==='Liberado'&&!g.entered_at):g.status===filter
  )));
  const by=key=>guests.filter(g=>g.status===key).length;
 const missing=guests.filter(g=>g.status==='Liberado'&&eventFinishedV206(g.event_date)).length;
 const cards=$('v206Stats');if(cards)cards.innerHTML=
  metric('CADASTRADOS',guests.length)+metric('PENDENTES',by('Pendente'))+
  metric('APROVADOS',by('Liberado')+by('Entrou'))+metric('CHECK-IN',by('Entrou'))+
  metric('NÃO COMPARECERAM',missing);
 const links=$('v206PromoterLinks');
 if(links)links.innerHTML=promoters.map(p=>
  '<div class="v206-row"><div><strong>'+esc(p.name)+'</strong>'+
  '<small>'+(p.active!==false?'CADASTRO ATIVO':'CADASTRO DESATIVADO')+
  ' • Convidados: '+Number(p.total_invites||0)+' • Check-ins: '+Number(p.checkins||0)+'</small>'+
  '<small>Cadastro exclusivo de convidados, independente da área de vendas.</small></div>'+
  (HYPE?.role==='admin'?'<button class="btn-action" data-toggle="'+Number(p.id)+'">'+
  (p.active!==false?'DESATIVAR':'REATIVAR')+'</button>':'')+'</div>'
 ).join('')||'<p>Nenhum promoter de convidados cadastrado. Compartilhe o link geral de cadastro acima.</p>';
 const out=$('v206Guests');if(!out)return;
 out.innerHTML=list.map(g=>{
 const checked=Boolean(g.entered_at||g.status==='Entrou');
 const noShow=!checked&&g.status==='Liberado'&&eventFinishedV206(g.event_date);
 const checkStatus=checked?'✅ FEZ CHECK-IN':noShow?'❌ NÃO COMPARECEU':'⏳ NÃO FEZ CHECK-IN';
 const bg=checked?'#123d29':noShow?'#451d25':'#352a1b';
 const fg=checked?'#9cf3bd':noShow?'#ffd0d6':'#ffdfa4';
 const tm=g.entered_at?' • '+new Date(g.entered_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';
 const mail=g.email_sent_at?'📨 Resend aceitou envio em '+new Date(g.email_sent_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (entrega ao Gmail não confirmada)':
  g.email_error?'⚠️ Falha no e-mail: '+g.email_error:'📩 QR ainda não enviado';
 const approve=g.status==='Pendente'?
 '<button type="button" class="btn-action btn-confirm" data-approve="'+g.list_id+'">✓ APROVAR</button><button type="button" class="btn-action btn-del" data-reject="'+g.list_id+'">RECUSAR</button>':
 g.status==='Liberado'&&g.email?'<button type="button" class="btn-action" data-email="'+g.list_id+'">📧 '+(g.email_sent_at?'REENVIAR QR':'ENVIAR QR')+'</button>':'';
 const archived=Boolean(g.promoter_archived_at);
  const remove=HYPE?.role!=='admin'?'':archived?
   '<small style="color:#b5b5bd">🗃️ ARQUIVADO • histórico preservado</small>':
   '<button type="button" class="btn-action btn-del" data-delete="'+g.list_id+'">🗃️ EXCLUIR DA LISTA</button>';
  return '<div class="v206-row"><div style="flex:1;min-width:0"><strong>'+esc(g.name)+'</strong>'+
 '<div style="display:block;background:'+bg+';color:'+fg+';font-weight:900;font-size:13px;border-radius:9px;padding:9px 12px;margin:9px 0">'+esc(checkStatus+tm)+'</div>'+
 '<small>🎤 Promoter: '+esc(g.promoter_name||g.promoter_code)+' • '+esc(g.event_name)+' ('+esc(g.event_date)+')</small>'+
 '<small>Situação: '+esc(g.status)+' • '+esc(g.gender||'')+'</small>'+
 '<small>CPF: '+esc(g.cpf||'')+' • WhatsApp: '+esc(g.phone||'')+'</small>'+
 '<small>E-mail: '+esc(g.email||'')+' • Instagram: '+esc(g.instagram||'')+'</small>'+
 '<small>'+esc(mail)+'</small></div><div class="v206-actions">'+
 (g.photo_path?'<button type="button" class="btn-action" data-photo="'+g.list_id+'">📷 SELFIE</button>':'')+
 approve+remove+'</div></div>';
 }).join('')||'<div class="v206-row">Nenhum convidado para este filtro.</div>';
}
async function refreshGuests(){
 try{
  const eid=Number($('v206Event')?.value||0);
  guests=await rpc('staff_promoter_guests_v209',{...auth(),p_event_id:eid||null,p_archived_only:$('v206Status')?.value==='Arquivados'});
  render();status(guests.length+' convidado(s) consultado(s).');
 }catch(err){status('Erro ao carregar convidados: '+String(err.message||err));}
}
async function load(){
 if(!HYPE?.user||!HYPE?.pass){status('Entre no Admin para abrir Lista/Promoter.');return;}
 status('Buscando festas, promoters e convidados...');
 try{
  const oldEvent=$('v206Event')?.value||'',oldPromoter=$('v206Promoter')?.value||'';
  const [eventsRaw,promos]=await Promise.all([
   rpc('staff_list_events_v13',auth()),
   rpc('staff_list_invite_promoters_v207',auth())
  ]);
  events=eventsRaw;promoters=promos;
  const sel=$('v206Event'),ps=$('v206Promoter');
  sel.replaceChildren();sel.add(new Option('TODOS OS EVENTOS (HISTÓRICO)','0'));
  const ordered=events.slice().sort((a,b)=>String(a.event_date).localeCompare(String(b.event_date)));
  for(const event of ordered)sel.add(new Option(String(event.event_date||'')+' • '+String(event.name||'Evento'),String(event.id)));
  const local=nowParts(),today=[local.year,local.month,local.day].join('-');
  const current=ordered.find(e=>e.event_date>=today&&e.active!==false)||ordered[ordered.length-1];
  sel.value=oldEvent&&[...sel.options].some(o=>o.value===oldEvent)?oldEvent:String(current?.id||0);
  ps.replaceChildren();ps.add(new Option('TODOS OS PROMOTERS',''));
  for(const pro of promoters)ps.add(new Option(String(pro.name||pro.code)+' • '+String(pro.code),pro.code));
  if(promoters.some(pro=>pro.code===oldPromoter))ps.value=oldPromoter;
  await refreshGuests();
 }catch(err){status('Falha ao carregar: '+String(err.message||err));}
}
async function sendQr(id,force=false){
 if(HYPE?.role!=='admin')throw Error('Somente Admin pode enviar convite.');
 const reply=await fetch(cfg.url+'/functions/v1/send-ticket-email',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'guest_list_approved',username:HYPE.user,password:HYPE.pass,list_id:id,force})
 });
 const body=await reply.json().catch(()=>({}));
 if(!reply.ok||body.ok!==true)throw Error(body.error||'Resend recusou o QR.');
 return body;
}
async function review(id,decision){
 if(HYPE?.role!=='admin')return alert('Somente Admin pode analisar convites.');
 const guest=guests.find(g=>Number(g.list_id)===id);
 if(!guest||guest.status!=='Pendente')return;
 if(!confirm((decision==='aprovar'?'APROVAR':'RECUSAR')+' o convite de '+guest.name+'?'))return;
 try{
  await rpc('staff_promoter_guest_review_v206',{...auth(),p_list_id:id,p_decision:decision});
  if(decision==='aprovar'){
   try{
    await sendQr(id,false);
    status('Convite aprovado e QR aceito pelo Resend. Entrega sujeita ao provedor.');
   }catch(err){alert('Cadastro aprovado, mas o QR não foi confirmado pelo Resend: '+err.message+'. Use ENVIAR QR para tentar novamente.');}
  }else status('Convite recusado.');
  await refreshGuests();
 }catch(err){alert('Não foi possível analisar: '+String(err.message||err));}
}
async function manualEmail(id){
 if(!confirm('Enviar/reenviar o QR de convidado para o e-mail cadastrado?'))return;
 try{await sendQr(id,true);status('Solicitação de QR aceita pelo Resend.');await refreshGuests();}
 catch(err){alert('Falha no envio: '+String(err.message||err));await refreshGuests();}
}
async function deleteGuest(id){
 if(HYPE?.role!=='admin')return alert('Somente o Admin pode retirar cadastros da lista.');
 const guest=guests.find(g=>Number(g.list_id)===id);
 if(!guest||guest.promoter_archived_at)return;
 const entered=guest.status==='Entrou'||Boolean(guest.entered_at);
 const explanation=entered?'O registro e o horário do check-in serão preservados.':
  'O QR aprovado será cancelado, impedindo entrada pelo convite.';
 const message='Excluir '+guest.name+' da lista ativa?\n\n'+explanation+
 '\n\nVocê poderá consultar a ficha em ARQUIVADOS. Confirma?';
 if(!confirm(message))return;
 const button=$('v206Guests')?.querySelector('[data-delete="'+id+'"]');
 if(button){button.disabled=true;button.textContent='ARQUIVANDO...';}
 try{
  const result=await rpc('staff_promoter_guest_archive_v209',{...auth(),p_list_id:id,p_archive:true});
  if(!result[0]?.ok)throw Error(result[0]?.message||'Falha ao arquivar cadastro.');
  await refreshGuests();
  status('Convidado retirado da lista ativa, com histórico preservado.');
 }catch(err){
  alert('Não foi possível retirar da lista: '+String(err.message||err));
  if(button){button.disabled=false;button.textContent='🗃️ EXCLUIR DA LISTA';}
 }
}
function init(){
 $('v206Event')?.addEventListener('change',refreshGuests);
 $('v206Promoter')?.addEventListener('change',render);
 $('v206Status')?.addEventListener('change',refreshGuests);
 $('v206PromoterInviteAdminPanel')?.addEventListener('click',e=>{
  const target=e.target.closest('[data-toggle],[data-photo],[data-approve],[data-reject],[data-email],[data-delete]');
  if(!target)return;
  if(target.dataset.toggle)togglePromoter(Number(target.dataset.toggle));
  else if(target.dataset.photo)window.HypeV49Registration?.openPhoto?.(Number(target.dataset.photo));
  else if(target.dataset.approve)review(Number(target.dataset.approve),'aprovar');
  else if(target.dataset.reject)review(Number(target.dataset.reject),'recusar');
  else if(target.dataset.email)manualEmail(Number(target.dataset.email));
  else if(target.dataset.delete)deleteGuest(Number(target.dataset.delete));
 });
}
document.addEventListener('DOMContentLoaded',init);
async function togglePromoter(id){
 if(HYPE?.role!=='admin')return alert('Somente Admin pode alterar promoters.');
 const p=promoters.find(p=>Number(p.id)===id);if(!p)return;
 const enable=p.active===false;if(!confirm((enable?'Reativar':'Desativar')+' '+p.name+'?'))return;
 try{await rpc('staff_set_invite_promoter_active_v207',{...auth(),p_id:id,p_active:enable});await load();}
 catch(err){alert('Falha ao alterar promoter: '+String(err.message||err));}
}
window.HypePromoterInvitesV206={load,refreshGuests,copyRegistration,shareRegistration};
})();