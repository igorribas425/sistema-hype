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
    geral: ['v16DashboardPanel','adminGeneralToolbar','eventsAdminPanel','v18ControlPanel','adminMainGrid'],
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

    if (tab === 'portaria') {
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

  window.HypeAdminTabsV92={setTab,refreshPeople,renderPortariaPeople,renderListPeople};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(init,450));
})();