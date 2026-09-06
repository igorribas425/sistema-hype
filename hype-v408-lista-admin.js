/* HYPE V42.3 — Lista simples somente pelo Admin
   Salva nomes no Supabase, permite excluir pelo Admin e faz a lista entrar no sorteio.
*/
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const arr = (d) => Array.isArray(d) ? d : (d ? [d] : []);
  const BASE_DRAFT_KEY = 'hype_lista_admin_nomes_pendentes_v423';
  let booted = false;
  let bootTimer = null;

  function ready(){
    try { return typeof HYPE !== 'undefined' && HYPE && HYPE.user && HYPE.pass; }
    catch(e){ return false; }
  }
  function auth(params={}){ return Object.assign({p_username:HYPE.user,p_password:HYPE.pass}, params); }
  function out(html){ const el=$('v408ListAdminResult'); if(el) el.innerHTML=html; }
  function fmt(v){ if(!v) return ''; const d=new Date(v); return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR'); }
  function currentEvent(){ return Number($('v408ListEvent')?.value || (typeof HYPE!=='undefined' ? HYPE.selectedEventId : 0) || 0); }
  function draftKey(eventId=currentEvent()){ return `${BASE_DRAFT_KEY}_${eventId || 'geral'}`; }

  async function rpc(name,params){
    if(typeof sbRpc !== 'function') throw new Error('Supabase não carregou no Admin.');
    return await sbRpc(name,params);
  }

  function namesFromText(raw){
    return [...new Set(String(raw||'').split(/\n+/).map(x=>x.trim().replace(/\s+/g,' ')).filter(x=>x.length>=2))];
  }

  function saveDraft(){
    const ta=$('v408ListNames');
    if(!ta) return;
    const val=ta.value || '';
    try{
      localStorage.setItem(BASE_DRAFT_KEY,val);
      localStorage.setItem(draftKey(),val);
    }catch(e){}
  }

  function restoreDraft(){
    const ta=$('v408ListNames');
    if(!ta || ta.value.trim()) return;
    try{
      const val=localStorage.getItem(draftKey()) || localStorage.getItem(BASE_DRAFT_KEY) || '';
      if(val.trim()){
        ta.value=val;
        out('<div class="v18-empty">⚠️ Recuperei nomes que estavam digitados e ainda não tinham sido salvos. Aperte <b>+ ADICIONAR NA LISTA</b> para salvar no sistema.</div>');
      }
    }catch(e){}
  }

  async function loadEvents(){
    const sel=$('v408ListEvent');
    if(!sel || !ready()) return;
    try{
      let events=[];
      try { events=arr(await rpc('staff_list_raffle_events_v23',auth())); }
      catch(e){ events=arr(await rpc('staff_list_events_v13',auth())); }
      if(!events.length){ sel.innerHTML='<option value="">Nenhum evento encontrado</option>'; return; }
      const selected=Number((typeof HYPE!=='undefined' ? HYPE.selectedEventId : 0) || events[0].id);
      sel.innerHTML=events.map(ev=>`<option value="${Number(ev.id)}" ${Number(ev.id)===selected?'selected':''}>${esc(ev.name||'Evento')} ${ev.event_date?`- ${esc(ev.event_date)}`:''}</option>`).join('');
      restoreDraft();
      await load();
    }catch(err){ out(`<div class="v18-empty error">${esc(err.message || 'Erro ao carregar eventos da lista.')}</div>`); }
  }

  async function add(){
    if(!ready()) return alert('Entre no Admin primeiro.');
    const eventId=currentEvent();
    if(!eventId) return alert('Selecione o evento.');
    const ta=$('v408ListNames');
    const raw=(ta?.value || '').trim();
    if(!raw) return alert('Digite pelo menos um nome.');
    const names=namesFromText(raw);
    if(!names.length) return alert('Digite nomes válidos.');
    saveDraft();

    const btn=document.querySelector('#v408SimpleListAdmin .btn');
    const old=btn?.textContent;
    if(btn){ btn.disabled=true; btn.textContent='SALVANDO...'; }
    out('<div class="v18-empty">Salvando nomes no sistema...</div>');
    let ok=0, fail=[];
    for(const name of names){
      try{
        await rpc('staff_guest_simple_add_v408',auth({p_event_id:eventId,p_name:name}));
        ok++;
      }catch(err){
        fail.push({name,message:err.message || 'erro'});
      }
    }

    if(btn){ btn.disabled=false; btn.textContent=old || '+ ADICIONAR NA LISTA'; }
    if(fail.length){
      if(ta) ta.value=fail.map(f=>f.name).join('\n');
      saveDraft();
    }else{
      if(ta) ta.value='';
      try{ localStorage.removeItem(BASE_DRAFT_KEY); localStorage.removeItem(draftKey(eventId)); }catch(e){}
    }

    await load();
    try{ if(typeof loadRaffleV18==='function') await loadRaffleV18(false); }catch(e){}
    const failText=fail.length?`<br><br>⚠️ Não salvou estes nomes, deixei eles no campo para tentar de novo:<br>${fail.map(f=>`${esc(f.name)} — ${esc(f.message)}`).join('<br>')}`:'';
    const msg=`✅ ${ok} nome(s) salvo(s) na lista pelo Admin. Esses nomes já entram no sorteio deste evento.` + failText;
    out(`<div class="v18-empty ${fail.length?'error':''}">${msg}</div>` + ($('v408ListAdminResult')?.innerHTML || ''));
  }

  async function remove(listId, name){
    if(!ready()) return alert('Entre no Admin primeiro.');
    if(!listId) return;
    if(!confirm(`Excluir da lista?\n\n${name || 'Nome selecionado'}\n\nEle some da Portaria e não participa mais do sorteio.`)) return;
    try{
      await rpc('staff_guest_simple_delete_v423',auth({p_list_id:Number(listId)}));
      if(typeof hypeNotify==='function') hypeNotify('Nome excluído da lista.');
      await load();
      try{ if(typeof loadRaffleV18==='function') await loadRaffleV18(false); }catch(e){}
      try{ if(typeof loadRaffleParticipantsV18==='function') await loadRaffleParticipantsV18(true); }catch(e){}
    }catch(err){ alert(err.message || 'Erro ao excluir nome da lista.'); }
  }

  async function load(){
    if(!ready()) return;
    const eventId=currentEvent();
    if(!eventId) return out('<div class="v18-empty">Selecione o evento.</div>');
    out('<div class="v18-empty">Carregando lista salva...</div>');
    try{
      const rows=arr(await rpc('staff_guest_simple_list_v406',auth({p_event_id:eventId})));
      if(!rows.length) return out('<div class="v18-empty">Nenhum nome salvo na lista deste evento ainda.</div>');
      out(`<div class="v18-participants-head">${rows.length} nome(s) salvo(s) na lista • participa do sorteio</div>` + rows.map(r=>{
        const entered=String(r.status||'')==='Entrou';
        const safeName=esc(r.name||'Nome');
        return `<div class="v408-admin-list-row"><div><b>${safeName}</b><span>${esc(r.status||'Liberado')} ${r.entered_at?`• entrou ${esc(fmt(r.entered_at))}`:''} ${r.created_at?`• salvo ${esc(fmt(r.created_at))}`:''} ${r.added_by?`• por ${esc(r.added_by)}`:''}</span></div><div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><span class="v408-pill ${entered?'bad':'ok'}">${entered?'JÁ ENTROU':'SALVO / SORTEIO'}</span><button class="btn-action btn-del" type="button" onclick="HypeListaAdmin.remove(${Number(r.list_id)}, '${safeName.replace(/'/g,'&#039;')}')">EXCLUIR</button></div></div>`;
      }).join(''));
    }catch(err){ out(`<div class="v18-empty error">${esc(err.message || 'Erro ao carregar a lista.')}</div>`); }
  }

  function onEventChange(){ saveDraft(); restoreDraft(); load(); }

  function boot(){
    const panel=$('v408SimpleListAdmin');
    if(!panel) return;
    const ta=$('v408ListNames');
    if(ta && !ta.dataset.v423Draft){
      ta.dataset.v423Draft='1';
      ta.addEventListener('input',saveDraft);
    }
    const sel=$('v408ListEvent');
    if(sel && !sel.dataset.v423Event){
      sel.dataset.v423Event='1';
      sel.addEventListener('change',onEventChange);
    }
    if(!ready()){
      out('<div class="v18-empty">Entre no Admin para colocar nomes na lista.</div>');
      return;
    }
    if(!booted){
      booted=true;
      loadEvents();
    }
  }

  window.HypeListaAdmin={loadEvents,add,load,remove,onEventChange,saveDraft,restoreDraft};
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(boot,300);
    bootTimer=setInterval(()=>{
      boot();
      if(booted && ready()) clearInterval(bootTimer);
    },1000);
  });
})();
