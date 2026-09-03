/* HYPE LOUNGE CLUB // PORTARIA V18
   Computador autorizado por dispositivo + celular pareado somente como leitor.
   Requer SUPABASE_V18_COMPLETO.sql.
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
    cameraStream: null,
    cameraTimer: null,
    pairToken: '',
    pairExpiresAt: null,
    lastRemoteScanAt: 0
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
      setAuthMessage(`${esc(msg)}<br><br>Se a atualização ainda não foi aplicada, execute <b>SUPABASE_V21_ATUALIZACAO.sql</b> no Supabase.`,true);
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

  async function loadEvents() {
    const select = $('eventSelect');
    if (!select) return;

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

    const savedId = Number(localStorage.getItem(EVENT_KEY) || 0);
    let chosen = state.events.find(e=>Number(e.id)===savedId);
    if (!chosen) {
      const today = new Date();
      const key = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      chosen = state.events.find(e=>String(e.event_date||'').slice(0,10)===key) || state.events[0];
    }
    state.eventId=Number(chosen.id);
    select.innerHTML=state.events.map(e=>`<option value="${Number(e.id)}">${esc(e.name||'Evento HYPE')}${e.event_date?` • ${esc(fmtDate(e.event_date))}`:''}</option>`).join('');
    select.value=String(state.eventId);
    localStorage.setItem(EVENT_KEY,String(state.eventId));
  }

  async function changeEvent() {
    const id = Number($('eventSelect')?.value || 0);
    if (!id) return;
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
    state.scanTimer=setInterval(()=>pullRemoteScan().catch(()=>{}),900);
    state.refreshTimer=setInterval(()=>refresh(false).catch(()=>{}),5000);
    state.syncTimer=setInterval(()=>syncQueue().catch(()=>{}),4000);
  }

  async function pullRemoteScan() {
    if (!online() || !state.deviceKey || !state.eventId) return;
    try {
      const rows=normalizeRows(await rpc('portaria_device_pull_scan_v18',{p_device_key:state.deviceKey}));
      if (!rows.length) return;
      const scan=rows[0];
      state.lastRemoteScanAt=Date.now();
      const b=$('readerBadge'); if(b){b.textContent='LEITOR ATIVO';b.className='pill on';}
      await processCode(scan.raw_code,true);
    } catch (err) { handleDeviceAuthError(err); }
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
      renderDashboard(data || {});
      if (showToast) flash(true,'ATUALIZADO','Portaria sincronizada.');
    } catch (err) {
      handleDeviceAuthError(err);
      if (showToast) flash(false,'ERRO',err.message||'Falha ao atualizar.');
    }
  }

  function renderDashboard(data) {
    $('enteredCount').textContent=String(data.entered_count||0);
    $('remainingCount').textContent=String(data.remaining_count||0);
    $('paidCount').textContent=String(data.total_paid||0);
    $('femaleCount').textContent=String(data.female_entered||0);
    $('maleCount').textContent=String(data.male_entered||0);
    const sectors=Array.isArray(data.sector_stats)?data.sector_stats:[];
    $('sectorStats').innerHTML=sectors.length?sectors.map(s=>`<span><b>${esc(s.sector||'Ingresso')}</b> ${Number(s.entered||0)}/${Number(s.paid||0)}</span>`).join(''):'<span>Sem ingressos pagos neste evento.</span>';
    const recent=Array.isArray(data.recent)?data.recent:[];
    $('recentList').innerHTML=recent.length?recent.map(r=>`<div class="recent-row"><div><strong>${esc(r.name||'Cliente')}</strong><small>${esc(r.sector||'')} • ${esc(r.code||'')}</small></div><time>${esc(fmtTime(r.entry_at))}</time></div>`).join(''):'<div class="empty">Nenhuma entrada registrada.</div>';
  }

  function renderOfflineDashboard() {
    const snap=readJSON(SNAPSHOT_KEY,null);
    const tickets=Number(snap?.event_id)===Number(state.eventId)?(snap.tickets||[]):[];
    const paid=tickets.filter(t=>t.payment_status==='Pago');
    const inside=paid.filter(t=>t.entry_status==='Entrada utilizada'&&!t.temporary_exit);
    const sectors={};
    paid.forEach(t=>{
      const k=t.sector||'Ingresso';
      if(!sectors[k])sectors[k]={sector:k,paid:0,entered:0};
      sectors[k].paid++;
      if(t.entry_status==='Entrada utilizada'&&!t.temporary_exit)sectors[k].entered++;
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
    const q=$('searchInput')?.value.trim()||'';
    if(!q)return;
    if(looksLikeCode(q))return processCode(q,false);
    if(!online()){
      const snap=readJSON(SNAPSHOT_KEY,null);
      const needle=q.toLowerCase();
      const rows=(snap?.tickets||[]).filter(t=>Number(t.event_id)===Number(state.eventId)&&[t.customer_name,t.phone,t.cpf,t.ticket_code].some(v=>String(v||'').toLowerCase().includes(needle))).slice(0,25);
      return renderResults(rows);
    }
    try{
      const rows=normalizeRows(await rpc('portaria_device_search_v18',{p_device_key:state.deviceKey,p_event_id:state.eventId,p_query:q}));
      renderResults(rows);
    }catch(err){flash(false,'ERRO',err.message||'Falha na busca.');}
  }

  function offlineFind(code) {
    const snap=readJSON(SNAPSHOT_KEY,null); const q=String(code||'').trim().replace(/^#/,'');
    return (snap?.tickets||[]).find(t=>String(t.ticket_code||'').toUpperCase()===q.toUpperCase()||String(t.qr_token||'')===q)||null;
  }

  async function processCode(code, fromReader) {
    const input=$('searchInput'); if(input)input.value=String(code||'').trim();
    if(!online()){
      const item=offlineFind(code);
      if(!item){renderResults([]);flash(false,'NEGADO','QR não está no pacote offline deste evento.');return;}
      renderResults([item]);
      if(item.payment_status!=='Pago')flash(false,'NEGADO','Pagamento não confirmado.');
      return;
    }
    try{
      const rows=normalizeRows(await rpc('portaria_device_lookup_v18',{p_device_key:state.deviceKey,p_code:String(code||'').trim()}));
      if(!rows.length){renderResults([]);flash(false,'NEGADO','QR Code não encontrado.');return;}
      renderResults(rows);
      const item=rows[0];
      if(Number(item.event_id)!==Number(state.eventId))flash(false,'OUTRO EVENTO',item.event_name||'Troque o evento selecionado.');
      else if(item.payment_status!=='Pago')flash(false,'NEGADO',item.payment_status==='Cancelado'?'Ingresso cancelado.':'Pagamento não confirmado.');
      else if(fromReader) tone();
    }catch(err){flash(false,'ERRO',err.message||'Falha ao ler QR.');}
  }

  function renderResults(rows) {
    state.items.clear();
    const box=$('results');
    if(!rows?.length){box.innerHTML='<div class="empty error">Nenhum ingresso encontrado.</div>';return;}
    rows.forEach(r=>state.items.set(Number(r.ticket_id),r));
    box.innerHTML=rows.map(renderTicket).join('');
  }

  function renderTicket(item) {
    const wrong=Number(item.event_id)!==Number(state.eventId);
    const paid=item.payment_status==='Pago';
    const entered=item.entry_status==='Entrada utilizada'&&!item.temporary_exit;
    const temp=Boolean(item.temporary_exit);
    const auth=Boolean(item.reentry_authorized);
    let cls=''; let stateText='AGUARDANDO PAGAMENTO'; let stateCls='warn';
    if(wrong){cls='bad';stateText='OUTRO EVENTO';stateCls='danger';}
    else if(item.payment_status==='Cancelado'){cls='bad';stateText='CANCELADO';stateCls='danger';}
    else if(!paid){stateText='PENDENTE';stateCls='warn';}
    else if(temp&&auth){cls='ok';stateText='REENTRADA AUTORIZADA';stateCls='good';}
    else if(temp){stateText='FORA TEMPORARIAMENTE';stateCls='warn';}
    else if(entered){cls='bad';stateText='JÁ UTILIZADO';stateCls='danger';}
    else {cls='ok';stateText='LIBERADO';stateCls='good';}

    const id=Number(item.ticket_id);
    let actions='';
    if(paid&&!wrong){
      actions+=`<button class="btn ${item.document_checked?'green':''}" onclick="HypePortaria.toggleDocument(${id})">${item.document_checked?'✅ DOCUMENTO CONFERIDO':'🪪 CONFERIR DOCUMENTO'}</button>`;
      if(!entered&&!temp) actions+=`<button class="btn green" onclick="HypePortaria.validate(${id})">✅ CONFIRMAR ENTRADA</button>`;
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
      if(!item.document_checked)return flash(false,'NEGADO','Confira o documento/CPF antes de liberar.');
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
      const rows=normalizeRows(await rpc('portaria_device_snapshot_v18',{p_device_key:state.deviceKey,p_event_id:state.eventId}));
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

  async function startCamera(){
    if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia)return alert('Este navegador não suporta leitura automática pela câmera. Use o celular pareado ou a busca.');
    try{
      state.cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
      const video=$('cameraVideo');video.srcObject=state.cameraStream;$('scannerArea').classList.add('show');
      const detector=new BarcodeDetector({formats:['qr_code']});clearInterval(state.cameraTimer);
      state.cameraTimer=setInterval(async()=>{if(video.readyState<2)return;try{const codes=await detector.detect(video);if(codes?.[0]?.rawValue){const raw=codes[0].rawValue;stopCamera();await processCode(raw,false);}}catch(_){}},450);
    }catch(err){alert('Não foi possível abrir a câmera: '+err.message);}
  }
  function stopCamera(){clearInterval(state.cameraTimer);state.cameraTimer=null;if(state.cameraStream)state.cameraStream.getTracks().forEach(t=>t.stop());state.cameraStream=null;$('scannerArea')?.classList.remove('show');}

  function flash(ok,title,message){
    const el=$('flash');if(!el)return;el.className=`flash show ${ok?'ok':'bad'}`;el.innerHTML=`<div class="flash-box"><b>${esc(title)}</b><span>${esc(message||'')}</span></div>`;tone(ok?'ok':'bad');setTimeout(()=>{el.className='flash';el.innerHTML='';},1300);
  }
  function tone(kind='scan'){
    try{const AC=window.AudioContext||window.webkitAudioContext;const ctx=new AC();const o=ctx.createOscillator();const g=ctx.createGain();o.frequency.value=kind==='bad'?180:kind==='scan'?620:780;g.gain.value=.05;o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.10);o.onended=()=>ctx.close();}catch(_){}
  }

  async function init(){
    setNetworkBadge();
    window.addEventListener('online',async()=>{setNetworkBadge();await syncQueue();if(!$('portariaApp').classList.contains('hidden')){await loadEvents();await refresh(false);}});
    window.addEventListener('offline',setNetworkBadge);
    await ensureDevice();
  }

  window.HypePortaria={changeEvent,refresh,search,processCode,toggleDocument,validate,temporaryExit,authorizeReentry,openPair,closePair,endReaders,prepareOffline,startCamera,stopCamera};
  document.addEventListener('DOMContentLoaded',init);
})();
