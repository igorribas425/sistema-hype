/* HYPE V43 — Atualização automática Admin/Portaria + Checkup Geral
   - Admin atualiza vendas, lista, sorteio e checkup sem F5.
   - Portaria atualiza venda rápida/preços/FREE sem F5.
   - Não altera regras de PIX, lista, ingresso ou sorteio.
*/
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const arr = (d) => Array.isArray(d) ? d : (d ? [d] : []);
  const nowTime = () => new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

  const state = {
    adminBusy:false,
    listBusy:false,
    raffleBusy:false,
    portariaBusy:false,
    checkBusy:false,
    adminTimer:null,
    portariaTimer:null,
    checkTimer:null,
    lastListAt:0,
    lastRaffleAt:0,
    lastOrdersAt:0,
    lastPortariaAt:0
  };

  function adminReady(){
    try { return typeof HYPE !== 'undefined' && HYPE && HYPE.user && HYPE.pass && ['admin','gerente','caixa'].includes(String(HYPE.role||'').toLowerCase()); }
    catch(e){ return false; }
  }
  function adminCanCheck(){
    try { return typeof HYPE !== 'undefined' && HYPE && HYPE.user && HYPE.pass && ['admin','gerente'].includes(String(HYPE.role||'').toLowerCase()); }
    catch(e){ return false; }
  }
  function pageVisible(){ return document.visibilityState !== 'hidden'; }
  function editingHeavyForm(){
    const a=document.activeElement;
    if(!a || !a.tagName) return false;
    const tag=String(a.tagName).toUpperCase();
    if(!['INPUT','TEXTAREA','SELECT'].includes(tag)) return false;
    // Deixa busca e chat atualizarem normalmente.
    if(['searchInput','hypeChatInput'].includes(a.id)) return false;
    // Não mexe enquanto o Admin está digitando nome/preço/evento/cupom/lista.
    return true;
  }
  async function safeCall(label, fn){
    try { if(typeof fn==='function') return await fn(); }
    catch(err){ console.warn('[HYPE V43]', label, err); }
  }
  function setText(id, text, cls=''){
    const el=$(id); if(!el) return;
    el.textContent=text;
    if(cls) el.className=cls;
  }

  function injectAdminUI(){
    const orders=$('adminOrdersStatus');
    if(orders && !$('v43LiveOrdersStatus')){
      const el=document.createElement('div');
      el.id='v43LiveOrdersStatus';
      el.className='admin-sync-status ok';
      el.style.marginTop='6px';
      el.textContent='🔄 Admin ao vivo: aguardando sincronização...';
      orders.parentNode?.appendChild(el);
    }

    const listResult=$('v408ListAdminResult');
    if(listResult && !$('v43LiveListStatus')){
      const el=document.createElement('div');
      el.id='v43LiveListStatus';
      el.className='v18-empty';
      el.style.padding='8px 10px';
      el.style.marginTop='8px';
      el.textContent='🔄 Lista ao vivo: atualiza sozinha quando salvar nome.';
      listResult.parentNode?.insertBefore(el, listResult);
    }

    const after=$('v408SimpleListAdmin') || $('v18ControlPanel');
    if(after && !$('v43CheckupPanel')){
      const section=document.createElement('section');
      section.className='panel-box admin-only';
      section.id='v43CheckupPanel';
      section.innerHTML=`
        <div class="v16-management-head">
          <div>
            <h3>🧪 CHECKUP GERAL DO SISTEMA</h3>
            <p>Confere FREE por horário, vendas/ingressos, lista simples, sorteio e Portaria sem apagar nada.</p>
          </div>
        </div>
        <div class="v408-list-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">
          <button class="btn-action" type="button" onclick="HypeV43.runCheckup(true)">🧪 RODAR CHECKUP</button>
          <button class="btn-action" type="button" onclick="HypeV43.syncAdmin(true)">↻ ATUALIZAR TUDO AGORA</button>
        </div>
        <div id="v43CheckupResult" class="v18-empty">Entre no Admin e clique em Rodar Checkup.</div>`;
      after.insertAdjacentElement('afterend',section);
    }
  }

  function selectedEventId(){
    return Number($('v18RaffleEvent')?.value || $('v408ListEvent')?.value || (typeof HYPE!=='undefined'?HYPE.selectedEventId:0) || 0);
  }

  async function runCheckup(showToast=false){
    injectAdminUI();
    if(!adminCanCheck()) return setText('v43CheckupResult','Entre no Admin para rodar o checkup.','v18-empty');
    if(state.checkBusy) return;
    const eventId=selectedEventId();
    if(!eventId) return setText('v43CheckupResult','Selecione um evento para o checkup.','v18-empty error');
    state.checkBusy=true;
    const box=$('v43CheckupResult');
    if(box) box.innerHTML='<div class="v18-empty">Rodando checkup...</div>';
    try{
      let data=[];
      try{ data=arr(await sbRpc('staff_system_checkup_v43',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:eventId})); }
      catch(e){ data=arr(await sbRpc('staff_system_checkup_v429',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:eventId})); }
      if(!data.length) throw new Error('Checkup não retornou dados.');
      if(box){
        box.innerHTML=`<div class="v18-participants-head">Checkup atualizado ${nowTime()}</div>` + data.map(r=>{
          const ok=String(r.status||'').toUpperCase()==='OK';
          return `<div class="v408-admin-list-row"><div><b>${esc(r.area||'Sistema')}</b><span>${esc(r.detail||'')}</span></div><span class="v408-pill ${ok?'ok':'bad'}">${esc(r.status||'OK')}</span></div>`;
        }).join('');
      }
      if(showToast && typeof hypeNotify==='function') hypeNotify('Checkup geral atualizado.');
    }catch(err){
      if(box) box.innerHTML=`<div class="v18-empty error">${esc(err.message||'Erro no checkup. Rode o Supabase V43.')}</div>`;
    }finally{state.checkBusy=false;}
  }

  async function syncAdmin(force=false){
    injectAdminUI();
    if(!pageVisible() || !adminReady()) return;
    const now=Date.now();
    if(!force && now-state.lastOrdersAt<4500) return;
    if(editingHeavyForm() && !force) return;
    if(state.adminBusy) return;
    state.adminBusy=true;
    state.lastOrdersAt=now;
    try{
      await safeCall('refreshAdminOrders',()=> typeof refreshAdminOrders==='function' ? refreshAdminOrders(false) : null);
      await safeCall('renderV16Dashboard',()=> typeof renderV16Dashboard==='function' ? renderV16Dashboard() : null);
      setText('v43LiveOrdersStatus',`🔄 Admin ao vivo: vendas/ingressos atualizados ${nowTime()}`,'admin-sync-status ok');
    }finally{state.adminBusy=false;}

    if(now-state.lastListAt>5500){
      state.lastListAt=now;
      if(!state.listBusy && window.HypeListaAdmin?.load && $('v408ListEvent')?.value){
        state.listBusy=true;
        await safeCall('HypeListaAdmin.load',()=>window.HypeListaAdmin.load());
        setText('v43LiveListStatus',`🔄 Lista ao vivo: atualizada ${nowTime()}`,'v18-empty');
        state.listBusy=false;
      } else if(window.HypeListaAdmin?.loadEvents && !$('v408ListEvent')?.options?.length){
        await safeCall('HypeListaAdmin.loadEvents',()=>window.HypeListaAdmin.loadEvents());
      }
    }

    if(now-state.lastRaffleAt>6000){
      state.lastRaffleAt=now;
      if(!state.raffleBusy){
        state.raffleBusy=true;
        await safeCall('loadRaffleV18',()=> typeof loadRaffleV18==='function' ? loadRaffleV18(false) : null);
        const p=$('v18RaffleParticipants');
        if(p && p.dataset.open==='1') await safeCall('loadRaffleParticipantsV18',()=> typeof loadRaffleParticipantsV18==='function' ? loadRaffleParticipantsV18(true) : null);
        state.raffleBusy=false;
      }
    }
  }

  async function syncPortaria(force=false){
    if(!pageVisible()) return;
    const now=Date.now();
    if(!force && now-state.lastPortariaAt<5000) return;
    if(state.portariaBusy) return;
    state.portariaBusy=true;
    state.lastPortariaAt=now;
    try{
      await safeCall('HypeV20.loadSalesContext',()=>window.HypeV20?.loadSalesContext?.());
      // O painel principal da Portaria já atualiza sozinho no V18, mas este reforço mantém a tela viva.
      await safeCall('HypePortaria.refresh',()=>window.HypePortaria?.refresh?.(false));
      const n=$('v19DoorNotice');
      if(n && !window.HypeV20?.currentOrder) n.title=`V43 ao vivo: atualizado ${nowTime()}`;
    }finally{state.portariaBusy=false;}
  }

  function boot(){
    const isAdmin=Boolean($('adminPass'));
    const isPortaria=Boolean($('portariaApp'));
    if(isAdmin){
      injectAdminUI();
      clearInterval(state.adminTimer);
      state.adminTimer=setInterval(()=>syncAdmin(false),3500);
      clearInterval(state.checkTimer);
      state.checkTimer=setInterval(()=>{ if(pageVisible() && adminCanCheck() && $('v43CheckupPanel')) runCheckup(false); },30000);
      setTimeout(()=>syncAdmin(true),1200);
    }
    if(isPortaria){
      clearInterval(state.portariaTimer);
      state.portariaTimer=setInterval(()=>syncPortaria(false),4000);
      setTimeout(()=>syncPortaria(true),1800);
    }
  }

  window.HypeV43={syncAdmin,syncPortaria,runCheckup,injectAdminUI};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,700));
  window.addEventListener('focus',()=>{syncAdmin(true);syncPortaria(true);});
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden){syncAdmin(true);syncPortaria(true);} });
})();
