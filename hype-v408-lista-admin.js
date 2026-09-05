/* HYPE V40.8 — Lista simples somente pelo Admin
   Admin adiciona nomes. Portaria apenas busca e confirma entrada.
*/
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const arr = (d) => Array.isArray(d) ? d : (d ? [d] : []);

  function ready(){
    try { return typeof HYPE !== 'undefined' && HYPE && HYPE.user && HYPE.pass; }
    catch(e){ return false; }
  }
  function auth(params={}){ return Object.assign({p_username:HYPE.user,p_password:HYPE.pass}, params); }
  function out(html){ const el=$('v408ListAdminResult'); if(el) el.innerHTML=html; }
  function fmt(v){ if(!v) return ''; const d=new Date(v); return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR'); }
  function currentEvent(){ return Number($('v408ListEvent')?.value || (typeof HYPE!=='undefined' ? HYPE.selectedEventId : 0) || 0); }

  async function rpc(name,params){
    if(typeof sbRpc !== 'function') throw new Error('Supabase não carregou no Admin.');
    const data = await sbRpc(name,params);
    return data;
  }

  async function loadEvents(){
    const sel=$('v408ListEvent'); if(!sel || !ready()) return;
    try{
      let events=[];
      try { events=arr(await rpc('staff_list_raffle_events_v23',auth())); }
      catch(e){ events=arr(await rpc('staff_list_events_v13',auth())); }
      if(!events.length){ sel.innerHTML='<option value="">Nenhum evento encontrado</option>'; return; }
      const selected=Number((typeof HYPE!=='undefined' ? HYPE.selectedEventId : 0) || events[0].id);
      sel.innerHTML=events.map(ev=>`<option value="${Number(ev.id)}" ${Number(ev.id)===selected?'selected':''}>${esc(ev.name||'Evento')} ${ev.event_date?`- ${esc(ev.event_date)}`:''}</option>`).join('');
      await load();
    }catch(err){ out(`<div class="v18-empty error">${esc(err.message || 'Erro ao carregar eventos da lista.')}</div>`); }
  }

  async function add(){
    if(!ready()) return alert('Entre no Admin primeiro.');
    const eventId=currentEvent();
    if(!eventId) return alert('Selecione o evento.');
    const raw=($('v408ListNames')?.value || '').trim();
    if(!raw) return alert('Digite pelo menos um nome.');
    const names=[...new Set(raw.split(/\n+/).map(x=>x.trim().replace(/\s+/g,' ')).filter(x=>x.length>=2))];
    if(!names.length) return alert('Digite nomes válidos.');
    const btn=document.querySelector('#v408SimpleListAdmin .btn');
    const old=btn?.textContent;
    if(btn){ btn.disabled=true; btn.textContent='SALVANDO...'; }
    out('<div class="v18-empty">Adicionando nomes na lista...</div>');
    let ok=0, fail=[];
    for(const name of names){
      try{ await rpc('staff_guest_simple_add_v408',auth({p_event_id:eventId,p_name:name})); ok++; }
      catch(err){ fail.push(`${name}: ${err.message || 'erro'}`); }
    }
    if($('v408ListNames')) $('v408ListNames').value='';
    if(btn){ btn.disabled=false; btn.textContent=old || '+ ADICIONAR NA LISTA'; }
    await load();
    const msg=`✅ ${ok} nome(s) adicionado(s) na lista pelo Admin.` + (fail.length?`<br><br>⚠️ Não adicionou:<br>${fail.map(esc).join('<br>')}`:'');
    out(`<div class="v18-empty ${fail.length?'error':''}">${msg}</div>` + ($('v408ListAdminResult')?.innerHTML || ''));
  }

  async function load(){
    if(!ready()) return;
    const eventId=currentEvent();
    if(!eventId) return out('<div class="v18-empty">Selecione o evento.</div>');
    out('<div class="v18-empty">Carregando lista...</div>');
    try{
      const rows=arr(await rpc('staff_guest_simple_list_v406',auth({p_event_id:eventId})));
      if(!rows.length) return out('<div class="v18-empty">Nenhum nome na lista deste evento.</div>');
      out(`<div class="v18-participants-head">${rows.length} nome(s) na lista</div>` + rows.map(r=>{
        const entered=String(r.status||'')==='Entrou';
        return `<div class="v408-admin-list-row"><div><b>${esc(r.name||'Nome')}</b><span>${esc(r.status||'Liberado')} ${r.entered_at?`• entrou ${esc(fmt(r.entered_at))}`:''} ${r.created_at?`• adicionado ${esc(fmt(r.created_at))}`:''}</span></div><span class="v408-pill ${entered?'bad':'ok'}">${entered?'JÁ ENTROU':'LIBERADO'}</span></div>`;
      }).join(''));
    }catch(err){ out(`<div class="v18-empty error">${esc(err.message || 'Erro ao carregar a lista.')}</div>`); }
  }

  window.HypeListaAdmin={loadEvents,add,load};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(loadEvents,1200));
})();
