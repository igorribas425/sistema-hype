/* HYPE LOUNGE CLUB // PORTARIA V20
   - Computador continua usando portaria.html autorizado pelo Admin
   - Celulares recebem LINK EXCLUSIVO e abrem somente a camera/leitor
   - Link de ativacao e de uso unico; depois a sessao fica presa ao celular
   - Lista de leitores aparece em tempo real no computador
   - Venda na hora do show com PIX cadastrado no evento
   - Porteiro confirma SOMENTE vendas criadas neste computador da Portaria
   - Venda paga entra automaticamente no sorteio; sorteio continua apenas no Admin
*/
(() => {
  'use strict';

  const DEVICE_KEY = 'hype_portaria_device_key_v18';
  const state = {
    sb: null,
    linkBusy: false,
    currentReaderLink: '',
    readersTimer: null,
    contextTimer: null,
    linkExpiresAt: 0,
    readers: [],
    salesRows: [],
    currentOrder: null,
    lastEventId: 0,
    activeReaderCount: 0
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money = value => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  const rows = data => Array.isArray(data) ? data : (data ? [data] : []);
  const deviceKey = () => localStorage.getItem(DEVICE_KEY) || '';
  const isOnline = () => navigator.onLine !== false;

  function client() {
    if (state.sb) return state.sb;
    const cfg = window.HYPE_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');
    if (!window.supabase?.createClient) throw new Error('Biblioteca do Supabase não carregou.');
    state.sb = window.supabase.createClient(cfg.url, cfg.anonKey, {auth:{persistSession:false}});
    return state.sb;
  }

  async function rpc(name, params = {}) {
    const {data, error} = await client().rpc(name, params);
    if (error) throw new Error(error.message || `Erro em ${name}`);
    return data;
  }

  function randomSecret(bytes = 24) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2,'0')).join('');
  }

  function relativeTime(value) {
    if (!value) return 'ainda não leu QR';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'sem leitura';
    const diff = Math.max(0, Date.now() - d.getTime());
    if (diff < 5000) return 'agora';
    if (diff < 60000) return `há ${Math.floor(diff/1000)}s`;
    if (diff < 3600000) return `há ${Math.floor(diff/60000)}min`;
    return `às ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
  }

  function notify(text, ok = true) {
    const box = $('v19DoorNotice');
    if (box) {
      box.textContent = text;
      box.className = `v19-notice ${ok ? 'ok' : 'bad'}`;
    }
  }

  // ------------------------------------------------------------------
  // CELULARES LEITORES POR LINK EXCLUSIVO
  // ------------------------------------------------------------------
  function openReaderLink() {
    if (!isOnline()) return alert('Conecte à internet para gerar o link do celular leitor.');
    if ($('readerLinkLabel')) $('readerLinkLabel').value = '';
    if ($('readerLinkText')) $('readerLinkText').value = '';
    if ($('readerLinkMeta')) $('readerLinkMeta').textContent = 'Digite um nome opcional e gere o link. O link serve apenas para ativar a câmera deste leitor.';
    state.currentReaderLink = '';
    $('readerLinkModal')?.classList.add('show');
    setTimeout(()=>$('readerLinkLabel')?.focus(),120);
  }

  function closeReaderLink() {
    $('readerLinkModal')?.classList.remove('show');
  }

  async function generateReaderLink() {
    if (state.linkBusy || !isOnline()) return;
    const key = deviceKey();
    if (!key) return alert('Este computador ainda não está autorizado como Portaria.');
    state.linkBusy = true;
    const btn = $('readerLinkGenerate');
    if (btn) { btn.disabled = true; btn.textContent = 'GERANDO...'; }
    try {
      const token = randomSecret(32);
      const label = ($('readerLinkLabel')?.value || '').trim();
      const result = rows(await rpc('portaria_device_create_reader_link_v20', {
        p_device_key: key,
        p_link_token: token,
        p_reader_label: label || null
      }))[0];
      if (!result?.reader_id) throw new Error('Não foi possível gerar o link do leitor.');
      const url = new URL('leitor.html', location.href);
      url.searchParams.set('reader', token);
      if (result.reader_label) url.searchParams.set('name', result.reader_label);
      state.currentReaderLink = url.toString();
      state.linkExpiresAt = new Date(result.link_expires_at).getTime();
      if ($('readerLinkText')) $('readerLinkText').value = state.currentReaderLink;
      if ($('readerLinkMeta')) $('readerLinkMeta').textContent = `Link exclusivo para ${result.reader_label || 'celular leitor'} • ativa uma única vez • expira em 15 minutos se não for aberto • depois o celular trabalha por até 16 horas.`;
    } catch (err) {
      if ($('readerLinkMeta')) $('readerLinkMeta').textContent = err.message || 'Falha ao gerar link.';
    } finally {
      state.linkBusy = false;
      if (btn) { btn.disabled = false; btn.textContent = 'GERAR LINK EXCLUSIVO'; }
    }
  }

  async function copyReaderLink() {
    const text = state.currentReaderLink || $('readerLinkText')?.value || '';
    if (!text) return alert('Gere o link primeiro.');
    try {
      await navigator.clipboard.writeText(text);
      if ($('readerLinkMeta')) $('readerLinkMeta').textContent = '✅ Link copiado. Envie para o celular do porteiro. Ao abrir, ele verá somente a câmera do leitor.';
    } catch (_) {
      $('readerLinkText')?.select();
      document.execCommand?.('copy');
      if ($('readerLinkMeta')) $('readerLinkMeta').textContent = '✅ Link copiado.';
    }
  }

  async function shareReaderLink() {
    const text = state.currentReaderLink || $('readerLinkText')?.value || '';
    if (!text) return alert('Gere o link primeiro.');
    if (navigator.share) {
      try {
        await navigator.share({title:'HYPE // Leitor da Portaria',text:'Abra este link somente no celular que será usado como leitor da Portaria:',url:text});
        return;
      } catch (_) {}
    }
    await copyReaderLink();
  }

  async function loadReaders() {
    const box = $('v19ReaderList');
    if (!box || !isOnline() || !deviceKey()) return;
    try {
      const data = rows(await rpc('portaria_device_list_readers_v19', {p_device_key:deviceKey()}));
      state.readers = data;
      const active = data.filter(r => r.active);
      state.activeReaderCount = active.length;
      const badge = $('readerBadge');
      if (badge) {
        badge.textContent = active.length ? `${active.length} LEITOR${active.length>1?'ES':''} ATIVO${active.length>1?'S':''}` : 'SEM LEITOR';
        badge.className = `pill ${active.length ? 'on' : ''}`;
      }
      if (!data.length) {
        box.innerHTML = '<div class="v19-reader-empty">Nenhum celular leitor ativo. Clique em <b>+ GERAR LINK DO CELULAR</b>.</div>';
        return;
      }
      box.innerHTML = data.map(r => `
        <div class="v19-reader ${r.active ? 'on' : 'off'}">
          <div class="v19-reader-main">
            <span class="v19-reader-dot"></span>
            <div><strong>${esc(r.reader_label || 'Celular leitor')}</strong><small>${r.active ? 'LEITOR ATIVO' : 'ENCERRADO'} • última leitura ${esc(relativeTime(r.last_scan_at))}</small></div>
          </div>
          ${r.active ? `<button class="btn red v19-reader-disconnect" onclick="HypeV20.disconnectReader('${esc(r.reader_id)}')">BLOQUEAR</button>` : ''}
        </div>`).join('');
    } catch (err) {
      if (!/autorizado/i.test(String(err.message||''))) box.innerHTML = `<div class="v19-reader-empty">${esc(err.message||'Falha ao carregar leitores.')}</div>`;
    }
  }

  async function disconnectReader(id) {
    if (!confirm('Bloquear este celular leitor agora? Ele perderá o acesso à câmera da Portaria.')) return;
    try {
      await rpc('portaria_device_disconnect_reader_v19',{p_device_key:deviceKey(),p_reader_id:id});
      await loadReaders();
    } catch (err) { alert(err.message || 'Falha ao bloquear o celular.'); }
  }

  async function endAllReaders() {
    if (!confirm('Bloquear TODOS os celulares leitores conectados a este computador?')) return;
    try {
      await rpc('portaria_device_end_readers_v18',{p_device_key:deviceKey()});
      closeReaderLink();
      await loadReaders();
    } catch (err) { alert(err.message || 'Falha ao encerrar leitores.'); }
  }

  // ------------------------------------------------------------------
  // PIX BR CODE
  // ------------------------------------------------------------------
  function normalizePixText(value, max) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^A-Za-z0-9 .\-]/g,' ')
      .replace(/\s+/g,' ').trim().toUpperCase().slice(0,max);
  }
  function tlv(id, value) {
    const s = String(value ?? '');
    return id + String(s.length).padStart(2,'0') + s;
  }
  function crc16(payload) {
    let crc = 0xFFFF;
    for (let i=0;i<payload.length;i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j=0;j<8;j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4,'0');
  }
  function pixPayload(key, amount, txid) {
    const cleanKey = String(key || '').trim();
    if (!cleanKey) throw new Error('Chave PIX não cadastrada neste evento.');
    const account = tlv('00','BR.GOV.BCB.PIX') + tlv('01',cleanKey);
    const merchant = normalizePixText('HYPE LOUNGE CLUB',25) || 'HYPE';
    const city = normalizePixText('PASSO FUNDO',15) || 'PASSO FUNDO';
    const safeTxid = normalizePixText(txid || 'HYPE',25).replace(/ /g,'') || 'HYPE';
    let payload = '';
    payload += tlv('00','01');
    payload += tlv('26',account);
    payload += tlv('52','0000');
    payload += tlv('53','986');
    payload += tlv('54',Number(amount||0).toFixed(2));
    payload += tlv('58','BR');
    payload += tlv('59',merchant);
    payload += tlv('60',city);
    payload += tlv('62',tlv('05',safeTxid));
    payload += '6304';
    return payload + crc16(payload);
  }

  // ------------------------------------------------------------------
  // VENDA NA HORA
  // ------------------------------------------------------------------
  function currentEventId() { return Number($('eventSelect')?.value || 0); }

  async function loadSalesContext() {
    const eventId = currentEventId();
    if (!eventId || !isOnline() || !deviceKey()) return;
    try {
      const data = rows(await rpc('portaria_device_sales_context_v19',{
        p_device_key:deviceKey(),
        p_event_id:eventId
      }));
      state.salesRows = data;
      const lot = $('v19DoorLot');
      if (!lot) return;
      const now = Date.now();
      const usable = data.filter(r => {
        if (!r.active) return false;
        if (r.starts_at && new Date(r.starts_at).getTime() > now) return false;
        if (r.ends_at && new Date(r.ends_at).getTime() <= now) return false;
        if (r.quantity_available !== null && Number(r.quantity_available) <= 0) return false;
        return true;
      });
      lot.innerHTML = usable.length ? usable.map(r => `<option value="${Number(r.lot_id)}">${esc(r.lot_name||'Ingresso')} • ${esc(r.sector||'')}</option>`).join('') : '<option value="">Nenhum ingresso disponível</option>';
      const event = data[0];
      if ($('v19DoorEventName')) $('v19DoorEventName').textContent = event ? (event.event_name || 'Evento HYPE') : 'Evento sem venda disponível';
      if ($('v19DoorRaffleHint')) {
        $('v19DoorRaffleHint').textContent = event?.raffle_enabled
          ? `🎁 Sorteio ativo: ${event.raffle_prize || 'prêmio do evento'}. O nome entra automaticamente após o PIX ser confirmado.`
          : 'Sorteio deste evento está desativado no Admin.';
      }
      updateDoorPrice();
    } catch (err) {
      state.salesRows = [];
      if ($('v19DoorLot')) $('v19DoorLot').innerHTML='<option value="">Erro ao carregar ingressos</option>';
      notify(err.message || 'Falha ao carregar venda na hora.', false);
    }
  }

  function selectedSalesRow() {
    const id = Number($('v19DoorLot')?.value || 0);
    return state.salesRows.find(r => Number(r.lot_id) === id) || null;
  }

  function updateDoorPrice() {
    const row = selectedSalesRow();
    const gender = $('v19DoorGender')?.value || 'Feminino';
    const base = Number(gender === 'Masculino' ? row?.price_male : row?.price_female) || 0;
    const total = base > 0 ? base + 1.98 : 0;
    if ($('v19DoorPrice')) $('v19DoorPrice').textContent = row ? `${money(base)} + taxa R$ 1,98 = ${money(total)}` : 'Selecione um ingresso';
  }

  async function createDoorOrder() {
    if (!isOnline()) return notify('Venda na hora precisa de internet para gerar e registrar o PIX.', false);
    const eventId = currentEventId();
    const lotId = Number($('v19DoorLot')?.value || 0);
    const name = $('v19DoorName')?.value.trim() || '';
    if (!eventId) return notify('Selecione o evento na parte de cima.', false);
    if (!lotId) return notify('Selecione o ingresso.', false);
    if (!name) return notify('Digite o nome da pessoa.', false);

    const btn = $('v19DoorCreate');
    if (btn) { btn.disabled=true; btn.textContent='GERANDO PIX...'; }
    try {
      const result = rows(await rpc('portaria_device_create_door_order_v19',{
        p_device_key:deviceKey(),
        p_event_id:eventId,
        p_lot_id:lotId,
        p_name:name,
        p_phone:$('v19DoorPhone')?.value.trim() || null,
        p_cpf:$('v19DoorCpf')?.value.trim() || null,
        p_email:$('v19DoorEmail')?.value.trim() || null,
        p_gender:$('v19DoorGender')?.value || 'Feminino'
      }))[0];
      if (!result?.ticket_id) throw new Error('A venda não foi criada.');
      state.currentOrder = result;
      renderDoorOrder(result, false);
      notify(`Pedido ${result.ticket_code} criado. Aguarde o cliente pagar o PIX.`, true);
      await loadSalesContext();
    } catch (err) { notify(err.message || 'Erro ao criar venda na hora.', false); }
    finally { if (btn) { btn.disabled=false; btn.textContent='💠 GERAR PIX — VENDA NA HORA'; } }
  }

  function renderDoorOrder(order, paid) {
    const box = $('v19DoorResult');
    if (!box) return;
    box.classList.add('show');
    const isPaid = paid || order.payment_status === 'Pago';
    let pix = '';
    try { pix = pixPayload(order.pix_key || state.salesRows[0]?.pix_key, order.price, `HYPE${order.ticket_id}`); }
    catch (err) { if (!isPaid) notify(err.message, false); }

    box.innerHTML = `
      <div class="v19-order-head">
        <div><small>VENDA NA HORA DO SHOW • PORTARIA</small><strong>${esc(order.customer_name||'Cliente')}</strong><span>${esc(order.ticket_code||'')}</span></div>
        <div class="v19-order-status ${isPaid?'paid':'pending'}">${isPaid?'PAGO':'AGUARDANDO PIX'}</div>
      </div>
      <div class="v19-order-grid">
        ${!isPaid ? `<div class="v19-qr-block"><h4>1. CLIENTE PAGA ESTE PIX</h4>${pix?`<img id="v19PixQr" alt="QR PIX"><textarea id="v19PixPayload" readonly>${esc(pix)}</textarea><button class="btn" onclick="HypeV20.copyPix()">COPIAR PIX COPIA E COLA</button>`:'<div class="v19-reader-empty">Chave PIX não cadastrada.</div>'}</div>` : ''}
        <div class="v19-order-info">
          <p><b>Evento:</b> ${esc(order.event_name||$('v19DoorEventName')?.textContent||'')}</p>
          <p><b>Ingresso:</b> ${esc(order.lot_name||'')} • ${esc(order.sector||'')}</p>
          <p><b>Valor:</b> ${money(order.price)}</p>
          <p><b>Gênero:</b> ${esc(order.gender||'')}</p>
          ${order.raffle_enabled ? `<p class="v19-raffle-ok">🎁 Após ficar PAGO, este nome participa automaticamente do sorteio: <b>${esc(order.raffle_prize||'prêmio do evento')}</b>.</p>` : '<p class="v19-muted">Sorteio do evento desativado.</p>'}
          ${isPaid ? '<p class="v19-paid-note">✅ Pagamento confirmado. O ingresso já está válido na Portaria.</p>' : '<p class="v19-muted">O porteiro deve conferir o recebimento antes de confirmar. Esta tela só confirma vendas criadas aqui na Portaria.</p>'}
        </div>
      </div>
      ${isPaid ? `<div class="v19-ticket-qr"><h4>2. QR DO INGRESSO</h4><img id="v19TicketQr" alt="QR do ingresso"><strong>${esc(order.ticket_code||'')}</strong><button class="btn green" onclick="HypeV20.showDoorTicketInPortaria()">MOSTRAR NA PORTARIA / CONFIRMAR ENTRADA</button></div>` : `<div class="v19-order-actions"><button class="btn green" onclick="HypeV20.confirmDoorPayment()">✅ CONFIRMAR PIX DESTA VENDA</button><button class="btn red" onclick="HypeV20.cancelDoorOrder()">CANCELAR PEDIDO</button></div>`}
      <button class="btn v19-new-sale" onclick="HypeV20.resetDoorSale()">+ NOVA VENDA NA HORA</button>`;

    if (!isPaid && pix && $('v19PixQr')) $('v19PixQr').src = window.HypeQRCode.toDataUrl(pix, 300);
    if (isPaid && $('v19TicketQr')) $('v19TicketQr').src = window.HypeQRCode.toDataUrl(order.qr_token || order.ticket_code, 300);
  }

  async function copyPix() {
    const text = $('v19PixPayload')?.value || '';
    if (!text) return;
    try { await navigator.clipboard.writeText(text); notify('PIX Copia e Cola copiado.', true); }
    catch (_) { $('v19PixPayload')?.select(); document.execCommand?.('copy'); notify('PIX Copia e Cola copiado.', true); }
  }

  async function confirmDoorPayment() {
    const order = state.currentOrder;
    if (!order?.ticket_id) return;
    if (!confirm(`Você conferiu no banco que o PIX de ${money(order.price)} foi recebido?\n\nSó confirme depois que o dinheiro aparecer.`)) return;
    try {
      const result = rows(await rpc('portaria_device_confirm_door_payment_v19',{
        p_device_key:deviceKey(),
        p_ticket_id:Number(order.ticket_id)
      }))[0];
      state.currentOrder = {...order,...result,payment_status:'Pago'};
      renderDoorOrder(state.currentOrder, true);
      notify('PIX confirmado. Ingresso liberado e participante incluído no sorteio se ele estiver ativo.', true);
      if (window.HypePortaria?.refresh) window.HypePortaria.refresh(false).catch?.(()=>{});
    } catch (err) { notify(err.message || 'Falha ao confirmar o pagamento.', false); }
  }

  async function cancelDoorOrder() {
    const order = state.currentOrder;
    if (!order?.ticket_id) return;
    if (!confirm(`Cancelar o pedido ${order.ticket_code}?`)) return;
    try {
      await rpc('portaria_device_cancel_door_order_v19',{p_device_key:deviceKey(),p_ticket_id:Number(order.ticket_id)});
      resetDoorSale();
      notify('Pedido cancelado.', true);
      await loadSalesContext();
    } catch (err) { notify(err.message || 'Falha ao cancelar o pedido.', false); }
  }

  function resetDoorSale() {
    state.currentOrder = null;
    $('v19DoorResult')?.classList.remove('show');
    if ($('v19DoorResult')) $('v19DoorResult').innerHTML='';
    ['v19DoorName','v19DoorPhone','v19DoorCpf','v19DoorEmail'].forEach(id=>{if($(id))$(id).value='';});
    notify('Pronto para uma nova venda na hora.', true);
    $('v19DoorName')?.focus();
  }

  function showDoorTicketInPortaria() {
    const order = state.currentOrder;
    if (!order?.ticket_code) return;
    window.HypePortaria?.processCode?.(order.ticket_code,false);
    $('results')?.scrollIntoView({behavior:'smooth',block:'center'});
  }

  async function eventChanged() {
    state.currentOrder = null;
    $('v19DoorResult')?.classList.remove('show');
    await loadSalesContext();
  }

  function init() {
    clearInterval(state.readersTimer);
    clearInterval(state.contextTimer);
    state.readersTimer = setInterval(() => {
      if (!$('portariaApp')?.classList.contains('hidden')) loadReaders().catch(()=>{});
    }, 2500);
    state.contextTimer = setInterval(() => {
      if ($('portariaApp')?.classList.contains('hidden')) return;
      const id = currentEventId();
      if (id && id !== state.lastEventId) {
        state.lastEventId = id;
        loadSalesContext().catch(()=>{});
      }
    }, 900);
    setTimeout(()=>{loadReaders().catch(()=>{});loadSalesContext().catch(()=>{});},1600);
  }

  window.HypeV20 = {
    openReaderLink, closeReaderLink, generateReaderLink, copyReaderLink, shareReaderLink, loadReaders, disconnectReader, endAllReaders,
    loadSalesContext, updateDoorPrice, createDoorOrder, copyPix, confirmDoorPayment,
    cancelDoorOrder, resetDoorSale, showDoorTicketInPortaria, eventChanged
  };

  document.addEventListener('DOMContentLoaded', init);
})();
