/* HYPE LOUNGE CLUB // PORTARIA V33 (base V32)
   Computador autorizado por dispositivo + celular pareado somente como leitor.
   V29/V31: celular puxa o nome automaticamente no computador.
   V30: QR de outro evento é recusado e informa nome/data do evento correto.
   V32: evento automático considera horário e mantém a noite válida até 08:00 do dia seguinte.
   V33: mantém a lógica V32 e integra leitor iPhone/Android + envio do link por e-mail.
*/
(() => {
  'use strict';

  const DEVICE_KEY = 'hype_portaria_device_key_v18';
  const AUTH_CACHE_KEY = 'hype_portaria_auth_cache_v18';
  const SNAPSHOT_KEY = 'hype_portaria_snapshot_v18';
  const QUEUE_KEY = 'hype_portaria_queue_v18';
  const EVENT_KEY = 'hype_portaria_event_v18';
  const AUTH_OFFLINE_MS = 12 * 60 * 60 * 1000;

  const state = {
    sb: null,
    deviceKey: '',
    device: null,
    eventId: null,
    events: [],
    items: new Map(),
    statusTimer: null,
    scanTimer: null,
    refreshTimer: null,
    syncTimer: null,
    eventTimer: null,
    autoEventEnabled: true,
    autoEventMeta: null,
    cameraStream: null,
    cameraTimer: null,
    cameraBusy: false,
    cameraLastCode: '',
    cameraLastAt: 0,
    cameraDetector: null,
    cameraCanvas: null,
    cameraWanted: false,
    searchSeq: 0,
    pairToken: '',
    pairExpiresAt: null,
    lastRemoteScanAt: 0,
    remotePullBusy: false
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmtDate = value => {
    if (!value) return '';
    const d = new Date(String(value).length <= 10 ? `${value}T12:00:00` : value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
  };
  const fmtTime = value => {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  };
  const online = () => navigator.onLine !== false;

  function randomSecret(bytes = 32) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2,'0')).join('');
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (_) { return fallback; }
  }
  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function client() {
    if (state.sb) return state.sb;
    const cfg = window.HYPE_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');
    if (!window.supabase?.createClient) throw new Error('Biblioteca do Supabase não carregou.');
    state.sb = window.supabase.createClient(cfg.url, cfg.anonKey, {auth:{persistSession:false}});
    return state.sb;
  }

  async function rpc(name, params = {}) {
    const {data,error} = await client().rpc(name, params);
    if (error) throw new Error(error.message || `Erro em ${name}`);
    return data;
  }

  function normalizeRows(data) { return Array.isArray(data) ? data : (data ? [data] : []); }

  function setNetworkBadge() {
    const b = $('networkBadge');
    if (!b) return;
    b.textContent = online() ? 'ONLINE' : 'OFFLINE';
    b.className = `pill ${online() ? 'on' : 'off'}`;
    updateOfflineBadge();
  }

  function updateOfflineBadge() {
    const el = $('offlineBadge');
    if (!el) return;
    const snap = readJSON(SNAPSHOT_KEY,null);
    const queue = readJSON(QUEUE_KEY,[]);
    const valid = snap?.tickets && new Date(snap.expires_at || 0).getTime() > Date.now();
    if (valid) {
      el.textContent = `OFFLINE PRONTO • ${snap.tickets.length} • FILA ${queue.length}`;
      el.className = 'pill on';
    } else {
      el.textContent = queue.length ? `OFFLINE EXPIRADO • FILA ${queue.length}` : 'OFFLINE NÃO PREPARADO';
      el.className = 'pill';
    }
  }

  function setAuthMessage(message, isError = false) {
    const box = $('deviceAuthMessage');
    if (!box) return;
    box.innerHTML = message;
    box.className = `hint${isError ? ' error' : ''}`;
  }

  function offlineAuthAvailable() {
    const auth = readJSON(AUTH_CACHE_KEY,null);
    const snap = readJSON(SNAPSHOT_KEY,null);
    return Boolean(auth?.approved && auth.expires_at && new Date(auth.expires_at).getTime() > Date.now() && snap?.tickets);
  }

  async function ensureDevice() {
    state.deviceKey = localStorage.getItem(DEVICE_KEY) || '';
    if (!state.deviceKey) {
      state.deviceKey = randomSecret(32);
      localStorage.setItem(DEVICE_KEY,state.deviceKey);
    }

    if (!online()) {
      if (offlineAuthAvailable()) {
        const auth = readJSON(AUTH_CACHE_KEY,{});
        state.device = {active:true,label:auth.label || 'Computador fixo da Portaria (offline)'};
        return activateApp(true);
      }
      setAuthMessage('Sem internet. Conecte este computador à internet uma vez para preparar a Portaria. Depois você pode usar o modo offline.',true);
      return;
    }

    try {
      const list = normalizeRows(await rpc('portaria_device_request_v18', {
        p_device_key: state.deviceKey,
        p_label: 'Portaria Principal'
      }));
      const device = list[0];
      if (!device) throw new Error('Não foi possível preparar este computador.');
      state.device = device;
      if (device.active) return activateApp(false);

      // Não mostramos mais código. Se este navegador foi desconectado no Admin,
      // ele fica bloqueado até você reativá-lo na única área de dispositivos.
      setAuthMessage('🔒 Este computador está desconectado. No Admin, abra <b>Acesso de dispositivos</b> e toque em <b>REATIVAR</b>.',true);
      startAuthorizationPoll();
    } catch (err) {
      const msg = String(err?.message || err);
      console.warn('[HYPE V85][Portaria conexão]', err);
      if (/failed to fetch|networkerror|load failed|fetch/i.test(msg)) {
        setAuthMessage('Não foi possível conectar ao servidor da HYPE. Verifique a internet e toque em ATUALIZAR / recarregue esta página.',true);
      } else {
        setAuthMessage(esc(msg),true);
      }
    }
  }

  function startAuthorizationPoll() {
    clearInterval(state.statusTimer);
    state.statusTimer = setInterval(async () => {
      if (!online()) return;
      try {
        const list = normalizeRows(await rpc('portaria_device_status_v18',{p_device_key:state.deviceKey}));
        const d = list[0];
        if (!d) return;
        state.device = d;
        if (d.active) {
          clearInterval(state.statusTimer);
          activateApp(false);
        }
      } catch (_) {}
    }, 3000);
  }

  async function activateApp(fromOffline) {
    clearInterval(state.statusTimer);
    $('deviceAuth').classList.add('hidden');
    $('portariaApp').classList.remove('hidden');
    $('deviceLabel').textContent = state.device?.label || 'Computador fixo da Portaria';
    if (!fromOffline) {
      writeJSON(AUTH_CACHE_KEY,{
        approved:true,
        label:state.device?.label || 'Computador da Portaria',
        expires_at:new Date(Date.now()+AUTH_OFFLINE_MS).toISOString()
      });
    }
    setNetworkBadge();
    await loadEvents();
    await refresh(false);
    startLoops();
    $('searchInput')?.focus();
  }

  async function triggerFeedbackAutoV35(eventId = null) {
    if (!online() || !state.deviceKey) return;
    try {
      const cfg = window.HYPE_SUPABASE_CONFIG || {};
      if (!cfg.url || !cfg.anonKey) return;
      const response = await fetch(`${cfg.url}/functions/v1/send-ticket-email`, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'apikey':cfg.anonKey,
          'Authorization':`Bearer ${cfg.anonKey}`
        },
        body:JSON.stringify({
          action:'survey_auto',
          device_key:state.deviceKey,
          event_id:eventId ? Number(eventId) : null,
          base_url:new URL('.',location.href).toString()
        })
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || data?.ok === false) {
        console.warn('[HYPE V35][feedback auto]',data?.error || response.status);
        return;
      }
      if (!data?.skipped) console.info('[HYPE V35][feedback auto]',data);
    } catch (err) {
      console.warn('[HYPE V35][feedback auto]',err);
    }
  }

  async function loadEvents() {
    const select = $('eventSelect');
    if (!select) return;
    const previousStoredId = Number(localStorage.getItem(EVENT_KEY) || 0);

    if (!online()) {
      const snap = readJSON(SNAPSHOT_KEY,null);
      if (snap?.event_id) {
        state.events = [{id:snap.event_id,name:snap.event_name || 'Evento salvo',event_date:snap.event_date || null}];
        state.eventId = Number(snap.event_id);
        select.innerHTML = `<option value="${state.eventId}">${esc(snap.event_name || 'Evento salvo offline')}</option>`;
      } else {
        select.innerHTML = '<option>Nenhum evento salvo offline</option>';
      }
      return;
    }

    let rows;
    try { rows = await rpc('public_events_v13'); }
    catch (_) { rows = await rpc('public_events'); }
    state.events = normalizeRows(rows);
    if (!state.events.length) {
      select.innerHTML='<option>Nenhum evento ativo</option>';
      state.eventId=null;
      return;
    }

    select.innerHTML=state.events.map(e=>`<option value="${Number(e.id)}">${esc(e.name||'Evento HYPE')}${e.event_date?` • ${esc(fmtDate(e.event_date))}`:''}${e.opening_time?` • ${esc(String(e.opening_time).slice(0,5))}`:''}</option>`).join('');

    let chosen = null;
    if (state.autoEventEnabled) {
      try {
        const autoRows = normalizeRows(await rpc('portaria_current_event_v32',{p_device_key:state.deviceKey}));
        const auto = autoRows[0] || null;
        state.autoEventMeta = auto;
        if (auto?.event_id) chosen = state.events.find(e=>Number(e.id)===Number(auto.event_id)) || null;
      } catch (err) {
        console.warn('[HYPE V32][evento automático]',err);
      }
    }

    if (!chosen) {
      const savedId = Number(localStorage.getItem(EVENT_KEY) || 0);
      chosen = state.events.find(e=>Number(e.id)===savedId);
    }
    if (!chosen) {
      const now = new Date();
      const logical = new Date(now);
      if (now.getHours() < 8) logical.setDate(logical.getDate()-1);
      const key = `${logical.getFullYear()}-${String(logical.getMonth()+1).padStart(2,'0')}-${String(logical.getDate()).padStart(2,'0')}`;
      chosen = state.events.find(e=>String(e.event_date||'').slice(0,10)===key) || state.events[0];
    }
    state.eventId=Number(chosen.id);
    select.value=String(state.eventId);
    localStorage.setItem(EVENT_KEY,String(state.eventId));
    setAutoEventBadge();
    if (state.autoEventEnabled) {
      const endedEventId = previousStoredId && previousStoredId !== Number(state.eventId) ? previousStoredId : null;
      setTimeout(()=>triggerFeedbackAutoV35(endedEventId),350);
    }
  }

  function setAutoEventBadge() {
    const badge=$('autoEventBadge');
    if(!badge)return;
    if(!state.autoEventEnabled){
      badge.textContent='EVENTO MANUAL';
      badge.className='pill';
      return;
    }
    const meta=state.autoEventMeta;
    if(!meta){
      badge.textContent='AUTO • AGUARDANDO EVENTO';
      badge.className='pill';
      return;
    }
    const current=String(meta.status||'').toUpperCase().includes('ATUAL');
    badge.textContent=current?'AUTO • EVENTO ATUAL • ATÉ 08:00':'AUTO • PRÓXIMO EVENTO';
    badge.className=`pill ${current?'on':''}`.trim();
  }

  async function syncAutoEventV32(force=false){
    if(!state.autoEventEnabled || !online() || !state.deviceKey)return;
    try{
      const rows=normalizeRows(await rpc('portaria_current_event_v32',{p_device_key:state.deviceKey}));
      const meta=rows[0]||null;
      state.autoEventMeta=meta;
      setAutoEventBadge();
      if(!meta?.event_id)return;
      const id=Number(meta.event_id);
      if(!force && id===Number(state.eventId))return;
      if(!state.events.some(e=>Number(e.id)===id))await loadEvents();
      if(!state.events.some(e=>Number(e.id)===id))return;
      const previousEventId = Number(state.eventId || 0);
      state.eventId=id;
      localStorage.setItem(EVENT_KEY,String(id));
      if($('eventSelect'))$('eventSelect').value=String(id);
      state.items.clear();
      $('results').innerHTML='<div class="empty">Evento selecionado automaticamente pela data e horário da festa.</div>';
      try{await window.HypeV20?.eventChanged?.();}catch(_){}
      if (previousEventId && previousEventId !== id) triggerFeedbackAutoV35(previousEventId);
      else triggerFeedbackAutoV35(null);
      await refresh(false);
    }catch(err){
      console.warn('[HYPE V32][auto troca]',err);
    }
  }

  async function enableAutoEvent(){
    state.autoEventEnabled=true;
    await syncAutoEventV32(true);
    setAutoEventBadge();
  }

  async function changeEvent() {
    const id = Number($('eventSelect')?.value || 0);
    if (!id) return;
    state.autoEventEnabled=false;
    state.autoEventMeta=null;
    setAutoEventBadge();
    state.eventId=id;
    localStorage.setItem(EVENT_KEY,String(id));
    state.items.clear();
    $('results').innerHTML='<div class="empty">Evento alterado. Leia o próximo QR ou pesquise o cliente.</div>';
    if (!online()) {
      const snap=readJSON(SNAPSHOT_KEY,null);
      if (Number(snap?.event_id)!==id) {
        $('results').innerHTML='<div class="empty error">Este evento não está salvo para uso offline. Conecte à internet e clique PREPARAR OFFLINE.</div>';
      }
    }
    await refresh(false);
  }

  function startLoops() {
    clearInterval(state.scanTimer);
    clearInterval(state.refreshTimer);
    clearInterval(state.syncTimer);
    clearInterval(state.eventTimer);

    // V105: a operação real usa a própria câmera da Portaria no celular.
    // O antigo canal "celular leitor -> computador" fica disponível no código,
    // mas não faz polling em segundo plano.
    state.scanTimer=null;

    state.refreshTimer=setInterval(()=>{
      if(document.visibilityState!=='visible') return;
      refresh(false).catch(()=>{});
    },6000);

    state.syncTimer=setInterval(()=>{
      if(document.visibilityState!=='visible') return;
      syncQueue().catch(()=>{});
    },6000);

    // Confere a troca automática de evento apenas enquanto a Portaria está visível.
    state.eventTimer=setInterval(()=>{
      if(document.visibilityState!=='visible') return;
      syncAutoEventV32(false).catch(()=>{});
    },30000);
  }

  function showRemoteReaderError(err){
    const msg=String(err?.message||err||'Falha na comunicação do leitor.');
    if(/nao autorizado|não autorizado/i.test(msg)) return handleDeviceAuthError(err);
    const b=$('readerBadge');
    if(b){b.textContent='ERRO NO LEITOR';b.className='pill off';}
    // Não abre alerta repetitivo, mas deixa o erro visível na tela.
    const box=$('results');
    if(box && !/Nenhum|Pronto para|Evento alterado/i.test(box.textContent||'')) return;
    if(box) box.innerHTML=`<div class="empty error">Falha ao receber QR do celular: ${esc(msg)}</div>`;
  }

  async function pullRemoteScan() {
    if (document.visibilityState!=='visible' || !online() || !state.deviceKey || !state.eventId || state.remotePullBusy) return;
    state.remotePullBusy=true;
    try {
      let data;
      try {
        // V31: canal dedicado e simples, ligado apenas ao device_key deste computador.
        data=await rpc('portaria_device_pull_scan_v31',{p_device_key:state.deviceKey});
      } catch (err) {
        if(!/portaria_device_pull_scan_v31|function|schema cache|does not exist/i.test(String(err?.message||err))) throw err;
        try {
          data=await rpc('portaria_device_pull_scan_v29',{
            p_device_key:state.deviceKey,
            p_event_id:Number(state.eventId)
          });
        } catch(err2) {
          if(!/portaria_device_pull_scan_v29|function|schema cache|does not exist/i.test(String(err2?.message||err2))) throw err2;
          data=await rpc('portaria_device_pull_scan_v18',{p_device_key:state.deviceKey});
        }
      }
      const list=normalizeRows(data);
      if (!list.length) return;
      const scan=list[0];
      if(!scan?.raw_code) return;
      state.lastRemoteScanAt=Date.now();
      const b=$('readerBadge'); if(b){b.textContent='QR RECEBIDO';b.className='pill on';}
      flash(true,'QR RECEBIDO DO CELULAR','Buscando nome e ingresso automaticamente...');
      await processCode(scan.raw_code,true);
      if(b){b.textContent='LEITOR ATIVO';b.className='pill on';}
    } finally {
      state.remotePullBusy=false;
    }
  }

  function handleDeviceAuthError(err) {
    const msg=String(err?.message||err||'');
    if (/nao autorizado|não autorizado/i.test(msg)) {
      localStorage.removeItem(AUTH_CACHE_KEY);
      state.device=null;
      $('portariaApp')?.classList.add('hidden');
      $('deviceAuth')?.classList.remove('hidden');
      setAuthMessage('🔒 Este computador foi desconectado no Admin. Reative em Acesso de dispositivos.',true);
    }
  }

  async function refresh(showToast) {
    setNetworkBadge();
    if (!state.eventId) return;
    if (!online()) {
      renderOfflineDashboard();
      if (showToast) flash(true,'OFFLINE','Dados salvos neste computador.');
      return;
    }
    try {
      const data=await rpc('portaria_device_dashboard_v18',{p_device_key:state.deviceKey,p_event_id:state.eventId});
      let access=null;
      try{
        const accessRows=normalizeRows(await rpc('portaria_device_access_counts_v68',{p_device_key:state.deviceKey,p_event_id:state.eventId}));
        access=accessRows[0]||null;
      }catch(_){}
      renderDashboard(data || {},access);
      if (showToast) flash(true,'ATUALIZADO','Portaria sincronizada.');
    } catch (err) {
      handleDeviceAuthError(err);
      if (showToast) flash(false,'ERRO',err.message||'Falha ao atualizar.');
    }
  }

  function renderDashboard(data,access=null) {
    $('enteredCount').textContent=String(data.entered_count||0);
    $('remainingCount').textContent=String(data.remaining_count||0);
    $('paidCount').textContent=String(access?.total_access ?? data.total_paid ?? 0);
    $('femaleCount').textContent=String(access?.female_access ?? data.female_entered ?? 0);
    $('maleCount').textContent=String(access?.male_access ?? data.male_entered ?? 0);
    const sectors=Array.isArray(data.sector_stats)?data.sector_stats:[];
    $('sectorStats').innerHTML=sectors.length?sectors.map(s=>`<span><b>${esc(s.sector||'Ingresso')}</b> ${Number(s.entered||0)}/${Number(s.paid||0)}</span>`).join(''):'<span>Sem ingressos pagos neste evento.</span>';
    const recent=Array.isArray(data.recent)?data.recent:[];
    $('recentList').innerHTML=recent.length?recent.map(r=>`<div class="recent-row"><div><strong>${esc(r.name||'Cliente')}</strong><small>${esc(r.sector||'')} • ${esc(r.code||'')}</small></div><time>${esc(fmtTime(r.entry_at))}</time></div>`).join(''):'<div class="empty">Nenhuma entrada registrada.</div>';
  }

  function renderOfflineDashboard() {
    const snap=readJSON(SNAPSHOT_KEY,null);
    const tickets=Number(snap?.event_id)===Number(state.eventId)?(snap.tickets||[]):[];
    const paid=tickets.filter(t=>t.payment_status==='Pago');
    const inside=paid.filter(t=>t.entry_status==='Entrada utilizada'&&!t.temporary_exit&&!t.final_exit_at);
    const sectors={};
    paid.forEach(t=>{
      const k=t.sector||'Ingresso';
      if(!sectors[k])sectors[k]={sector:k,paid:0,entered:0};
      sectors[k].paid++;
      if(t.entry_status==='Entrada utilizada'&&!t.temporary_exit&&!t.final_exit_at)sectors[k].entered++;
    });
    renderDashboard({
      total_paid:paid.length,
      entered_count:inside.length,
      remaining_count:paid.length-inside.length,
      female_entered:inside.filter(t=>String(t.gender||'').toLowerCase()==='feminino').length,
      male_entered:inside.filter(t=>String(t.gender||'').toLowerCase()==='masculino').length,
      sector_stats:Object.values(sectors),
      recent:inside.filter(t=>t.entry_at).sort((a,b)=>new Date(b.entry_at)-new Date(a.entry_at)).slice(0,12).map(t=>({name:t.customer_name,sector:t.sector,code:t.ticket_code,entry_at:t.entry_at}))
    });
  }

  function looksLikeCode(value) {
    const q=String(value||'').trim();
    return /^#?HYPE[-_]/i.test(q)||/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(q)||q.length>=24;
  }

  async function search() {
    const seq=++state.searchSeq;
    const q=$('searchInput')?.value.trim()||'';
    const box=$('results');
    if(!q){
      if(box) box.innerHTML='';
      return;
    }
    if(looksLikeCode(q))return processCode(q,false);

    if(!online()){
      const snap=readJSON(SNAPSHOT_KEY,null);
      const clean=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const needle=clean(q);
      const rows=(snap?.tickets||[]).filter(t=>
        Number(t.event_id)===Number(state.eventId) &&
        [t.customer_name,t.phone,t.cpf,t.ticket_code].some(v=>clean(v).includes(needle))
      ).slice(0,30);
      if(seq!==state.searchSeq) return;
      if(rows.length) renderResults(rows);
      else if(box) box.innerHTML='<div class="empty">Nenhum ingresso encontrado no pacote offline. Para nomes da Lista/FREE, conecte a internet.</div>';
      return;
    }

    if(box) box.innerHTML='<div class="empty">Buscando em ingressos e Lista/FREE...</div>';

    let scoped=[];
    let ticketError=null;
    try{
      let rows=[];
      try{
        rows=normalizeRows(await rpc('portaria_device_search_v102',{p_device_key:state.deviceKey,p_event_id:state.eventId,p_query:q}));
      }catch(err102){
        if(!/portaria_device_search_v102|function|schema cache|does not exist/i.test(String(err102?.message||err102))) throw err102;
        try{
          rows=normalizeRows(await rpc('portaria_device_search_v72',{p_device_key:state.deviceKey,p_event_id:state.eventId,p_query:q}));
        }catch(err){
          if(!/portaria_device_search_v72|function|schema cache|does not exist/i.test(String(err?.message||err))) throw err;
          try{
            rows=normalizeRows(await rpc('portaria_device_search_v60',{p_device_key:state.deviceKey,p_event_id:state.eventId,p_query:q}));
          }catch(err2){
            rows=normalizeRows(await rpc('portaria_device_search_v18',{p_device_key:state.deviceKey,p_event_id:state.eventId,p_query:q}));
          }
        }
      }
      if(seq!==state.searchSeq) return;
      scoped=rows.filter(item=>Number(item.event_id)===Number(state.eventId));
    }catch(err){
      ticketError=err;
      console.warn('[HYPE V102][busca ingressos]',err);
    }

    if(seq!==state.searchSeq) return;
    if(scoped.length) renderResults(scoped);
    else if(box) box.innerHTML='';

    let guestCount=0;
    try{
      if(window.HypeListaSimples){
        guestCount=Number(await window.HypeListaSimples.search(q,'results',scoped.length>0,true) || 0);
      }
    }catch(err){
      console.warn('[HYPE V102][busca Lista/FREE]',err);
    }

    if(seq!==state.searchSeq) return;
    if(String($('searchInput')?.value||'').trim()!==q) return;

    if(!scoped.length && !guestCount && box){
      box.innerHTML=ticketError
        ? '<div class="empty error">A busca teve uma falha de conexão. Tente novamente.</div>'
        : '<div class="empty">Nenhum nome encontrado neste evento. Tente parte do nome, sobrenome, CPF ou WhatsApp.</div>';
    }
  }

  function offlineFind(code) {
    const snap=readJSON(SNAPSHOT_KEY,null); const q=String(code||'').trim().replace(/^#/,'');
    return (snap?.tickets||[]).find(t=>
      Number(t.event_id)===Number(state.eventId) &&
      (String(t.ticket_code||'').toUpperCase()===q.toUpperCase()||String(t.qr_token||'')===q)
    )||null;
  }

  async function processCode(code, fromReader) {
    const input=$('searchInput'); if(input)input.value=String(code||'').trim();
    if(!online()){
      const item=offlineFind(code);
      if(!item){
        renderResults([]);
        flash(false,'SEM INTERNET','Sem conexão. Este QR não está no pacote offline; reconecte e leia novamente.');
        return;
      }
      renderResults([item]);
      if(item.payment_status!=='Pago'){flash(false,'NEGADO','Pagamento não confirmado.');return;}
      if(fromReader) await validate(Number(item.ticket_id));
      return;
    }
    try{
      let rows=[];
      try {
        // V26: o próprio Supabase já recebe o evento selecionado e só pode
        // devolver ingresso pertencente a ele.
        rows=normalizeRows(await rpc('portaria_device_lookup_event_v60',{
          p_device_key:state.deviceKey,
          p_event_id:state.eventId,
          p_code:String(code||'').trim()
        }));
      } catch (err) {
        // Compatibilidade: durante o cache do Supabase, usa V26 e depois V18.
        if(!/portaria_device_lookup_event_v60|function|schema cache|does not exist/i.test(String(err?.message||err))) throw err;
        try{
          rows=normalizeRows(await rpc('portaria_device_lookup_event_v26',{
            p_device_key:state.deviceKey,
            p_event_id:state.eventId,
            p_code:String(code||'').trim()
          }));
        }catch(err26){
          if(!/portaria_device_lookup_event_v26|function|schema cache|does not exist/i.test(String(err26?.message||err26))) throw err26;
          const legacy=normalizeRows(await rpc('portaria_device_lookup_v18',{p_device_key:state.deviceKey,p_code:String(code||'').trim()}));
          rows=legacy.filter(item=>Number(item.event_id)===Number(state.eventId));
        }
      }
      if(!rows.length){
        // V103: antes de considerar o QR inválido, tenta como QR da Lista HYPE.
        if(window.HypeListaSimples?.processQr){
          const handled=await window.HypeListaSimples.processQr(String(code||'').trim());
          if(handled) return;
        }

        // V30: descobre se o QR existe em OUTRO evento sem liberar entrada.
        // Assim a Portaria explica exatamente de qual show e data é o ingresso.
        let actual=null;
        try {
          const info=normalizeRows(await rpc('portaria_device_qr_event_v30',{
            p_device_key:state.deviceKey,
            p_code:String(code||'').trim()
          }));
          actual=info[0]||null;
        } catch (infoErr) {
          // Compatibilidade: enquanto o SQL V30 não estiver instalado, usa a
          // consulta antiga somente para descobrir o evento.
          if(/portaria_device_qr_event_v30|function|schema cache|does not exist/i.test(String(infoErr?.message||infoErr))){
            const legacy=normalizeRows(await rpc('portaria_device_lookup_v18',{p_device_key:state.deviceKey,p_code:String(code||'').trim()}));
            actual=legacy[0]||null;
          } else throw infoErr;
        }

        if(actual && Number(actual.event_id)!==Number(state.eventId)){
          renderWrongEvent(actual);
          const eventLabel=`${actual.event_name||'Evento HYPE'}${actual.event_date?` • ${fmtDate(actual.event_date)}`:''}`;
          flash(false,'INGRESSO DE OUTRO EVENTO',`Desculpa, este ingresso é do ${eventLabel}.`);
          return;
        }

        renderResults([]);
        flash(false,'QR NÃO ENCONTRADO','Este QR não corresponde a nenhum ingresso cadastrado.');
        return;
      }
      const scoped=rows.filter(item=>Number(item.event_id)===Number(state.eventId));
      if(!scoped.length){
        const actual=rows[0]||null;
        if(actual){
          renderWrongEvent(actual);
          const eventLabel=`${actual.event_name||'Evento HYPE'}${actual.event_date?` • ${fmtDate(actual.event_date)}`:''}`;
          flash(false,'INGRESSO DE OUTRO EVENTO',`Desculpa, este ingresso é do ${eventLabel}.`);
        } else {
          renderResults([]);
          flash(false,'QR NÃO ENCONTRADO','Este QR não corresponde a nenhum ingresso cadastrado.');
        }
        return;
      }
      renderResults(scoped);
      const item=scoped[0];
      if(item.payment_status!=='Pago'){
        flash(false,'NEGADO',item.payment_status==='Cancelado'?'Ingresso cancelado.':'Pagamento não confirmado.');
        return;
      }
      if(fromReader){
        // V39: QR válido e pago confirma a entrada automaticamente.
        // Busca manual continua apenas consultando, sem registrar entrada sozinha.
        await validate(Number(item.ticket_id));
      } else {
        tone();
      }
    }catch(err){
      const msg=String(err?.message||err||'Falha ao ler QR.');
      const networkFail=!online() || /failed to fetch|fetch failed|network|connection|timeout|offline/i.test(msg);
      if(networkFail){
        flash(false,'SEM INTERNET','A conexão caiu durante a leitura. Reconecte e leia este QR novamente.');
      }else{
        flash(false,'ERRO',msg);
      }
    }
  }

  function selectedEventInfo() {
    return state.events.find(e=>Number(e.id)===Number(state.eventId)) || {
      id:state.eventId,
      name:$('eventSelect')?.selectedOptions?.[0]?.textContent || 'Evento selecionado',
      event_date:null
    };
  }

  function renderWrongEvent(actual) {
    state.items.clear();
    const box=$('results');
    if(!box)return;
    const selected=selectedEventInfo();
    const actualName=actual?.event_name || 'Evento HYPE';
    const actualDate=actual?.event_date ? fmtDate(actual.event_date) : 'data não informada';
    const selectedName=selected?.name || 'Evento selecionado';
    const selectedDate=selected?.event_date ? fmtDate(selected.event_date) : '';
    box.innerHTML=`<article class="ticket bad"><div><span class="sector">⚠️ EVENTO DIFERENTE</span><h2>INGRESSO NÃO LIBERADO</h2><div class="meta" style="font-size:13px;line-height:1.7"><b>Desculpa, este ingresso é do evento ${esc(actualName)}, dia ${esc(actualDate)}.</b><br><br>Na Portaria está selecionado <b>${esc(selectedName)}${selectedDate?` • ${esc(selectedDate)}`:''}</b>.<br>Selecione o evento correto acima e leia o QR novamente. <b>Nenhuma entrada foi registrada.</b></div></div><div class="ticket-actions"><div class="state danger">OUTRO EVENTO</div></div></article>`;
  }

  function renderResults(rows) {
    state.items.clear();
    const box=$('results');
    // V26: último bloqueio de segurança visual. A tela jamais mistura eventos.
    const scoped=(Array.isArray(rows)?rows:[]).filter(r=>Number(r.event_id)===Number(state.eventId));
    if(!scoped.length){box.innerHTML='';return;}
    scoped.forEach(r=>state.items.set(Number(r.ticket_id),r));
    box.innerHTML=scoped.map(renderTicket).join('');
  }

  function renderTicket(item) {
    const wrong=Number(item.event_id)!==Number(state.eventId);
    const paid=item.payment_status==='Pago';
    const finalExited=Boolean(item.final_exit_at);
    const entered=item.entry_status==='Entrada utilizada'&&!item.temporary_exit&&!finalExited;
    const temp=Boolean(item.temporary_exit)&&!finalExited;
    const auth=Boolean(item.reentry_authorized)&&!finalExited;
    let cls=''; let stateText='AGUARDANDO PAGAMENTO'; let stateCls='warn';
    if(wrong){cls='bad';stateText='OUTRO EVENTO';stateCls='danger';}
    else if(item.payment_status==='Cancelado'){cls='bad';stateText='CANCELADO';stateCls='danger';}
    else if(!paid){stateText='PENDENTE';stateCls='warn';}
    else if(finalExited){cls='ok';stateText='SAÍDA CONFIRMADA';stateCls='good';}
    else if(temp&&auth){cls='ok';stateText='REENTRADA AUTORIZADA';stateCls='good';}
    else if(temp){stateText='FORA TEMPORARIAMENTE';stateCls='warn';}
    else if(entered){cls='ok';stateText='DENTRO DA HYPE';stateCls='good';}
    else {cls='ok';stateText='LIBERADO';stateCls='good';}

    const id=Number(item.ticket_id);
    let actions='';
    if(paid&&!wrong&&!finalExited){
      if(!entered&&!temp) actions+=`<button class="btn green" onclick="HypePortaria.validate(${id})">✅ CONFIRMAR ENTRADA</button>`;
      if(entered&&!temp) actions+=`<button class="btn green" onclick="HypeV60Exit.open(${id})">🚪 SAINDO</button>`;
      if(entered&&!temp) actions+=`<button class="btn" onclick="HypePortaria.temporaryExit(${id})">↗ SAÍDA TEMPORÁRIA</button>`;
      if(temp&&!auth) actions+=`<button class="btn" onclick="HypePortaria.authorizeReentry(${id})">↩ AUTORIZAR REENTRADA</button>`;
      if(temp&&auth) actions+=`<button class="btn green" onclick="HypePortaria.validate(${id})">✅ CONFIRMAR REENTRADA</button>`;
    }

    return `<article class="ticket ${cls}"><div><span class="sector">${esc(item.sector||'INGRESSO')}</span><h2>${esc(item.customer_name||'Cliente')}</h2><div class="meta"><b>${esc(item.event_name||'Evento HYPE')}</b>${item.event_date?` • ${esc(fmtDate(item.event_date))}`:''}<br>${esc(item.lot_name||'')} • ${esc(item.gender||'N/I')}<br>CPF: <b>${esc(item.cpf||'Não informado')}</b><br>Código: ${esc(item.ticket_code||'')}</div></div><div class="ticket-actions"><div class="state ${stateCls}">${esc(stateText)}</div>${actions}</div></article>`;
  }

  function getItem(id){return state.items.get(Number(id))||null;}

  function saveOfflineMutation(item) {
    const snap=readJSON(SNAPSHOT_KEY,null); if(!snap?.tickets)return;
    const idx=snap.tickets.findIndex(t=>Number(t.ticket_id)===Number(item.ticket_id));
    if(idx>=0){snap.tickets[idx]={...snap.tickets[idx],...item};writeJSON(SNAPSHOT_KEY,snap);}
    updateOfflineBadge();renderOfflineDashboard();
  }
  function enqueue(action,item,value=null){
    const q=readJSON(QUEUE_KEY,[]);q.push({action,ticket_id:Number(item.ticket_id),code:item.ticket_code,event_id:Number(item.event_id),value,created_at:new Date().toISOString()});writeJSON(QUEUE_KEY,q);updateOfflineBadge();
  }

  async function toggleDocument(id) {
    const item=getItem(id); if(!item)return;
    const next=!item.document_checked;
    if(!online()){
      item.document_checked=next;saveOfflineMutation(item);enqueue('document',item,next);renderResults([item]);return;
    }
    try{await rpc('portaria_device_document_v18',{p_device_key:state.deviceKey,p_ticket_id:id,p_checked:next});await processCode(item.ticket_code,false);flash(true,next?'DOCUMENTO OK':'DOCUMENTO DESMARCADO',item.customer_name||'');}
    catch(err){flash(false,'ERRO',err.message||'Falha ao conferir documento.');}
  }

  async function validate(id) {
    const item=getItem(id); if(!item)return;
    if(!online()){
      if(item.entry_status==='Entrada utilizada'&&!item.temporary_exit)return flash(false,'JÁ UTILIZADO',item.customer_name||'');
      if(item.temporary_exit&&!item.reentry_authorized)return flash(false,'NEGADO','Reentrada ainda não autorizada.');
      if(item.temporary_exit&&item.reentry_authorized){item.temporary_exit=false;item.reentry_authorized=false;item.reentry_count=Number(item.reentry_count||0)+1;}
      else {item.entry_status='Entrada utilizada';item.entry_at=new Date().toISOString();}
      saveOfflineMutation(item);enqueue('validate',item);renderResults([item]);flash(true,'ENTRADA LIBERADA',`${item.customer_name} • OFFLINE`);return;
    }
    try{
      const rows=normalizeRows(await rpc('portaria_device_validate_v18',{p_device_key:state.deviceKey,p_event_id:state.eventId,p_code:item.ticket_code}));
      const result=rows[0];
      if(!result?.ok)return flash(false,'NEGADO',result?.message||'Entrada negada.');
      flash(true,result.message||'ENTRADA LIBERADA',result.customer_name||item.customer_name||'');
      await refresh(false);setTimeout(()=>{$('results').innerHTML='<div class="empty">Pronto para o próximo ingresso.</div>';$('searchInput').value='';$('searchInput').focus();},1000);
    }catch(err){flash(false,'ERRO',err.message||'Falha ao registrar entrada.');}
  }

  async function temporaryExit(id){
    const item=getItem(id);if(!item)return;
    if(!confirm(`Registrar saída temporária de ${item.customer_name}?`))return;
    if(!online()){item.temporary_exit=true;item.reentry_authorized=false;saveOfflineMutation(item);enqueue('exit',item);renderResults([item]);return flash(true,'SAÍDA TEMPORÁRIA',item.customer_name||'');}
    try{await rpc('portaria_device_temporary_exit_v18',{p_device_key:state.deviceKey,p_ticket_id:id});await processCode(item.ticket_code,false);flash(true,'SAÍDA TEMPORÁRIA',item.customer_name||'');}catch(err){flash(false,'ERRO',err.message||'Falha na saída temporária.');}
  }

  async function authorizeReentry(id){
    const item=getItem(id);if(!item)return;
    if(!online()){item.reentry_authorized=true;saveOfflineMutation(item);enqueue('reentry',item,true);renderResults([item]);return flash(true,'REENTRADA AUTORIZADA',item.customer_name||'');}
    try{await rpc('portaria_device_reentry_v18',{p_device_key:state.deviceKey,p_ticket_id:id,p_authorized:true});await processCode(item.ticket_code,false);flash(true,'REENTRADA AUTORIZADA',item.customer_name||'');}catch(err){flash(false,'ERRO',err.message||'Falha ao autorizar reentrada.');}
  }

  async function openPair() {
    if(!online())return alert('Conecte à internet para parear um celular. No modo offline use a câmera deste computador ou um leitor físico.');
    try{
      const token=randomSecret(24); state.pairToken=token;
      const rows=normalizeRows(await rpc('portaria_create_pair_v18',{p_device_key:state.deviceKey,p_pair_token:token}));
      state.pairExpiresAt=rows[0]?.expires_at||null;
      const url=new URL('leitor.html',location.href);url.searchParams.set('pair',token);
      $('pairQr').src=window.HypeQRCode.toDataUrl(url.toString(),300);
      $('pairUrlText').textContent='QR temporário • expira em 3 minutos';
      $('pairModal').classList.add('show');
      const b=$('readerBadge');b.textContent='AGUARDANDO CELULAR';b.className='pill';
    }catch(err){alert(err.message||'Não foi possível criar o QR de conexão.');}
  }
  function closePair(){$('pairModal').classList.remove('show');}
  async function endReaders(){
    if(!online())return alert('Conecte à internet para encerrar leitores.');
    try{await rpc('portaria_device_end_readers_v18',{p_device_key:state.deviceKey});closePair();const b=$('readerBadge');b.textContent='SEM LEITOR';b.className='pill';flash(true,'LEITORES ENCERRADOS','Celulares desconectados.');}catch(err){alert(err.message||'Falha ao encerrar leitores.');}
  }

  async function prepareOffline(silent=false){
    if(!online()){if(!silent)alert('Conecte à internet para preparar o modo offline.');return;}
    if(!state.eventId)return;
    try{
      let rows=[];
      try{
        rows=normalizeRows(await rpc('portaria_device_snapshot_v60',{p_device_key:state.deviceKey,p_event_id:state.eventId}));
      }catch(err){
        if(!/portaria_device_snapshot_v60|function|schema cache|does not exist/i.test(String(err?.message||err))) throw err;
        rows=normalizeRows(await rpc('portaria_device_snapshot_v18',{p_device_key:state.deviceKey,p_event_id:state.eventId}));
      }
      const event=state.events.find(e=>Number(e.id)===Number(state.eventId))||{};
      const snap={event_id:state.eventId,event_name:event.name||$('eventSelect')?.selectedOptions?.[0]?.textContent||'Evento HYPE',event_date:event.event_date||null,saved_at:new Date().toISOString(),expires_at:new Date(Date.now()+AUTH_OFFLINE_MS).toISOString(),tickets:rows};
      writeJSON(SNAPSHOT_KEY,snap);writeJSON(AUTH_CACHE_KEY,{approved:true,label:state.device?.label||'Computador da Portaria',expires_at:snap.expires_at});updateOfflineBadge();
      if(!silent)alert(`MODO OFFLINE PRONTO ✅\n\n${rows.length} ingresso(s) pagos salvos neste computador.\nValidade: 12 horas.`);
    }catch(err){if(!silent)alert(err.message||'Falha ao preparar offline.');}
  }

  async function syncQueue(){
    if(!online())return;
    let q=readJSON(QUEUE_KEY,[]); if(!q.length)return;
    let changed=false;
    while(q.length){
      const a=q[0];
      try{
        if(a.action==='document')await rpc('portaria_device_document_v18',{p_device_key:state.deviceKey,p_ticket_id:a.ticket_id,p_checked:Boolean(a.value)});
        else if(a.action==='exit')await rpc('portaria_device_temporary_exit_v18',{p_device_key:state.deviceKey,p_ticket_id:a.ticket_id});
        else if(a.action==='reentry')await rpc('portaria_device_reentry_v18',{p_device_key:state.deviceKey,p_ticket_id:a.ticket_id,p_authorized:Boolean(a.value)});
        else if(a.action==='validate'){
          const rows=normalizeRows(await rpc('portaria_device_validate_v18',{p_device_key:state.deviceKey,p_event_id:a.event_id,p_code:a.code}));
          const r=rows[0];
          if(r && !r.ok && !/JA UTILIZADO|JÁ UTILIZADO/i.test(String(r.message||'')))throw new Error(r.message||'Conflito ao sincronizar entrada');
        }
        q.shift();changed=true;writeJSON(QUEUE_KEY,q);
      }catch(err){console.warn('[HYPE V18][offline sync]',err);break;}
    }
    if(changed){updateOfflineBadge();await refresh(false);if(!q.length)await prepareOffline(true);}
  }

  function setCameraStatus(active,message=''){
    const badge=$('cameraStatus');
    const button=$('cameraStartBtn');
    if(badge){
      badge.textContent=message || (active?'CÂMERA QR ATIVA':'CÂMERA DESLIGADA');
      badge.className=`pill ${active?'on':''}`.trim();
    }
    if(button) button.textContent=active?'⏹ PARAR CÂMERA QR':'📷 ABRIR CÂMERA QR';
  }

  async function detectQrFromVideo(video){
    if(state.cameraDetector){
      const codes=await state.cameraDetector.detect(video);
      return String(codes?.[0]?.rawValue||'').trim();
    }
    if(typeof window.jsQR!=='function') return '';
    if(!state.cameraCanvas) state.cameraCanvas=document.createElement('canvas');
    const canvas=state.cameraCanvas;
    const vw=video.videoWidth||0;
    const vh=video.videoHeight||0;
    if(!vw||!vh) return '';

    // No fallback jsQR, reduz o frame para evitar travamentos em celulares
    // intermediários sem prejudicar a leitura de QR próximo à câmera.
    const maxSide=720;
    const scale=Math.min(1,maxSide/Math.max(vw,vh));
    const w=Math.max(2,Math.round(vw*scale));
    const h=Math.max(2,Math.round(vh*scale));
    if(canvas.width!==w) canvas.width=w;
    if(canvas.height!==h) canvas.height=h;

    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx) return '';
    ctx.drawImage(video,0,0,w,h);
    const frame=ctx.getImageData(0,0,w,h);
    const hit=window.jsQR(frame.data,w,h,{inversionAttempts:'attemptBoth'});
    return String(hit?.data||'').trim();
  }

  async function openMobileCamera(){
    const preferred={
      video:{
        facingMode:{ideal:'environment'},
        width:{ideal:1280},
        height:{ideal:720}
      },
      audio:false
    };
    try{
      return await navigator.mediaDevices.getUserMedia(preferred);
    }catch(firstErr){
      // Alguns Androids recusam as constraints da câmera traseira.
      // Tenta novamente sem constraints antes de considerar falha.
      try{
        return await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      }catch(_){
        throw firstErr;
      }
    }
  }

  async function startCamera(resume=false){
    if(state.cameraStream){
      if(!resume) stopCamera();
      return;
    }
    if(!resume) state.cameraWanted=true;
    if(resume && !state.cameraWanted) return;

    if(!navigator.mediaDevices?.getUserMedia){
      state.cameraWanted=false;
      alert('Este navegador não conseguiu acessar a câmera. Atualize o navegador e tente novamente.');
      return;
    }

    try{
      state.cameraDetector=null;
      if('BarcodeDetector' in window){
        try{
          if(typeof BarcodeDetector.getSupportedFormats==='function'){
            const formats=await BarcodeDetector.getSupportedFormats();
            if(Array.isArray(formats) && !formats.includes('qr_code')) throw new Error('qr_code não suportado');
          }
          state.cameraDetector=new BarcodeDetector({formats:['qr_code']});
        }catch(_){
          state.cameraDetector=null;
        }
      }
      if(!state.cameraDetector && typeof window.jsQR!=='function'){
        throw new Error('Leitor de QR não carregou. Confira a internet, atualize a página e tente novamente.');
      }

      state.cameraStream=await openMobileCamera();
      const video=$('cameraVideo');
      if(!video) throw new Error('Área da câmera não encontrada.');

      video.muted=true;
      video.autoplay=true;
      video.playsInline=true;
      video.setAttribute('playsinline','');
      video.srcObject=state.cameraStream;
      $('scannerArea')?.classList.add('show');

      await video.play();

      // Evita o caso em que o navegador concede acesso mas entrega tela preta.
      await new Promise(r=>setTimeout(r,180));
      if(!video.videoWidth || !video.videoHeight){
        await new Promise(r=>setTimeout(r,650));
        if(!video.videoWidth || !video.videoHeight){
          throw new Error('A câmera abriu, mas não entregou imagem. Feche Câmera/WhatsApp/Instagram e tente novamente.');
        }
      }

      setCameraStatus(true,'CÂMERA QR ATIVA • APONTE PARA O INGRESSO OU LISTA');

      clearInterval(state.cameraTimer);
      state.cameraLastCode='';
      state.cameraLastAt=0;
      state.cameraTimer=setInterval(async()=>{
        if(state.cameraBusy || !state.cameraStream || video.readyState<2) return;

        // Trava também durante a decodificação para não empilhar leituras no celular.
        state.cameraBusy=true;
        try{
          const raw=await detectQrFromVideo(video);
          if(!raw){
            if(state.cameraLastCode && Date.now()-state.cameraLastAt>1200) state.cameraLastCode='';
            return;
          }

          const now=Date.now();
          state.cameraLastAt=now;
          if(raw===state.cameraLastCode) return;

          state.cameraLastCode=raw;
          setCameraStatus(true,'QR LIDO • VALIDANDO...');
          tone('scan');
          await processCode(raw,true);
          setCameraStatus(true,'PRONTO • RETIRE O QR E APONTE O PRÓXIMO');
        }catch(err){
          console.warn('[HYPE V104][camera QR]',err);
          const msg=String(err?.message||err||'').trim();
          setCameraStatus(true,msg ? 'CÂMERA ATIVA • FALHA NA LEITURA, TENTE NOVAMENTE' : 'CÂMERA QR ATIVA');
        }finally{
          state.cameraBusy=false;
        }
      },280);
    }catch(err){
      stopCamera(true);
      state.cameraWanted=false;
      const name=String(err?.name||'');
      let msg=String(err?.message||err||'Erro desconhecido');
      if(name==='NotAllowedError' || /permission|permiss/i.test(msg)){
        msg='Permissão da câmera bloqueada. Libere a câmera para este site nas configurações do navegador.';
      }else if(name==='NotReadableError' || /could not start|not readable|in use/i.test(msg)){
        msg='A câmera está sendo usada por outro aplicativo. Feche Câmera, WhatsApp ou Instagram e tente novamente.';
      }
      alert('Não foi possível abrir a câmera.\n\n'+msg);
    }
  }

  function stopCamera(keepWanted=false){
    if(!keepWanted) state.cameraWanted=false;
    clearInterval(state.cameraTimer);
    state.cameraTimer=null;
    state.cameraBusy=false;
    state.cameraDetector=null;
    state.cameraLastCode='';
    state.cameraLastAt=0;
    if(state.cameraStream) state.cameraStream.getTracks().forEach(t=>{try{t.stop();}catch(_){}});
    state.cameraStream=null;
    const video=$('cameraVideo');
    if(video){
      try{video.pause();}catch(_){}
      try{video.srcObject=null;}catch(_){}
    }
    $('scannerArea')?.classList.remove('show');
    setCameraStatus(false);
  }

  function flash(ok,title,message){
    const el=$('flash');if(!el)return;el.className=`flash show ${ok?'ok':'bad'}`;el.innerHTML=`<div class="flash-box"><b>${esc(title)}</b><span>${esc(message||'')}</span></div>`;tone(ok?'ok':'bad');setTimeout(()=>{el.className='flash';el.innerHTML='';},1300);
  }
  function tone(kind='scan'){
    try{const AC=window.AudioContext||window.webkitAudioContext;const ctx=new AC();const o=ctx.createOscillator();const g=ctx.createGain();o.frequency.value=kind==='bad'?180:kind==='scan'?620:780;g.gain.value=.05;o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.10);o.onended=()=>ctx.close();}catch(_){}
  }

  async function init(){
    setNetworkBadge();

    window.addEventListener('online',async()=>{
      setNetworkBadge();
      if(document.visibilityState!=='visible') return;
      if(state.cameraWanted && !state.cameraStream){
        startCamera(true).catch(()=>{});
      }
      await syncQueue();
      if(!$('portariaApp').classList.contains('hidden')){
        await loadEvents();
        await refresh(false);
      }
    });

    window.addEventListener('offline',()=>{
      setNetworkBadge();
      if(state.cameraStream){
        setCameraStatus(true,'CÂMERA ATIVA • SEM INTERNET');
      }
    });

    document.addEventListener('visibilitychange',()=>{
      const b=$('readerBadge');
      if(document.visibilityState==='visible'){
        if(b && !/ERRO/.test(b.textContent||'')){b.textContent='PORTARIA ATIVA';b.className='pill on';}
        if(state.cameraWanted && !state.cameraStream){
          startCamera(true).catch(()=>{});
        }
        // V105: ao voltar para a Portaria, sincroniza uma vez em vez de manter
        // timers trabalhando enquanto o porteiro está no WhatsApp/tela bloqueada.
        syncQueue().catch(()=>{});
        syncAutoEventV32(false).catch(()=>{});
        refresh(false).catch(()=>{});
      }else{
        if(b){b.textContent='PAUSADO NESTA ABA';b.className='pill';}
        if(state.cameraStream){
          state.cameraWanted=true;
          stopCamera(true);
        }
      }
    });

    window.addEventListener('pagehide',()=>{
      if(state.cameraStream){
        state.cameraWanted=true;
        stopCamera(true);
      }
    });

    window.addEventListener('pageshow',()=>{
      if(state.cameraWanted && !state.cameraStream && document.visibilityState==='visible'){
        startCamera(true).catch(()=>{});
      }
    });

    await ensureDevice();
  }

  window.HypePortaria={changeEvent,enableAutoEvent,refresh,search,processCode,toggleDocument,validate,temporaryExit,authorizeReentry,openPair,closePair,endReaders,prepareOffline,startCamera,stopCamera,getItem};
  document.addEventListener('DOMContentLoaded',init);
})();
