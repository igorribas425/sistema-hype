/* HYPE • Mapa de promoters — GPS somente após aceite explícito. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const panel=()=>$('hypePromoterLocationAdminPanel');
 const cfg=window.HYPE_SUPABASE_CONFIG||{};
 const client=window.supabase?.createClient(cfg.url,cfg.anonKey);
 let map=null,pins=null,people=[],busy=false;
 const credentials=()=>{const h=typeof HYPE!=='undefined'?HYPE:null;return h?.user&&h?.pass?{p_username:h.user,p_password:h.pass}:null};
 const one=d=>Array.isArray(d)?d[0]:d;
 const element=(tag,content,cls)=>{const n=document.createElement(tag);n.textContent=content||'';if(cls)n.className=cls;return n};
 const status=(s,bad=false)=>{const el=$('hypeLocAdminStatus');if(el){el.textContent=s;el.style.color=bad?'#ffb1bf':'#b8edd0'}};
 async function rpc(name,args){if(!client)throw Error('Supabase indisponível');const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message||'Falha do Supabase');return data}
 function showMap(){
  if(!map&&window.L){map=L.map('hypeLocMap').setView([-28.2626,-52.4087],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap',maxZoom:18}).addTo(map);pins=L.layerGroup().addTo(map)}
  if(!map){$('hypeLocMapFallback').hidden=false;return}
  $('hypeLocMapFallback').hidden=true;pins.clearLayers();const bounds=[];
  people.forEach(p=>{
   if(!p.sharing||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude))return;
   const ll=[p.latitude,p.longitude],pop=element('div','');
   pop.append(element('strong',p.promoter_name),element('div',p.role_name),element('div',p.guests==null?'':'Convidados informados: '+p.guests),element('div','Atualizado: '+new Date(p.last_seen).toLocaleTimeString('pt-BR')));
   L.marker(ll).bindPopup(pop).addTo(pins);bounds.push(ll);
  });
  setTimeout(()=>{map.invalidateSize();if(bounds.length)map.fitBounds(bounds,{padding:[45,45],maxZoom:15})},100);
 }
 async function generate(p){
  const a=credentials();if(!a)return status('Faça login no ADM.',true);
  if(!confirm('Gerar convite privado de localização para '+p.promoter_name+'? O promoter precisará aceitar explicitamente. O convite anterior será revogado.'))return;
  try{
   const r=one(await rpc('hype_promoter_location_new_invite_v1',{...a,p_promoter_id:p.promoter_id}));
   if(!r?.ok||!r.invite_url)throw Error('Convite não gerado');
   $('hypeLocInviteName').textContent=p.promoter_name;
   $('hypeLocInviteUrl').value=r.invite_url;
   $('hypeLocInviteBox').hidden=false;status('Convite criado. Envie individualmente pelo WhatsApp.');await refresh();
  }catch(e){status(e.message,true)}
 }
 async function revoke(p){
  const a=credentials();if(!a||!confirm('Revogar o compartilhamento de '+p.promoter_name+'?'))return;
  try{if(p.collective)await rpc('hype_collective_admin_stop_v2',{...a,p_session_id:p.session_id});else await rpc('hype_promoter_location_admin_revoke_v1',{...a,p_promoter_id:p.promoter_id});$('hypeLocInviteBox').hidden=true;await refresh()}catch(e){status(e.message,true)}
 }
 function render(){
  const list=$('hypeLocPromotersList');list.replaceChildren();
  const online=people.filter(p=>p.sharing===true).length;const checked=people.filter(p=>p.checkin_id);const count=$('hypeCheckinStats');if(count)count.textContent=checked.length+' check-ins • '+checked.reduce((sum,p)=>sum+Number(p.guests||0),0)+' convidados informados';
  $('hypeLocOnline').textContent=online;$('hypeLocTotal').textContent=people.filter(p=>!p.collective).length;
  $('hypeLocCount').textContent=online+' compartilhando • '+(people.length-online)+' sem GPS ao vivo';
  people.forEach(p=>{
   const row=element('article','','hype-loc-row'),info=element('div','','hype-loc-row-main'),actions=element('div','','hype-loc-row-actions');
   info.append(element('strong',p.promoter_name));
   let state=p.sharing?'📍 Compartilhando agora':p.last_seen?'Última atualização: '+new Date(p.last_seen).toLocaleString('pt-BR'):p.invite_issued?'Convite enviado • aguardando autorização':'Sem compartilhamento';
   info.append(element('small',p.role_name+' • '+state));
   const invite=element('button','🔗 GERAR CONVITE');invite.type='button';invite.addEventListener('click',()=>generate(p));
   const stop=element('button','⛔ REVOGAR','ghost');stop.type='button';stop.disabled=!p.invite_issued&&!p.sharing;stop.addEventListener('click',()=>revoke(p));
   if(p.collective){info.append(element('small','WhatsApp final '+p.phone_last4+' • identidade não verificada'));if(p.guests!=null)info.append(element('strong',p.guests+' convidados informados'));if(p.checkin_id)info.append(element('small','Check-in: '+new Date(p.checked_at).toLocaleTimeString('pt-BR')+' • '+(p.sharing?'GPS ativo':'Sem GPS ativo')));if(p.sharing&&p.session_id)actions.append(stop)}else actions.append(invite,stop);row.append(info,actions);list.append(row);
  });
  showMap();
 }
 async function refresh(){
  if(!panel()?.classList.contains('v95-show')||busy)return;
  const a=credentials();if(!a)return status('Faça login como administrador da Hype.',true);
  busy=true;try{const r=await rpc('hype_promoter_location_admin_list_v1',a);const sessions=await rpc('hype_collective_admin_list_v2',a);const checks=await rpc('hype_team_checkin_admin_v4',a);const rows=Array.isArray(checks)?checks:[];const ids=new Set(rows.map(s=>s.session_id).filter(Boolean));people=[...(Array.isArray(r)?r:[]),...rows.map(s=>({...s,collective:true,role_name:'Check-in • identidade autodeclarada'})),...(Array.isArray(sessions)?sessions.filter(s=>!ids.has(s.session_id)).map(s=>({...s,collective:true,sharing:true,role_name:'Link coletivo • identidade autodeclarada'})):[])];render();status('Atualizado às '+new Date().toLocaleTimeString('pt-BR')+'. Só posições autorizadas e recentes são exibidas.')}catch(e){status('Erro: '+e.message,true)}finally{busy=false}
 }

 async function refreshRequests(){
  const box=$('hypeLocCollectiveRequests');if(!box)return;
  const a=credentials();if(!a)return;
  try{
   const data=await rpc('hype_location_request_admin_list_v1',a);const rows=Array.isArray(data)?data:[];const pending=rows.filter(r=>r.state==='pending');
   const list=$('hypeLocRequestList');list.replaceChildren();
   $('hypeLocRequestCount').textContent=pending.length+' pendentes';
   if(!pending.length){list.append(element('p','Nenhuma solicitação pendente.'));return}
   for(const r of pending){
    const row=element('article','','hype-loc-row'),info=element('div','','hype-loc-row-main'),actions=element('div','','hype-loc-row-actions');
    info.append(element('strong',r.name),element('small','Final WhatsApp: '+r.phone_last4+' • Código: '+r.request_id.slice(0,8).toUpperCase()));
    const select=document.createElement('select');select.setAttribute('aria-label','Vincular promoter cadastrado');select.style.cssText='max-width:100%;padding:10px;background:#222;color:white;border:1px solid #555;border-radius:8px';
    const placeholder=element('option','Selecione o promoter identificado');placeholder.value='';select.append(placeholder);
    for(const p of people.filter(p=>!p.collective)){const opt=element('option',p.promoter_name+' — '+p.role_name);opt.value=String(p.promoter_id);select.append(opt)}
    const approve=element('button','APROVAR');approve.type='button';approve.disabled=true;select.onchange=()=>{approve.disabled=!select.value};
    approve.onclick=async()=>{if(!select.value||!confirm('Confirme pessoalmente ou pelo WhatsApp conhecido a identidade e o código da solicitação. Aprovar o convite para este promoter? Um convite anterior será revogado. Nenhum GPS será ativado automaticamente.'))return;approve.disabled=true;try{await rpc('hype_location_request_admin_decide_v1',{...a,p_request_id:r.request_id,p_promoter_id:Number(select.value),p_approve:true});status('Solicitação aprovada. A pessoa pode retornar ao link coletivo e decidir se deseja compartilhar.');await refreshRequests()}catch(e){status(e.message,true);approve.disabled=false}};
    const reject=element('button','RECUSAR','ghost');reject.type='button';reject.onclick=async()=>{if(!confirm('Recusar esta solicitação?'))return;reject.disabled=true;try{await rpc('hype_location_request_admin_decide_v1',{...a,p_request_id:r.request_id,p_promoter_id:null,p_approve:false});await refreshRequests()}catch(e){status(e.message,true);reject.disabled=false}};
    actions.append(approve,reject);info.append(select);row.append(info,actions);list.append(row)
   }
  }catch(e){status('Solicitações: '+e.message,true)}
 }
 function initCollective(){
  const box=element('section','','hype-loc-row');box.id='hypeLocCollectiveRequests';box.style.display='block';
  box.append(element('h3','Link único da equipe'),element('p','Check-ins e convidados informados em tempo real. GPS somente com autorização. Nomes e quantidades autodeclarados.'));
  const link=document.createElement('a');link.href='https://hype-dj-awards.vercel.app/checkin-equipe.html';link.textContent=link.href;link.target='_blank';link.rel='noopener noreferrer';link.style.cssText='color:#a4f4c2;overflow-wrap:anywhere';box.append(link);const stats=element('h3','0 check-ins • 0 convidados informados');stats.id='hypeCheckinStats';box.append(stats);
  const actions=element('div','','hype-loc-row-actions');actions.style.marginTop='10px';const copy=element('button','COPIAR LINK ÚNICO');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(link.href);status('Link coletivo copiado.')}catch(e){status('Copie o endereço acima.')}};const reload=element('button','ATUALIZAR MAPA');reload.type='button';reload.onclick=refresh;actions.append(copy,reload);box.append(actions);
  const old=element('details','');old.append(element('summary','Solicitações antigas (opcional)'));const count=element('h4','Solicitações anteriores');count.id='hypeLocRequestCount';old.append(count);const list=element('div','');list.id='hypeLocRequestList';old.append(list);old.addEventListener('toggle',()=>{if(old.open)refreshRequests()});box.append(old);
  $('hypeLocPromotersList').before(box)
 }
 function init(){
  if(!panel())return;
  initCollective();
  $('hypeLocRefresh').addEventListener('click',refresh);
  $('hypeLocCopyInvite').addEventListener('click',async()=>{
   const input=$('hypeLocInviteUrl');try{await navigator.clipboard.writeText(input.value);status('Convite copiado. Envie no privado.')}catch(e){input.focus();input.select();status('Convite selecionado: copie no celular.')}
  });
  setInterval(()=>{if(panel().classList.contains('v95-show')&&!document.hidden)refresh()},15000);
 }
 window.HypePromoterLocationsV1={refresh};
 document.addEventListener('DOMContentLoaded',init);
})();