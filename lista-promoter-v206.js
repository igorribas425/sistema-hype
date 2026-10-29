(() => {
  'use strict';
  const config = window.HYPE_SUPABASE_CONFIG || {};
  const client = window.supabase?.createClient(config.url, config.anonKey);
  const $ = id => document.getElementById(id);
  const rows = data => Array.isArray(data) ? data : (data ? [data] : []);
  const digits = value => String(value || '').replace(/\D/g, '');
  const edgeUrl = `${config.url || ''}/functions/v1/promoter-guest-registration`;
  const promoterCode=String(new URLSearchParams(location.search).get('promoter')||'').trim().toUpperCase();
  let promoterValid=false;
  let events = [];
  let selectedEventId = 0;
  let cameraStream = null;
  let capturedPhoto = null;
  const status = (message, kind) => {
    const box = $('guestStatus');
    if (!box) return;
    box.className = `status show ${kind || ''}`;
    box.textContent = message;
  };
  const setCameraStatus = (message, kind) => {
    const box = $('guestCameraStatus');
    if (!box) return;
    box.className = `hint camera-status ${kind || ''}`;
    box.textContent = message;
  };
  const formatCpf = input => {
    const value = digits(input.value).slice(0, 11);
    input.value = value.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };
  const formatPhone = input => {
    const value = digits(input.value).slice(0, 11);
    input.value = value.length > 10
      ? value.replace(/(\d{2})(\d{5})(\d{1,4})/, '($1) $2-$3')
      : value.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3');
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const eventLabel = row => `${row.event_name || 'Evento HYPE'}${row.event_date ? ` • ${row.event_date}` : ''}`;
  function renderSelectedEvent() {
    const row = events.find(item => Number(item.event_id) === Number(selectedEventId));
    const event = $('guestEvent');
    const hidden = $('guestEventId');
    if (!row) {
      if (event) event.innerHTML = '<strong>Cadastro fechado</strong>Nenhuma festa está recebendo cadastros no momento.';
      if (hidden) hidden.value = '';
      return;
    }
    if (hidden) hidden.value = String(row.event_id);
    if (event) event.innerHTML = `<strong>${esc(row.event_name || 'HYPE LOUNGE CLUB')}</strong>${row.event_date ? `${esc(row.event_date)}` : ''}${row.venue ? ` • ${esc(row.venue)}` : ''}${row.description ? `<br><br>${esc(row.description)}` : ''}`;
    document.querySelectorAll('.event-choice').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.eventId) === Number(selectedEventId));
      button.setAttribute('aria-checked', Number(button.dataset.eventId) === Number(selectedEventId) ? 'true' : 'false');
    });
    document.querySelectorAll('.event-dot').forEach(dot => {
      dot.classList.toggle('active', Number(dot.dataset.eventId) === Number(selectedEventId));
    });
    updateEventNavigation();
  }
  function updateEventNavigation() {
    const index = events.findIndex(item => Number(item.event_id) === Number(selectedEventId));
    const disabled = events.length < 2;
    const previous = $('guestEventPrev');
    const next = $('guestEventNext');
    if (previous) previous.disabled = disabled || index <= 0;
    if (next) next.disabled = disabled || index < 0 || index >= events.length - 1;
  }
  function moveEvent(direction) {
    if (events.length < 2) return;
    const index = events.findIndex(item => Number(item.event_id) === Number(selectedEventId));
    const nextIndex = Math.max(0, Math.min(events.length - 1, (index < 0 ? 0 : index) + direction));
    const row = events[nextIndex];
    if (!row) return;
    selectedEventId = Number(row.event_id);
    renderSelectedEvent();
    document.querySelector(`.event-choice[data-event-id="${selectedEventId}"]`)?.scrollIntoView({behavior: 'smooth', inline: 'center', block: 'nearest'});
  }
  function renderEvents() {
    const submit = $('guestSubmit');
    // Cadastro público mostra as festas atuais e futuras, nunca festas encerradas.
    const p = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',
      minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).reduce((o,x)=>{
        if(x.type!=='literal')o[x.type]=x.value; return o;
      },{});
    const today=[p.year,p.month,p.day].join('-');
    const yesterdayDate=new Date(today+'T12:00:00Z');
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate()-1);
    const yesterday=yesterdayDate.toISOString().slice(0,10);
    const before8=Number(p.hour||0)<8;
    events=events.filter(row=>{
      if(row.active===false)return false;
      const day=String(row.event_date||'').slice(0,10);
      return /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        (day>=today||(before8&&day===yesterday));
    }).sort((a,b)=>String(a.event_date).localeCompare(String(b.event_date)));
    const preferred=new URLSearchParams(location.search).get('event');
    const chosen=events.find(row=>Number(row.event_id)===Number(preferred)) || events[0] || null;
    selectedEventId=chosen?Number(chosen.event_id):0;
    if (submit) submit.disabled = !chosen || !promoterValid;
    renderSelectedEvent();
    const cover = $('guestEventCover');
    if (cover) {
      if (chosen?.cover_image) {
        cover.src = chosen.cover_image;
        cover.hidden = false;
      } else {
        cover.hidden = true;
        cover.removeAttribute('src');
      }
    }
  }
  async function loadContext() {
    if (!client) return status('Não foi possível conectar ao cadastro HYPE.', 'error');
    try {
      if(!/^[A-Z0-9][A-Z0-9_-]{1,62}$/.test(promoterCode))throw Error('Use um link enviado por um promoter HYPE.');
       const checked=await client.rpc('public_invite_promoter_status_v207',{p_code:promoterCode});
       if(checked.error)throw checked.error;
       const promoter=rows(checked.data)[0];
       if(!promoter||promoter.active===false)throw Error('Este link de promoter foi desativado.');
       promoterValid=true;
       if($('guestPromoterName'))$('guestPromoterName').textContent='Convite de '+promoter.name;
       const {data, error} = await client.rpc('public_promoter_guest_events_v206');
      if (error) throw error;
      events = rows(data);
      renderEvents();
    } catch (error) {
      status(error?.message || 'Não foi possível consultar a lista.', 'error');
      if ($('guestSubmit')) $('guestSubmit').disabled = true;
    }
  }
  function stopCamera() {
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    const video = $('guestCameraPreview');
    if (video) video.srcObject = null;
  }
  function setPhotoFile(file) {
    if (!file) return;
    capturedPhoto = file;
    const input = $('guestPhoto');
    if (input) {
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
      } catch (_) {}
    }
    const preview = $('guestPhotoPreview');
    if (preview) {
      if (preview.dataset.url) URL.revokeObjectURL(preview.dataset.url);
      preview.dataset.url = URL.createObjectURL(file);
      preview.src = preview.dataset.url;
      preview.hidden = false;
    }
  }
  function resetCamera() {
    stopCamera();
    capturedPhoto = null;
    const input = $('guestPhoto');
    if (input) input.value = '';
    const preview = $('guestPhotoPreview');
    if (preview) {
      if (preview.dataset.url) URL.revokeObjectURL(preview.dataset.url);
      delete preview.dataset.url;
      preview.removeAttribute('src');
      preview.hidden = true;
    }
    const video = $('guestCameraPreview');
    if (video) video.hidden = true;
    $('guestCameraStart')?.removeAttribute('hidden');
    $('guestCameraCapture')?.setAttribute('hidden', '');
    $('guestCameraRetake')?.setAttribute('hidden', '');
    setCameraStatus('A câmera tira a selfie na hora. Se preferir, use um arquivo.');
  }
  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('Câmera indisponível neste dispositivo. Use um arquivo.', 'error');
      $('guestPhoto')?.click();
      return;
    }
    try {
      stopCamera();
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user', width: {ideal: 1280}, height: {ideal: 1280}},
        audio: false
      });
      const video = $('guestCameraPreview');
      video.srcObject = cameraStream;
      video.hidden = false;
      await video.play().catch(() => {});
      $('guestCameraStart')?.setAttribute('hidden', '');
      $('guestCameraCapture')?.removeAttribute('hidden');
      $('guestCameraRetake')?.setAttribute('hidden', '');
      setCameraStatus('Posicione o rosto e toque em TIRAR SELFIE.');
    } catch (_) {
      stopCamera();
      setCameraStatus('Não foi possível abrir a câmera. Use o botão USAR ARQUIVO.', 'error');
      $('guestPhoto')?.click();
    }
  }
  function captureSelfie() {
    const video = $('guestCameraPreview');
    const canvas = $('guestCameraCanvas');
    if (!video?.videoWidth || !video?.videoHeight || !canvas) {
      setCameraStatus('A câmera ainda está carregando.', 'error');
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) {
        setCameraStatus('Não foi possível capturar a selfie.', 'error');
        return;
      }
      setPhotoFile(new File([blob], 'selfie-hype.jpg', {type: 'image/jpeg'}));
      stopCamera();
      video.hidden = true;
      $('guestCameraCapture')?.setAttribute('hidden', '');
      $('guestCameraStart')?.setAttribute('hidden', '');
      $('guestCameraRetake')?.removeAttribute('hidden');
      setCameraStatus('Selfie capturada. Você pode enviar o cadastro.', 'ok');
    }, 'image/jpeg', 0.9);
  }
  function setupCamera() {
    $('guestCameraStart')?.addEventListener('click', openCamera);
    $('guestCameraCapture')?.addEventListener('click', captureSelfie);
    $('guestCameraRetake')?.addEventListener('click', () => {
      resetCamera();
      openCamera();
    });
    $('guestCameraFile')?.addEventListener('click', () => $('guestPhoto')?.click());
    $('guestPhoto')?.addEventListener('change', event => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      setPhotoFile(file);
      stopCamera();
      $('guestCameraPreview')?.setAttribute('hidden', '');
      $('guestCameraStart')?.setAttribute('hidden', '');
      $('guestCameraCapture')?.setAttribute('hidden', '');
      $('guestCameraRetake')?.removeAttribute('hidden');
      setCameraStatus('Foto selecionada. Você pode enviar o cadastro.', 'ok');
    });
  }
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = $('guestSubmit');
    if (capturedPhoto && !$('guestPhoto')?.files?.length) setPhotoFile(capturedPhoto);
    if (!form.reportValidity() || !client || !promoterValid) return;
    submitButton.disabled = true;
    submitButton.textContent = 'ENVIANDO...';
    try {
      const payload = new FormData(form);
      const photo = payload.get('photo');
      if ((!photo || !photo.size) && capturedPhoto) payload.set('photo', capturedPhoto);
      payload.set('event_id', String(selectedEventId || ''));
       payload.set('promoter_code',promoterCode);
      payload.set('photo_consent', $('guestPhotoConsent')?.checked ? 'true' : 'false');
      const response = await fetch(edgeUrl, {method: 'POST', body: payload});
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok !== true) throw new Error(body.error || body.message || 'Não foi possível concluir o cadastro.');
      status('Cadastro enviado! Agora está em análise. Depois de aprovado, o QR da Convidado Promoter normalmente chega no Gmail em após aprovação. Confira também Spam/Lixo eletrônico e apresente o QR Code na Portaria.', 'ok');
      const cta = $('guestTicketCta');
      const panel = $('guestForm')?.closest('.panel');
      if (panel) panel.style.display = 'none';
      if (cta) {
        cta.style.display = 'block';
        cta.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      form.reset();
      resetCamera();
      renderSelectedEvent();
    } catch (error) {
      status(error?.message || 'Não foi possível concluir o cadastro.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'ENVIAR PARA AVALIAÇÃO';
    }
  }
  $('guestCpf')?.addEventListener('input', event => formatCpf(event.currentTarget));
  $('guestPhone')?.addEventListener('input', event => formatPhone(event.currentTarget));
  // V82: sem carrossel e sem seleção de festa.
  setupCamera();
  $('guestForm')?.addEventListener('submit', submit);
  loadContext();
})();
