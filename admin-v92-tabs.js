/* HYPE V92 — Admin organizado por abas
   Geral | Promoter | Portaria | Lista | Avaliação
   Mantém os dados existentes; apenas organiza a interface.
*/
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const norm = v => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');

  const groups = {
    geral: ['adminGeneralToolbar','eventsAdminPanel','v18ControlPanel','adminMainGrid'],
    vendas: ['v94SalesAccumPanel','v16DashboardPanel'],
    promoter: ['v16ManagementPanel'],
    portaria: ['v34LivePanel','v92PortariaPeoplePanel'],
    lista: ['v92ListPeoplePanel','v408SimpleListAdmin'],
    avaliacao: ['v92EvaluationPanel']
  };

  const allManaged = [...new Set(Object.values(groups).flat())];
  let currentTab = 'geral';
  let lastPeopleSignature = '';

  function currentEventId() {
    try {
      return Number(HYPE?.selectedEventId || $('v34EventSelect')?.value || 0);
    } catch (_) {
      return Number($('v34EventSelect')?.value || 0);
    }
  }

  function eventName(eventId) {
    try {
      const all = [...(HYPE?.adminEvents || []), ...(HYPE?.events || [])];
      const found = all.find(e => Number(e?.id) === Number(eventId));
      return found?.name || 'Evento HYPE';
    } catch (_) {
      return 'Evento HYPE';
    }
  }

  function formatTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  function uniquePeople(rows) {
    const map = new Map();
    rows.forEach(row => {
      const cpf = String(row.cpf || '').replace(/\D/g,'');
      const key = `${Number(row.event_id || 0)}:${cpf || norm(row.customer_name || row.name)}`;
      const old = map.get(key);
      if (!old) {
        map.set(key,row);
        return;
      }
      const oldAt = new Date(old.entry_at || old.entered_at || old.created_at || 0).getTime();
      const newAt = new Date(row.entry_at || row.entered_at || row.created_at || 0).getTime();
      if (newAt >= oldAt) map.set(key,row);
    });
    return [...map.values()];
  }

  function peopleSignature() {
    try {
      const tickets = (HYPE?.tickets || []).map(t => [t.id,t.event_id,t.entry_status,t.entry_at,t.customer_name,t.cpf]);
      const guests = (HYPE?.guestLists || []).map(g => [g.list_id,g.event_id,g.guest_status,g.entered_at,g.customer_name,g.cpf]);
      return JSON.stringify([tickets,guests,currentEventId()]);
    } catch (_) { return ''; }
  }

  function renderPortariaPeople() {
    const box = $('v92PortariaPeopleList');
    const count = $('v92PortariaPeopleCount');
    const label = $('v92PortariaEventLabel');
    if (!box) return;

    const eventId = currentEventId();
    if (label) label.textContent = eventId ? eventName(eventId) : 'Todos os eventos';

    let rows = [];
    try {
      const tickets = (HYPE?.tickets || [])
        .filter(t => String(t.entry_status || '') === 'Entrada utilizada')
        .map(t => ({...t, source_type:'Ingresso', entered_at:t.entry_at || t.paid_at || t.purchased_at}));

      const guests = (HYPE?.guestLists || [])
        .filter(g => String(g.guest_status || '') === 'Entrou')
        .map(g => ({...g, source_type:'Lista', entered_at:g.entered_at || g.created_at}));

      rows = uniquePeople([...tickets,...guests])
        .filter(r => !eventId || Number(r.event_id) === eventId)
        .sort((a,b) => new Date(b.entered_at || 0) - new Date(a.entered_at || 0));
    } catch (_) {}

    if (count) count.textContent = String(rows.length);
    if (!rows.length) {
      box.innerHTML = '<div class="v92-empty">Ainda não há entradas registradas neste evento.</div>';
      return;
    }

    box.innerHTML = rows.map(r => `
      <div class="v92-person-row">
        <div>
          <strong>${esc(r.customer_name || r.name || 'Sem nome')}</strong>
          <small>${esc(r.gender || 'N/I')} • ${esc(r.source_type)}${r.phone ? ` • 📱 ${esc(r.phone)}` : ''}</small>
        </div>
        <div class="v92-person-side">
          <span class="v92-pill entrou">ENTROU</span>
          <small>${esc(formatTime(r.entered_at))}</small>
        </div>
      </div>`).join('');
  }

  function renderListPeople() {
    const box = $('v92ListPeopleList');
    const count = $('v92ListPeopleCount');
    const label = $('v92ListEventLabel');
    if (!box) return;

    const eventId = currentEventId();
    if (label) label.textContent = eventId ? eventName(eventId) : 'Todos os eventos';

    let rows = [];
    try {
      rows = uniquePeople([...(HYPE?.guestLists || [])])
        .filter(r => !eventId || Number(r.event_id) === eventId)
        .sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } catch (_) {}

    if (count) count.textContent = String(rows.length);
    if (!rows.length) {
      box.innerHTML = '<div class="v92-empty">Nenhum nome aprovado na lista deste evento ainda.</div>';
      return;
    }

    box.innerHTML = rows.map(r => {
      const entered = String(r.guest_status || '') === 'Entrou';
      return `
        <div class="v92-person-row">
          <div>
            <strong>${esc(r.customer_name || r.name || 'Sem nome')}</strong>
            <small>${esc(r.gender || 'N/I')}${r.phone ? ` • 📱 ${esc(r.phone)}` : ''}${r.cpf ? ` • CPF ${esc(r.cpf)}` : ''}</small>
          </div>
          <div class="v92-person-side">
            <span class="v92-pill ${entered ? 'entrou' : 'lista'}">${entered ? 'ENTROU' : 'NA LISTA'}</span>
          </div>
        </div>`;
    }).join('');
  }

  function moneyV94(value) {
    try {
      if (typeof hypeFormatMoney === 'function') return hypeFormatMoney(Number(value || 0));
    } catch (_) {}
    return Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }

  function renderSalesV94() {
    const eventId = $('v16DashboardEvent')?.value || 'all';
    let tickets=[], guests=[];
    try {
      tickets=(HYPE?.tickets || []).filter(t => eventId==='all' || Number(t.event_id)===Number(eventId));
      guests=(HYPE?.guestLists || []).filter(g => eventId==='all' || Number(g.event_id)===Number(eventId));
    } catch (_) {}

    const confirmed=tickets.filter(t=>String(t.payment_status||'')==='Pago');
    const paid=confirmed.filter(t=>Number(t.price||0)>0);
    const free=confirmed.filter(t=>Number(t.price||0)<=0);
    const pending=tickets.filter(t=>String(t.payment_status||'')==='Pendente');
    const paidValue=paid.reduce((s,t)=>s+Number(t.price||0),0);
    const pendingValue=pending.reduce((s,t)=>s+Number(t.price||0),0);
    const discounts=paid.reduce((s,t)=>s+Number(t.discount_amount||0),0);
    const entered=confirmed.filter(t=>String(t.entry_status||'')==='Entrada utilizada').length +
      guests.filter(g=>String(g.guest_status||'')==='Entrou').length;

    const set=(id,v)=>{const el=$(id);if(el)el.textContent=String(v);};
    set('v94SalesPaidValue',moneyV94(paidValue));
    set('v94SalesPendingValue',moneyV94(pendingValue));
    set('v94SalesDiscountValue',moneyV94(discounts));
    set('v94SalesPaidCount',paid.length);
    set('v94SalesFreeCount',free.length);
    set('v94SalesListCount',guests.length);
    set('v94SalesPeopleCount',confirmed.length+guests.length);
    set('v94SalesEnteredCount',entered);

    const methods={};
    paid.forEach(t=>{
      const key=String(t.payment_method||'Pagamento').trim()||'Pagamento';
      if(!methods[key]) methods[key]={count:0,total:0};
      methods[key].count+=1;
      methods[key].total+=Number(t.price||0);
    });
    const promoter={};
    paid.filter(t=>t.promoter_code).forEach(t=>{
      const key=String(t.promoter_code||'').trim();
      if(!promoter[key]) promoter[key]={count:0,total:0};
      promoter[key].count+=1;
      promoter[key].total+=Number(t.price||0);
    });

    const box=$('v94SalesMethods');
    if(box){
      const methodText=Object.entries(methods).map(([k,v])=>`${esc(k)}: ${v.count} venda(s) • ${moneyV94(v.total)}`).join(' | ');
      const promoterText=Object.entries(promoter).sort((a,b)=>b[1].total-a[1].total).map(([k,v],i)=>`${i+1}º ${esc(k)}: ${v.count} • ${moneyV94(v.total)}`).join(' | ');
      box.innerHTML=`
        <div><b>Formas de pagamento</b><span>${methodText || 'Sem vendas pagas'}</span></div>
        <div><b>Promoters</b><span>${promoterText || 'Sem vendas pagas por promoter'}</span></div>
        <div><b>Resumo</b><span>Pago: ${paid.length} • FREE: ${free.length} • Lista: ${guests.length} • Pendentes: ${pending.length}</span></div>`;
    }
  }

  async function refreshSalesV94(forceFetch=false) {
    try {
      if(forceFetch && typeof loadStaffTickets==='function' && typeof HYPE!=='undefined' && HYPE.user && HYPE.pass){
        await loadStaffTickets($('searchInput')?.value || '');
      }
      if(typeof renderV16Dashboard==='function') renderV16Dashboard();
    } catch (_) {}
    renderSalesV94();
  }

  async function refreshPeople(forceFetch=false) {
    try {
      if (forceFetch && typeof loadStaffTickets === 'function' && typeof HYPE !== 'undefined' && HYPE.user && HYPE.pass) {
        await loadStaffTickets($('searchInput')?.value || '');
      }
    } catch (_) {}
    renderPortariaPeople();
    renderListPeople();
    lastPeopleSignature = peopleSignature();
  }

  function setTab(tab='geral') {
    if (!groups[tab]) tab='geral';
    currentTab=tab;

    allManaged.forEach(id => {
      const el=$(id);
      if (!el) return;
      el.classList.toggle('v92-tab-hidden', !groups[tab].includes(id));
    });

    document.querySelectorAll('[data-v92-tab]').forEach(btn => {
      const active = btn.dataset.v92Tab === tab;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',active?'true':'false');
    });

    try { sessionStorage.setItem('hype_admin_tab_v92',tab); } catch (_) {}

    if (tab === 'vendas') {
      refreshSalesV94(true);
    } else if (tab === 'portaria') {
      refreshPeople(true);
      try { window.HypeV34?.refreshLive?.(); } catch (_) {}
    } else if (tab === 'lista') {
      refreshPeople(true);
      try { window.HypeV49Registration?.loadListSettings?.(); } catch (_) {}
    } else if (tab === 'avaliacao') {
      try { window.HypeV34?.refreshLive?.(); } catch (_) {}
    } else if (tab === 'promoter') {
      try { if (typeof loadV16AdminData === 'function') loadV16AdminData().then(()=>window.renderV16Dashboard?.()).catch(()=>{}); } catch (_) {}
    }

    window.scrollTo({top: 0,behavior:'smooth'});
  }

  function tick() {
    const sig=peopleSignature();
    if (sig && sig !== lastPeopleSignature) {
      lastPeopleSignature=sig;
      if (currentTab === 'portaria') renderPortariaPeople();
      if (currentTab === 'lista') renderListPeople();
      if (currentTab === 'vendas') renderSalesV94();
    }
  }

  function init() {
    if (!document.querySelector('[data-v92-tab]')) return;
    document.querySelectorAll('[data-v92-tab]').forEach(btn => {
      btn.addEventListener('click',()=>setTab(btn.dataset.v92Tab));
    });

    let saved='geral';
    try { saved=sessionStorage.getItem('hype_admin_tab_v92') || 'geral'; } catch (_) {}
    setTab(groups[saved] ? saved : 'geral');
    refreshPeople(false);
    setInterval(tick,1800);
  }

  document.addEventListener('change',(event)=>{
    if(event.target?.id==='v16DashboardEvent') setTimeout(renderSalesV94,0);
  });

  window.HypeAdminTabsV92={setTab,refreshPeople,renderPortariaPeople,renderListPeople,refreshSales:refreshSalesV94,renderSales:renderSalesV94};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(init,450));
})();