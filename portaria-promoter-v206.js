(()=>{
'use strict';
const $=id=>document.getElementById(id);
const cfg=window.HYPE_SUPABASE_CONFIG||{};
const sb=window.supabase?.createClient(cfg.url,cfg.anonKey);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function key(){try{return localStorage.getItem('hype_portaria_device_key_v18')||'';}catch(_){return '';}}
async function load(){
 const pane=$('v206DoorBody');if(!pane||pane.hidden)return;
 const eventId=Number($('eventSelect')?.value||0);
 const summary=$('v206DoorSummary'),out=$('v206DoorGuests');
 if(!eventId||!key()){summary.textContent='Selecione a festa e autorize a Portaria neste aparelho.';return;}
 summary.textContent='Buscando os convidados aprovados...';
 try{
  const {data,error}=await sb.rpc('portaria_promoter_guests_v206',{p_device_key:key(),p_event_id:eventId});
  if(error)throw error;
  const guests=Array.isArray(data)?data:(data?[data]:[]);
  const entered=guests.filter(g=>g.status==='Entrou').length;
  const waiting=guests.filter(g=>g.status==='Liberado').length;
  summary.textContent='✅ QR de convidados confirmados: '+entered+' • Aprovados sem check-in: '+waiting+' • Total: '+guests.length;
  out.innerHTML=guests.length?guests.map(g=>'<article style="padding:12px;margin:10px 0;border:1px solid #423a48;border-radius:12px;background:#0d0b11">'+
   '<strong>'+esc(g.name)+'</strong><div style="font-size:12px;color:#bbb4be">Promoter: '+esc(g.promoter_name||g.promoter_code)+'</div>'+
   '<div style="font-size:12px;color:'+(g.status==='Entrou'?'#9defb9':'#f5d69a')+'">'+
   (g.status==='Entrou'?'✅ CHECK-IN FEITO • '+new Date(g.entered_at).toLocaleString('pt-BR'):'⏳ APROVADO • NÃO ENTROU')+'</div></article>').join('')
   :'<div class="empty">Nenhum convidado aprovado nesta festa.</div>';
 }catch(err){summary.textContent='Falha: '+String(err.message||err);}
}
function init(){
 $('v206DoorToggle')?.addEventListener('click',()=>{
  const pane=$('v206DoorBody');pane.hidden=!pane.hidden;
  $('v206DoorToggle').textContent=pane.hidden?'VER CONVIDADOS ▾':'OCULTAR CONVIDADOS ▴';
  if(!pane.hidden)load();
 });
 $('v206DoorRefresh')?.addEventListener('click',load);
 $('eventSelect')?.addEventListener('change',()=>{if(!$('v206DoorBody')?.hidden)load();});
}
document.addEventListener('DOMContentLoaded',init);
window.HypeDoorPromoterV206={load};
})();