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

  function brl(value) {
    return Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }

  // Painel Financeiro: bruto = price do Supabase (a taxa cobrada do cliente
  // ja esta incluida). Taxas do Asaas sao estimativas do extrato observado:
  // R$ 0,99 por PIX + R$ 0,99 por mensageria, por pagamento Asaas.
  // Nunca abater a taxa cobrada no site uma segunda vez.
  function financeTotalsHypeV106(paid) {
    const cents = v => Math.round((Number(v) || 0) * 100);
    const grossCents = paid.reduce((sum,t) => sum + cents(t.price),0);
    const serviceCents = paid.reduce((sum,t) => {
      if (t.original_price != null && Number.isFinite(Number(t.original_price))) {
        return sum + Math.max(0,cents(t.price) - cents(t.original_price) + cents(t.discount_amount));
      }
      return sum + Math.max(0,cents(t.service_fee));
    },0);
    const asaasCount = paid.filter(t =>
      /asaas/i.test(String(t.payment_method || '')) || Boolean(t.asaas_payment_id)
    ).length;
    const pixCents = asaasCount * 99;
    const messagesCents = asaasCount * 99;
    return {
      gross: grossCents/100,
      service: serviceCents/100,
      pix: pixCents/100,
      messages: messagesCents/100,
      netEstimated: (grossCents-pixCents-messagesCents)/100
    };
  }

  // Leitura exclusivamente administrativa de movimentações bancárias já realizadas.
  // Não reduz faturamento por evento nem altera tabelas de ingressos.
  async function refreshFinancialWithdrawalsV210() {
    const panel=$('v210FinanceLedger');
    if(!panel)return;
    if(HYPE?.role!=='admin' || !HYPE?.user || !HYPE?.pass) {
      panel.hidden=true;
      return;
    }
    panel.hidden=false;
    const notice=$('v210FinancialStatus');
    if(notice)notice.textContent='Consultando retiradas registradas...';
    try {
      const rows=await sbRpc('staff_list_hype_finance_movements_v210', {
        p_username:HYPE.user,p_password:HYPE.pass
      });
      if(!Array.isArray(rows))throw new Error('Resposta inválida do controle financeiro.');
      const cents=v=>Math.round((Number(v)||0)*100);
      const total=rows.reduce((sum,r)=>sum+(r.movement_type==='estorno_retirada'?-cents(r.amount):cents(r.amount)),0);
      const totalEl=$('v210FinanceWithdrawalTotal');
      if(totalEl)totalEl.textContent=brl(total/100);
      const entries=$('v210FinanceEntries');
      if(entries)entries.innerHTML=rows.map(r=>{
        const withdrawal=r.movement_type==='retirada';
        const date=r.occurred_at?new Date(r.occurred_at).toLocaleString('pt-BR',{
          timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
        }):'Data não informada';
        return '<div class="v210-finance-entry"><div><b>'+
          (withdrawal?'Retirada do banco':'Estorno de retirada')+
          '</b><small>'+esc(date)+' • '+esc(r.description||'Movimentação registrada')+
          '</small></div><strong>'+(withdrawal?'−':'+')+esc(brl(r.amount))+'</strong></div>';
      }).join('')||'<p>Nenhuma retirada registrada.</p>';
      if(notice)notice.textContent=rows.length+' movimentação(ões) registrada(s), preservadas no histórico.';
    } catch(err) {
      if(notice)notice.textContent='Não foi possível consultar as retiradas: '+String(err?.message||err);
      const entries=$('v210FinanceEntries');
      if(entries)entries.textContent='';
    }
  }

  function getSalesRows() {
    let tickets=[], guests=[];
    try {
      tickets=[...(HYPE?.tickets || [])];
      guests=[...(HYPE?.guestLists || [])];
    } catch (_) {}
    return {tickets,guests};
  }

  function fillSalesEventSelect() {
    const select=$('v94SalesEvent');
    if (!select) return;
    let events=[];
    try {
      const map=new Map();
      [...(HYPE?.adminEvents || []),...(HYPE?.events || [])].forEach(e=>{
        if(e?.id!=null) map.set(Number(e.id),e);
      });
      events=[...map.values()].sort((a,b)=>String(a.event_date||'').localeCompare(String(b.event_date||'')));
    } catch (_) {}
    const showHistory=Boolean(HYPE?.showFinanceHistoryV202);
    const operational=window.HypeVisibleOperationalEventsV202?.(events) || events.filter(e=>e.active!==false);
    const shown=showHistory?events:operational;
    const firstLoad=select.dataset.hypeFinanceInitializedV170 !== '1';
    const firstId=operational[0]?.id || shown[0]?.id || 0;
    const current=firstLoad?String(firstId):(select.value || String(firstId));
    select.dataset.hypeFinanceInitializedV170='1';
    select.innerHTML=(showHistory?'<option value="all">TODOS OS EVENTOS (HISTÓRICO)</option>':'')+
      shown.map(e=>`<option value="${Number(e.id)}">${esc(e.event_date || '')} • ${esc(e.name || 'Evento HYPE')}</option>`).join('');
    if(!shown.length)select.innerHTML='<option value="">Nenhuma festa atual</option>';
    select.value=[...select.options].some(o=>o.value===current)?current:String(firstId||'');
    if(select.value==='' && select.options.length)select.selectedIndex=0;
    const button=$('hypeFinanceHistoryToggleV202');
    if(button)button.textContent=showHistory?'OCULTAR HISTÓRICO FINANCEIRO':'VER HISTÓRICO FINANCEIRO';
  }

  async function toggleFinanceHistory() {
    const button=$('hypeFinanceHistoryToggleV202');
    const previous=Boolean(HYPE.showFinanceHistoryV202);
    const currentSelection=$('v94SalesEvent')?.value || '';
    if(button)button.disabled=true;
    HYPE.showFinanceHistoryV202=!previous;
    HYPE.showClientHistoryV171=!previous;
    try {
      if(typeof loadStaffTickets==='function')await loadStaffTickets('');
      // Continuar na festa selecionada, exceto quando o usuário optar por TODOS.
      renderSales();
      if(previous===false && currentSelection==='all')$('v94SalesEvent').value='all';
      if(typeof renderClientsTable==='function')renderClientsTable();
      if(typeof renderV16Dashboard==='function')renderV16Dashboard();
    } catch(err) {
      HYPE.showFinanceHistoryV202=previous;
      HYPE.showClientHistoryV171=previous;
      renderSales();
      alert(err?.message || 'Não foi possível consultar o histórico financeiro.');
    } finally {
      if(button)button.disabled=false;
    }
  }

  function renderSales() {
    fillSalesEventSelect();
    const filter=$('v94SalesEvent')?.value || 'all';
    const {tickets,guests}=getSalesRows();
    const scopedTickets=tickets.filter(t=>filter==='all'||Number(t.event_id)===Number(filter));
    const scopedGuests=guests.filter(g=>filter==='all'||Number(g.event_id)===Number(filter));

    const confirmed=scopedTickets.filter(t=>String(t.payment_status||'')==='Pago');
    const paid=confirmed.filter(t=>Number(t.price||0)>0);
    const free=confirmed.filter(t=>Number(t.price||0)<=0);
    const pending=scopedTickets.filter(t=>String(t.payment_status||'')==='Pendente');

    const totals=financeTotalsHypeV106(paid);
    const revenue=totals.gross;
    const pendingValue=pending.reduce((s,t)=>s+Number(t.price||0),0);
    const avg=paid.length?revenue/paid.length:0;

    const set=(id,val)=>{const el=$(id);if(el)el.textContent=val;};
    set('v94Revenue',brl(revenue));
    set('v106ServiceFee',brl(totals.service));
    set('v106AsaasPixFee',brl(totals.pix));
    set('v106AsaasMessagesFee',brl(totals.messages));
    set('v106NetEstimated',brl(totals.netEstimated));
    set('v94PendingValue',brl(pendingValue));
    set('v94AverageTicket',brl(avg));
    set('v94PaidCount',String(paid.length));
    set('v94FreeCount',String(free.length));
    set('v94ListCount',String(scopedGuests.length));
    set('v94PeopleCount',String(paid.length+free.length+scopedGuests.length));

    const byEvent=$('v94SalesByEvent');
    if(!byEvent)return;
    const eventIds=new Set([...scopedTickets.map(t=>Number(t.event_id)),...scopedGuests.map(g=>Number(g.event_id))].filter(Boolean));
    const rows=[...eventIds].map(id=>{
      const et=scopedTickets.filter(t=>Number(t.event_id)===id);
      const eg=scopedGuests.filter(g=>Number(g.event_id)===id);
      const ep=et.filter(t=>String(t.payment_status||'')==='Pago'&&Number(t.price||0)>0);
      const ef=et.filter(t=>String(t.payment_status||'')==='Pago'&&Number(t.price||0)<=0);
      const rev=ep.reduce((s,t)=>s+Number(t.price||0),0);
      return {id,name:eventName(id),paid:ep.length,free:ef.length,list:eg.length,revenue:rev,netEstimated:financeTotalsHypeV106(ep).netEstimated};
    }).sort((a,b)=>b.revenue-a.revenue);

    byEvent.innerHTML=rows.length?rows.map(r=>`
      <div class="v94-sales-event-row">
        <div><strong>${esc(r.name)}</strong><small>${r.paid+r.free+r.list} pessoa(s) contabilizada(s)</small></div>
        <b>Pago ${r.paid}</b>
        <b>FREE ${r.free} • Lista ${r.list}</b>
        <b>Bruto: ${esc(brl(r.revenue))}<small>Líquido est.: ${esc(brl(r.netEstimated))}</small></b>
      </div>`).join(''):'<div class="v92-empty">Nenhuma venda registrada neste filtro.</div>';
    // Os cards de cima seguem o mesmo filtro do fechamento detalhado.
    if(typeof renderClientsTable==='function') renderClientsTable();
  }

  async function refreshSales(forceFetch=true) {
    try {
      if(forceFetch && typeof loadStaffTickets==='function' && typeof HYPE!=='undefined' && HYPE.user && HYPE.pass) {
        await loadStaffTickets('');
      }
    } catch (_) {}
    renderSales();
    await refreshFinancialWithdrawalsV210();
    try { if(typeof renderV16Dashboard==='function') renderV16Dashboard(); } catch (_) {}
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
      if (currentTab === 'vendas') renderSales();
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

  window.HypeAdminTabsV92={setTab,refreshPeople,renderPortariaPeople,renderListPeople,refreshSales,renderSales,toggleFinanceHistory};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(init,450));
})();