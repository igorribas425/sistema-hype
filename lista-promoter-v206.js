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
  // V208: câmera frontal com fallback nativo iOS/Android e JPEG padronizado.
  const PHOTO_LIMIT=5*1024*1024;
  let cameraOpening=false,photoBusy=false;
  function stopCamera(){
    if(cameraStream)cameraStream.getTracks().forEach(t=>t.stop());
    cameraStream=null;
    const video=$('guestCameraPreview');
    if(video){video.pause();video.srcObject=null;}
  }
  function setPhotoFile(file){
    capturedPhoto=file;
    const preview=$('guestPhotoPreview');
    if(preview){
      if(preview.dataset.url)URL.revokeObjectURL(preview.dataset.url);
      preview.dataset.url=URL.createObjectURL(file);
      preview.src=preview.dataset.url;
      preview.hidden=false;
    }
    stopCamera();
    $('guestCameraPreview')?.setAttribute('hidden','');
    $('guestCameraStart')?.setAttribute('hidden','');
    $('guestCameraCapture')?.setAttribute('hidden','');
    $('guestCameraRetake')?.removeAttribute('hidden');
    setCameraStatus('Selfie pronta! Confira se seu rosto aparece bem na foto.','ok');
  }
  function resetCamera(){
    stopCamera();capturedPhoto=null;
    for(const id of ['guestPhoto','guestPhotoGallery']){const f=$(id);if(f)f.value='';}
    const p=$('guestPhotoPreview');
    if(p){if(p.dataset.url)URL.revokeObjectURL(p.dataset.url);delete p.dataset.url;p.removeAttribute('src');p.hidden=true;}
    $('guestCameraPreview')?.setAttribute('hidden','');
    $('guestCameraStart')?.removeAttribute('hidden');
    $('guestCameraCapture')?.setAttribute('hidden','');
    $('guestCameraRetake')?.setAttribute('hidden','');
    setCameraStatus('Abra a câmera, tire foto no celular ou escolha da galeria. Funciona no Android e no iPhone.');
  }
  async function openCamera(){
    if(cameraOpening)return;
    if(!navigator.mediaDevices?.getUserMedia||!window.isSecureContext){
      setCameraStatus('Câmera ao vivo indisponível. Use TIRAR FOTO NO CELULAR ou ESCOLHER DA GALERIA.','error');
      return;
    }
    cameraOpening=true;
    try{
      stopCamera();
      setCameraStatus('Solicitando acesso à câmera frontal...');
      try{
        cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:960}},audio:false});
      }catch(e){
        if(e?.name!=='OverconstrainedError'&&e?.name!=='NotFoundError')throw e;
        cameraStream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      }
      const video=$('guestCameraPreview');
      if(!video)throw Error('Prévia indisponível.');
      video.setAttribute('playsinline','');
      video.setAttribute('webkit-playsinline','');
      video.muted=true;
      video.srcObject=cameraStream;
      video.hidden=false;
      await video.play();
      $('guestCameraStart')?.setAttribute('hidden','');
      $('guestCameraCapture')?.removeAttribute('hidden');
      $('guestCameraRetake')?.setAttribute('hidden','');
      setCameraStatus('Posicione o rosto e toque em TIRAR SELFIE.');
    }catch(e){
      stopCamera();
      $('guestCameraPreview')?.setAttribute('hidden','');
      const denied=e?.name==='NotAllowedError'||e?.name==='PermissionDeniedError';
      setCameraStatus(denied?'Permissão negada. Autorize a câmera no Safari/Chrome ou use TIRAR FOTO NO CELULAR.':'Não foi possível abrir a câmera ao vivo. Toque em TIRAR FOTO NO CELULAR ou ESCOLHER DA GALERIA.','error');
    }finally{cameraOpening=false;}
  }
  function canvasJpeg(canvas){
    return new Promise((resolve,reject)=>{
      if(!canvas.toBlob)return reject(Error('Seu navegador não conseguiu preparar a imagem.'));
      canvas.toBlob(blob=>{
        if(!blob||!blob.size)return reject(Error('A foto não pôde ser processada.'));
        if(blob.size>PHOTO_LIMIT)return reject(Error('A selfie ficou grande demais. Tire outra foto.'));
        resolve(new File([blob],'selfie-hype.jpg',{type:'image/jpeg'}));
      },'image/jpeg',0.78);
    });
  }
  function loadImage(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),image=new Image();
      image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Este formato de imagem não foi reconhecido. No iPhone, escolha outra foto ou tire uma nova selfie.'));};
      image.src=url;
    });
  }
  async function normalizePhoto(file){
    if(!file||!file.size)throw Error('Tire uma selfie antes de enviar.');
    const mime=String(file.type||'').toLowerCase();
    if(!mime.startsWith('image/')&&!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||''))throw Error('Selecione uma imagem.');
    if(file.size>25*1024*1024)throw Error('Imagem muito grande. Escolha outra foto.');
    if(['image/jpeg','image/png','image/webp'].includes(mime)&&file.size<=PHOTO_LIMIT)return file;
    // HEIC/HEIF do iPhone e imagens grandes: tentar converter via decodificador nativo do navegador.
    const image=await loadImage(file);
    const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
    if(!w||!h)throw Error('A imagem está vazia.');
    const factor=Math.min(1,1280/Math.max(w,h));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(w*factor));
    canvas.height=Math.max(1,Math.round(h*factor));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('Não foi possível preparar a selfie.');
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvasJpeg(canvas);
  }
  async function processFile(file){
    if(photoBusy)return;
    photoBusy=true;setCameraStatus('Preparando sua selfie...');
    try{const normalized=await normalizePhoto(file);setPhotoFile(normalized);}
    catch(e){setCameraStatus(String(e.message||e),'error');}
    finally{photoBusy=false;}
  }
  async function captureSelfie(){
    if(photoBusy)return;
    const video=$('guestCameraPreview');
    const canvas=$('guestCameraCanvas');
    if(!video||!canvas||!video.videoWidth||!video.videoHeight){
      setCameraStatus('A câmera ainda está carregando. Aguarde a imagem aparecer.','error');return;
    }
    photoBusy=true;
    try{
      const factor=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));
      canvas.width=Math.round(video.videoWidth*factor);canvas.height=Math.round(video.videoHeight*factor);
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível capturar a selfie.');
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      setPhotoFile(await canvasJpeg(canvas));
    }catch(e){setCameraStatus(String(e.message||e),'error');}
    finally{photoBusy=false;}
  }
  function setupCamera(){
    $('guestCameraStart')?.addEventListener('click',openCamera);
    $('guestCameraCapture')?.addEventListener('click',captureSelfie);
    $('guestCameraRetake')?.addEventListener('click',resetCamera);
    for(const id of ['guestPhoto','guestPhotoGallery']){
      $(id)?.addEventListener('change',e=>{
        const file=e.currentTarget.files?.[0];
        if(file)processFile(file);
      });
    }
    window.addEventListener('pagehide',stopCamera);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
  }
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = $('guestSubmit');
    if (!form.reportValidity() || !client || !promoterValid) return;
    if(photoBusy){status('A foto ainda está sendo preparada. Tente novamente em alguns segundos.','error');return;}
    if(!capturedPhoto){status('Tire uma selfie ou escolha uma foto da galeria antes de enviar.','error');return;}
    submitButton.disabled = true;
    submitButton.textContent = 'ENVIANDO...';
    try {
      const payload = new FormData(form);
      // Captured file remains in memory: DataTransfer is unreliable on Safari iOS.
      payload.set('photo', capturedPhoto);
      payload.set('event_id', String(selectedEventId || ''));
       payload.set('promoter_code',promoterCode);
      payload.set('photo_consent', $('guestPhotoConsent')?.checked ? 'true' : 'false');
      const response = await fetch(edgeUrl, {method: 'POST', body: payload});
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok !== true) throw new Error(body.error || body.message || 'Não foi possível concluir o cadastro.');
      status('Cadastro recebido para a festa selecionada. Aguarde a análise da HYPE. Se aprovado e o QR não chegar no e-mail, apresente nome completo e documento na portaria para conferência da aprovação.', 'ok');
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
