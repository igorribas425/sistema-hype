/* HYPE LOUNGE CLUB // PORTARIA V33 (base V32/V20)
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
    currentReaderLabel: '',
    readersTimer: null,
    contextTimer: null,
    linkExpiresAt: 0,
    readers: [],
    salesRows: [],
    currentOrder: null,
    lastEventId: 0,
    activeReaderCount: 0,
    paymentTimer: null
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
    if ($('readerLinkEmail')) $('readerLinkEmail').value = '';
    if ($('readerLinkText')) $('readerLinkText').value = '';
    state.currentReaderLabel = '';
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
      state.currentReaderLabel = result.reader_label || label || 'Celular leitor';
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

  async function sendReaderLinkEmail() {
    if (!isOnline()) return alert('Conecte à internet para enviar o link por e-mail.');
    const text = state.currentReaderLink || $('readerLinkText')?.value || '';
    const email = ($('readerLinkEmail')?.value || '').trim().toLowerCase();
    if (!text) return alert('Gere o link primeiro.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert('Digite um Gmail/e-mail válido.');
    const key = deviceKey();
    if (!key) return alert('Este computador ainda não está autorizado como Portaria.');
    const cfg = window.HYPE_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey) return alert('Supabase não configurado.');

    const btn = $('readerEmailSend');
    const oldText = btn?.textContent || '✉️ ENVIAR LINK POR GMAIL / E-MAIL';
    if (btn) { btn.disabled = true; btn.textContent = 'ENVIANDO...'; }
    try {
      const response = await fetch(`${cfg.url}/functions/v1/send-ticket-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.anonKey,
          'Authorization': `Bearer ${cfg.anonKey}`
        },
        body: JSON.stringify({
          action: 'reader_link',
          device_key: key,
          email,
          reader_link: text,
          reader_label: state.currentReaderLabel || ($('readerLinkLabel')?.value || '').trim() || 'Celular leitor'
        })
      });
      const raw = await response.text();
      let data = null;
      try { data = JSON.parse(raw); } catch (_) {}
      if (!response.ok || data?.ok !== true) throw new Error(data?.error || data?.erro || raw || 'Não foi possível enviar o e-mail.');
      if ($('readerLinkMeta')) $('readerLinkMeta').textContent = `✅ Link enviado para ${email}. Abra o e-mail somente no celular que será usado como leitor.`;
    } catch (err) {
      if ($('readerLinkMeta')) $('readerLinkMeta').textContent = `❌ ${err.message || 'Falha ao enviar por e-mail.'}`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldText; }
    }
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
  // PIX ASAAS — mesma cobrança automática usada no site
  // ------------------------------------------------------------------
  async function createAsaasPix(ticketId) {
    const cfg = window.HYPE_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');

    const response = await fetch(`${cfg.url}/functions/v1/asaas-pix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.anonKey,
        'Authorization': `Bearer ${cfg.anonKey}`
      },
      body: JSON.stringify({ticket_id:Number(ticketId)})
    });

    const data = await response.json().catch(()=>({}));
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || 'Não foi possível gerar o PIX no Asaas.');
    }
    if (!data?.qr_code) throw new Error('O Asaas não retornou o PIX Copia e Cola.');
    return data;
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
    if ($('v19DoorPrice')) $('v19DoorPrice').textContent = row ? (base <= 0 && gender === 'Feminino' ? '♀ FEMININO FREE — sem PIX e sem taxa' : `${money(base)} + taxa R$ 1,98 = ${money(total)}`) : 'Selecione um ingresso';
  }

  function cpfDigits(value) { return String(value || '').replace(/\D/g,'').slice(0,11); }

  function validCpf(value) {
    const cpf = cpfDigits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let sum = 0;
    for (let i=0;i<9;i++) sum += Number(cpf[i]) * (10-i);
    let d1 = (sum * 10) % 11; if (d1 === 10) d1 = 0;
    if (d1 !== Number(cpf[9])) return false;
    sum = 0;
    for (let i=0;i<10;i++) sum += Number(cpf[i]) * (11-i);
    let d2 = (sum * 10) % 11; if (d2 === 10) d2 = 0;
    return d2 === Number(cpf[10]);
  }

  function maskedCpf(value) {
    const d = cpfDigits(value);
    return d.length === 11 ? `***.***.***-${d.slice(-2)}` : 'CPF não informado';
  }

  async function createDoorOrder() {
    if (!isOnline()) return notify('Venda na hora precisa de internet para gerar o PIX do Asaas.', false);
    const eventId = currentEventId();
    const lotId = Number($('v19DoorLot')?.value || 0);
    const cpf = cpfDigits($('v19DoorCpf')?.value || '');
    const gender = $('v19DoorGender')?.value || 'Feminino';
    if (!eventId) return notify('Selecione o evento na parte de cima.', false);
    if (!lotId) return notify('Selecione o ingresso.', false);
    if (!validCpf(cpf)) return notify('Digite um CPF válido com 11 números.', false);

    // A venda de balcão não exige nome/Gmail/WhatsApp. O sistema cria um nome
    // operacional só para manter o ingresso e a cobrança organizados.
    const name = `Cliente Portaria • CPF final ${cpf.slice(-4)}`;

    const btn = $('v19DoorCreate');
    if (btn) { btn.disabled=true; btn.textContent='PROCESSANDO VENDA...'; }
    try {
      const result = rows(await rpc('portaria_device_create_door_order_v19',{
        p_device_key:deviceKey(),
        p_event_id:eventId,
        p_lot_id:lotId,
        p_name:name,
        p_phone:null,
        p_cpf:cpf,
        p_email:null,
        p_gender:gender
      }))[0];
      if (!result?.ticket_id) throw new Error('A venda não foi criada.');

      if (result.payment_status === 'Pago' && Number(result.price || 0) <= 0 && String(result.gender || '').toLowerCase().startsWith('f')) {
        const order = { ...result, payment_status:'Pago', asaas_pix:'', asaas_qr_base64:null, asaas_payment_id:null };
        state.currentOrder = order;
        renderDoorOrder(order, true);
        notify(`♀ ${result.ticket_code} liberado como FEMININO FREE. Nenhum PIX foi gerado.`, true);
        await loadSalesContext();
        if (window.HypePortaria?.refresh) window.HypePortaria.refresh(false).catch?.(()=>{});
        return;
      }

      const payment = await createAsaasPix(result.ticket_id);
      const order = {
        ...result,
        payment_status:'Pendente',
        asaas_payment_id:payment.payment_id || null,
        asaas_pix:payment.qr_code || '',
        asaas_qr_base64:payment.qr_code_base64 || null,
        asaas_expiration:payment.expiration_date || null
      };

      state.currentOrder = order;
      renderDoorOrder(order, false);
      startDoorPaymentWatch();
      notify(`PIX Asaas do pedido ${result.ticket_code} gerado. A confirmação é automática.`, true);
      await loadSalesContext();
    } catch (err) {
      notify(err.message || 'Erro ao gerar PIX no Asaas.', false);
    } finally {
      if (btn) { btn.disabled=false; btn.textContent='💠 GERAR PIX / LIBERAR FREE'; }
    }
  }

  function renderDoorOrder(order, paid) {
    const box = $('v19DoorResult');
    if (!box) return;
    box.classList.add('show');

    const isPaid = paid || order.payment_status === 'Pago';
    const pix = String(order.asaas_pix || '');
    const qrBase64 = order.asaas_qr_base64 ? String(order.asaas_qr_base64) : '';

    box.innerHTML = `
      <div class="v19-order-head">
        <div><small>VENDA NA HORA • ${Number(order.price||0)<=0?'FEMININO FREE':'PIX ASAAS'}</small><strong>${esc(maskedCpf(order.cpf||''))}</strong><span>${esc(order.ticket_code||'')}</span></div>
        <div class="v19-order-status ${isPaid?'paid':'pending'}">${isPaid?'PAGO':'AGUARDANDO ASAAS'}</div>
      </div>
      <div class="v19-order-grid">
        ${!isPaid ? `<div class="v19-qr-block"><h4>1. CLIENTE PAGA O PIX DO ASAAS</h4>${pix?`<img id="v19PixQr" alt="QR PIX Asaas"><textarea id="v19PixPayload" readonly>${esc(pix)}</textarea><button class="btn" onclick="HypeV20.copyPix()">COPIAR PIX COPIA E COLA</button>`:'<div class="v19-reader-empty">PIX do Asaas ainda não foi carregado.</div>'}</div>` : ''}
        <div class="v19-order-info">
          <p><b>Evento:</b> ${esc(order.event_name||$('v19DoorEventName')?.textContent||'')}</p>
          <p><b>Ingresso:</b> ${esc(order.lot_name||'')} • ${esc(order.sector||'')}</p>
          <p><b>Valor:</b> ${Number(order.price||0)<=0?'FREE':money(order.price)}</p>
          <p><b>Gênero:</b> ${esc(order.gender||'')}</p>
          ${order.raffle_enabled ? `<p class="v19-raffle-ok">🎁 Quando o Asaas confirmar como PAGO, este ingresso entra automaticamente no sorteio: <b>${esc(order.raffle_prize||'prêmio do evento')}</b>.</p>` : '<p class="v19-muted">Sorteio do evento desativado.</p>'}
          ${isPaid
            ? (Number(order.price||0)<=0 ? '<p class="v19-paid-note">✅ Feminino FREE. Ingresso liberado sem PIX.</p>' : '<p class="v19-paid-note">✅ Asaas confirmou o pagamento. O ingresso já está liberado.</p>')
            : '<p class="v19-muted">⏳ Não precisa confirmar manualmente. Esta tela verifica o pagamento e o webhook do Asaas libera o ingresso automaticamente.</p>'}
        </div>
      </div>
      ${isPaid
        ? `<div class="v19-ticket-qr"><h4>2. QR DO INGRESSO</h4><img id="v19TicketQr" alt="QR do ingresso"><strong>${esc(order.ticket_code||'')}</strong><button class="btn green" onclick="HypeV20.showDoorTicketInPortaria()">✅ CONFIRMAR ENTRADA AGORA</button></div>`
        : `<div class="v19-order-actions"><button class="btn green" onclick="HypeV20.confirmDoorPayment()">↻ VERIFICAR PAGAMENTO NO ASAAS</button><button class="btn red" onclick="HypeV20.cancelDoorOrder()">CANCELAR PEDIDO</button></div>`}
      <button class="btn v19-new-sale" onclick="HypeV20.resetDoorSale()">+ NOVA VENDA NA HORA</button>`;

    if (!isPaid && pix && $('v19PixQr')) {
      if (qrBase64) {
        $('v19PixQr').src = qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`;
      } else {
        $('v19PixQr').src = window.HypeQRCode.toDataUrl(pix, 300);
      }
    }
    if (isPaid && $('v19TicketQr')) $('v19TicketQr').src = window.HypeQRCode.toDataUrl(order.qr_token || order.ticket_code, 300);
  }

  async function copyPix() {
    const text = $('v19PixPayload')?.value || '';
    if (!text) return;
    try { await navigator.clipboard.writeText(text); notify('PIX Copia e Cola do Asaas copiado.', true); }
    catch (_) { $('v19PixPayload')?.select(); document.execCommand?.('copy'); notify('PIX Copia e Cola do Asaas copiado.', true); }
  }

  async function refreshDoorPayment(showMessage = false) {
    const order = state.currentOrder;
    if (!order?.ticket_code) return false;
    try {
      const found = rows(await rpc('public_get_ticket',{p_code:order.ticket_code}))[0];
      if (!found) return false;

      state.currentOrder = {
        ...order,
        ...found,
        asaas_pix:order.asaas_pix,
        asaas_qr_base64:order.asaas_qr_base64,
        asaas_payment_id:order.asaas_payment_id
      };

      if (found.payment_status === 'Pago') {
        clearInterval(state.paymentTimer);
        state.paymentTimer = null;
        renderDoorOrder(state.currentOrder, true);
        notify('✅ Pagamento confirmado automaticamente pelo Asaas. Ingresso liberado.', true);
        if (window.HypePortaria?.refresh) window.HypePortaria.refresh(false).catch?.(()=>{});
        loadSalesContext().catch(()=>{});
        return true;
      }

      if (found.payment_status === 'Cancelado') {
        clearInterval(state.paymentTimer);
        state.paymentTimer = null;
        notify('Pedido cancelado.', false);
        return false;
      }

      if (showMessage) notify('O Asaas ainda não confirmou este PIX.', false);
      return false;
    } catch (err) {
      if (showMessage) notify(err.message || 'Não foi possível verificar o pagamento.', false);
      return false;
    }
  }

  function startDoorPaymentWatch() {
    clearInterval(state.paymentTimer);
    state.paymentTimer = setInterval(() => {
      if (!state.currentOrder?.ticket_id || document.hidden) return;
      refreshDoorPayment(false).catch(()=>{});
    }, 2500);
    refreshDoorPayment(false).catch(()=>{});
  }

  // Mantém compatibilidade com telas antigas: agora este botão só CONSULTA o status.
  async function confirmDoorPayment() {
    return refreshDoorPayment(true);
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
    clearInterval(state.paymentTimer);
    state.paymentTimer = null;
    state.currentOrder = null;
    $('v19DoorResult')?.classList.remove('show');
    if ($('v19DoorResult')) $('v19DoorResult').innerHTML='';
    ['v19DoorCpf'].forEach(id=>{if($(id))$(id).value='';});
    notify('Pronto para uma nova venda na hora.', true);
    $('v19DoorCpf')?.focus();
  }

  function showDoorTicketInPortaria() {
    const order = state.currentOrder;
    if (!order?.ticket_code) return;
    window.HypePortaria?.processCode?.(order.ticket_code,true);
    $('results')?.scrollIntoView({behavior:'smooth',block:'center'});
  }

  async function eventChanged() {
    clearInterval(state.paymentTimer);
    state.paymentTimer = null;
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
    openReaderLink, closeReaderLink, generateReaderLink, copyReaderLink, shareReaderLink, sendReaderLinkEmail, loadReaders, disconnectReader, endAllReaders,
    loadSalesContext, updateDoorPrice, createDoorOrder, copyPix, refreshDoorPayment, confirmDoorPayment,
    cancelDoorOrder, resetDoorSale, showDoorTicketInPortaria, eventChanged
  };

  document.addEventListener('DOMContentLoaded', init);
})();
