/* HYPE V36 // celular somente leitor por LINK EXCLUSIVO REUTILIZÁVEL — Android + iPhone/iOS
   Correção de câmera preta no celular + revogação em tempo real:
   - força o video.play() depois que a câmera abre;
   - limpa srcObject ao fechar/reabrir a câmera;
   - tenta câmera traseira e faz fallback compatível;
   - mostra mensagem clara se a permissão da câmera estiver bloqueada.

   Base V25/V26:

   - valida a credencial antes de abrir a câmera;
   - consulta o Supabase a cada 2 segundos;
   - ao Admin desconectar o leitor OU o computador da Portaria,
     a câmera fecha e a credencial local é apagada.
*/
(() => {
  'use strict';
  const READER_KEY='hype_reader_secret_v20';
  const LABEL_KEY='hype_reader_label_v20';
  const CHECK_MS=2000;
  const state={sb:null,secret:'',label:'',stream:null,timer:null,busy:false,connected:false,heartbeat:null,wantsCamera:false,checking:false};
  const $=id=>document.getElementById(id);

  function client(){
    if(state.sb)return state.sb;
    const cfg=window.HYPE_SUPABASE_CONFIG||{};
    if(!cfg.url||!cfg.anonKey)throw new Error('Supabase não configurado.');
    if(!window.supabase?.createClient)throw new Error('Biblioteca do Supabase não carregou.');
    state.sb=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:false}});
    return state.sb;
  }
  async function rpc(name,params={}){const {data,error}=await client().rpc(name,params);if(error)throw new Error(error.message||`Erro em ${name}`);return data;}
  const rows=data=>Array.isArray(data)?data:(data?[data]:[]);
  function randomSecret(bytes=32){const a=new Uint8Array(bytes);crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');}
  function setStatus(text,kind=''){const el=$('readerStatus');if(!el)return;el.textContent=text;el.className=`status ${kind}`;}
  function defaultLabel(){let label=localStorage.getItem(LABEL_KEY)||'';if(!label){label=`Celular ${randomSecret(2).toUpperCase()}`;localStorage.setItem(LABEL_KEY,label);}return label;}

  function stopCameraOnly(){
    clearInterval(state.timer);state.timer=null;
    const video=$('video');
    try{ video?.pause?.(); }catch(_){ }
    if(state.stream)state.stream.getTracks().forEach(t=>{ try{t.stop();}catch(_){ } });
    state.stream=null;
    if(video){
      try{ video.srcObject=null; }catch(_){ }
      try{ video.removeAttribute('src'); }catch(_){ }
      try{ video.load?.(); }catch(_){ }
    }
    $('cameraBox')?.classList.remove('show');
  }

  async function openCameraStream(){
    const preferred={
      audio:false,
      video:{
        facingMode:{ideal:'environment'},
        width:{ideal:1280},
        height:{ideal:720}
      }
    };
    try{
      return await navigator.mediaDevices.getUserMedia(preferred);
    }catch(firstErr){
      // Alguns Androids/POCO falham com constraints de câmera traseira.
      // Faz uma segunda tentativa mais simples antes de desistir.
      try{
        return await navigator.mediaDevices.getUserMedia({audio:false,video:true});
      }catch(_){
        throw firstErr;
      }
    }
  }

  async function attachAndPlay(stream){
    const video=$('video');
    if(!video)throw new Error('Área da câmera não encontrada.');
    video.muted=true;
    video.autoplay=true;
    video.playsInline=true;
    video.setAttribute('playsinline','');
    video.srcObject=stream;
    $('cameraBox')?.classList.add('show');

    if(video.readyState<1){
      await new Promise((resolve,reject)=>{
        const done=()=>{cleanup();resolve();};
        const fail=()=>{cleanup();reject(new Error('A câmera abriu, mas o vídeo não iniciou.'));};
        const cleanup=()=>{video.removeEventListener('loadedmetadata',done);video.removeEventListener('error',fail);};
        video.addEventListener('loadedmetadata',done,{once:true});
        video.addEventListener('error',fail,{once:true});
        setTimeout(()=>{cleanup();resolve();},1800);
      });
    }
    await video.play();

    // Detecta o caso clássico de tela preta: stream existe, mas nenhum frame chegou.
    await new Promise(r=>setTimeout(r,180));
    if(!video.videoWidth || !video.videoHeight){
      await new Promise(r=>setTimeout(r,650));
      if(!video.videoWidth || !video.videoHeight)throw new Error('A câmera não entregou imagem. Feche outras aplicações que estejam usando a câmera e tente novamente.');
    }
    return video;
  }

  function revokeLocal(message='ACESSO ENCERRADO PELO ADMIN'){
    state.connected=false;
    state.wantsCamera=false;
    stopCameraOnly();
    localStorage.removeItem(READER_KEY);
    state.secret='';
    const btn=$('startBtn');if(btn)btn.disabled=true;
    setStatus(message,'bad');
    try{navigator.vibrate?.([180,80,180]);}catch(_){ }
  }

  async function statusCheck({silent=false}={}){
    if(!state.secret)return false;
    if(state.checking)return state.connected;
    state.checking=true;
    try{
      const result=rows(await rpc('portaria_reader_status_v25',{p_reader_secret:state.secret}))[0];
      if(!result?.active){
        revokeLocal(result?.message||'ACESSO ENCERRADO PELO ADMIN');
        return false;
      }
      state.connected=true;
      if(result.reader_label){
        state.label=result.reader_label;
        localStorage.setItem(LABEL_KEY,state.label);
        const name=$('readerName');if(name)name.textContent=state.label;
      }
      const btn=$('startBtn');if(btn)btn.disabled=false;
      if(!silent && !state.stream)setStatus(`${state.label} • LEITOR AUTORIZADO`,'ok');
      return true;
    }catch(err){
      // Falha de internet não apaga a credencial. O leitor pausa e tenta novamente.
      stopCameraOnly();
      if(!silent)setStatus('Sem conexão com a Portaria. Aguardando internet para validar o acesso.','bad');
      return null;
    }finally{state.checking=false;}
  }

  function startHeartbeat(){
    clearInterval(state.heartbeat);
    state.heartbeat=setInterval(async()=>{
      if(!state.secret)return;
      const wasRunning=Boolean(state.stream)||state.wantsCamera;
      const ok=await statusCheck({silent:true});
      if(ok===false)return;
      if(ok===null){
        setStatus('Sem conexão com a Portaria. A câmera foi pausada até reconectar.','bad');
        return;
      }
      if(wasRunning && state.connected && !state.stream){
        start(true).catch(()=>{});
      }
    },CHECK_MS);
  }

  async function claim(){
    const params=new URLSearchParams(location.search);
    const token=params.get('reader')||'';
    const urlLabel=(params.get('name')||'').trim();
    state.label=urlLabel||defaultLabel();
    if(urlLabel)localStorage.setItem(LABEL_KEY,urlLabel);

    if(token){
      state.secret=randomSecret(32);
      try{
        const result=rows(await rpc('portaria_claim_reader_link_v20',{p_link_token:token,p_reader_secret:state.secret,p_reader_label:state.label}))[0];
        if(!result?.ok)throw new Error(result?.message||'Link de leitor inválido.');
        state.label=result.reader_label||state.label;
        localStorage.setItem(LABEL_KEY,state.label);
        localStorage.setItem(READER_KEY,state.secret);
        // V36 iPhone/iOS: mantém o token do link na URL.
        // Assim, se o Gmail/Safari perder o localStorage ou a página recarregar,
        // o MESMO link consegue autorizar o leitor novamente.
        try {
          const keepUrl = new URL(location.href);
          keepUrl.searchParams.set('reader', token);
          if (state.label) keepUrl.searchParams.set('name', state.label);
          history.replaceState({},'', keepUrl.pathname + keepUrl.search);
        } catch (_) {}
        const valid=await statusCheck();
        if(valid!==true)return;
        startHeartbeat();
        setTimeout(()=>start(),250);
        return;
      }catch(err){
        localStorage.removeItem(READER_KEY);
        state.secret='';
        setStatus(err.message||'Não foi possível ativar este celular.','bad');
        const btn=$('startBtn');if(btn)btn.disabled=true;
        return;
      }
    }

    state.secret=localStorage.getItem(READER_KEY)||'';
    state.label=localStorage.getItem(LABEL_KEY)||state.label;
    const name=$('readerName');if(name)name.textContent=state.label;
    if(state.secret){
      const valid=await statusCheck();
      if(valid===true){
        startHeartbeat();
        setTimeout(()=>start(),250);
      }
    } else {
      setStatus('Abra neste celular o link exclusivo gerado no computador da Portaria.','bad');
      const btn=$('startBtn');if(btn)btn.disabled=true;
    }
  }

  async function submit(raw){
    if(state.busy||!raw)return false;
    state.busy=true;
    try{
      const valid=await statusCheck({silent:true});
      if(valid!==true)return false;
      let sent=null;
      try {
        sent=rows(await rpc('portaria_reader_submit_v31',{p_reader_secret:state.secret,p_raw_code:String(raw).trim()}))[0]||null;
      } catch(err) {
        // Compatibilidade durante a atualização do Supabase.
        if(!/portaria_reader_submit_v31|function|schema cache|does not exist/i.test(String(err?.message||err))) throw err;
        await rpc('portaria_reader_submit_v19',{p_reader_secret:state.secret,p_raw_code:String(raw).trim()});
        sent={ok:true,message:'QR enviado'};
      }
      if(sent && sent.ok===false) throw new Error(sent.message||'Falha ao enviar QR ao computador.');
      const box=$('lastScan');$('lastCode').textContent=String(raw).slice(0,80);box.classList.add('show');
      setStatus(`${state.label} • QR ENVIADO AO COMPUTADOR ✅`,'ok');
      try{navigator.vibrate?.([70,40,70]);}catch(_){ }
      return true;
    }catch(err){
      const msg=String(err.message||'');
      setStatus(msg||'Falha ao enviar QR.','bad');
      if(/expirada|autorizado|bloqueado|encerrado|revogado/i.test(msg))revokeLocal('ACESSO ENCERRADO PELO ADMIN');
      return false;
    }finally{setTimeout(()=>{state.busy=false;},650);}
  }

  async function makeDecoder(video){
    // 1) Chrome/Android e navegadores com BarcodeDetector nativo.
    if ('BarcodeDetector' in window) {
      try {
        if (typeof BarcodeDetector.getSupportedFormats === 'function') {
          const formats = await BarcodeDetector.getSupportedFormats();
          if (Array.isArray(formats) && !formats.includes('qr_code')) throw new Error('qr_code não suportado');
        }
        const detector = new BarcodeDetector({formats:['qr_code']});
        return {
          name:'NATIVO',
          async read(){
            const found=await detector.detect(video);
            return found?.[0]?.rawValue || '';
          }
        };
      } catch (_) {}
    }

    // 2) Fallback para Safari/iPhone/iPad usando jsQR + Canvas.
    if (typeof window.jsQR === 'function') {
      const canvas=$('qrCanvas') || document.createElement('canvas');
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx) throw new Error('Não foi possível preparar o leitor compatível com iPhone.');
      return {
        name:'IOS',
        async read(){
          const vw=video.videoWidth||0, vh=video.videoHeight||0;
          if(vw<2||vh<2)return '';
          const maxSide=720;
          const scale=Math.min(1,maxSide/Math.max(vw,vh));
          const w=Math.max(2,Math.round(vw*scale));
          const h=Math.max(2,Math.round(vh*scale));
          if(canvas.width!==w)canvas.width=w;
          if(canvas.height!==h)canvas.height=h;
          ctx.drawImage(video,0,0,w,h);
          const image=ctx.getImageData(0,0,w,h);
          const result=window.jsQR(image.data,w,h,{inversionAttempts:'attemptBoth'});
          return result?.data || '';
        }
      };
    }

    throw new Error('O leitor QR compatível não carregou. Verifique a internet e atualize a página.');
  }

  async function start(fromHeartbeat=false){
    state.wantsCamera=true;
    if(!state.connected)return;
    if(!fromHeartbeat){
      const valid=await statusCheck();
      if(valid!==true)return;
    }
    if(state.stream)return;
    if(!navigator.mediaDevices?.getUserMedia){setStatus('Este navegador não permite abrir a câmera.','bad');return;}
    try{
      stopCameraOnly();
      state.stream=await openCameraStream();
      const video=await attachAndPlay(state.stream);
      const decoder=await makeDecoder(video);
      state.timer=setInterval(async()=>{
        if(state.busy||video.readyState<2)return;
        try{
          const raw=await decoder.read();
          if(raw){
            const ok=await submit(raw);
            if(ok){
              stopCameraOnly();
              setTimeout(()=>{if(state.connected&&state.wantsCamera)start(true);},850);
            }
          }
        }catch(_){ }
      },decoder.name==='IOS'?180:300);
      const deviceMode=decoder.name==='IOS'?'LEITOR iPhone/iOS ATIVO':'LEITOR QR ATIVO';
      setStatus(`${state.label} • ${deviceMode} — APONTE PARA O QR`,'ok');
    }catch(err){
      stopCameraOnly();
      const name=String(err?.name||'');
      let msg=String(err?.message||'Erro desconhecido');
      if(name==='NotAllowedError' || /permission|permiss/i.test(msg)){
        msg='Permissão da câmera bloqueada. No iPhone/Safari: toque em aA → Ajustes do Site → Câmera → Permitir. No Android/Chrome: toque no cadeado/ícone do endereço → Câmera → Permitir.';
      }else if(name==='NotReadableError' || /could not start|not readable|in use/i.test(msg)){
        msg='A câmera está sendo usada por outro aplicativo. Feche Câmera/WhatsApp/Instagram e tente novamente.';
      }
      setStatus('Não foi possível abrir a câmera: '+msg,'bad');
    }
  }

  function stop(){state.wantsCamera=false;stopCameraOnly();}
  function forget(){if(!confirm('Desconectar este celular leitor?'))return;clearInterval(state.heartbeat);state.heartbeat=null;revokeLocal('Celular desconectado. Peça um novo link à Portaria para usar novamente.');}

  window.addEventListener('pagehide',()=>stopCameraOnly());
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)stopCameraOnly();
    else if(state.connected&&state.wantsCamera)statusCheck().then(ok=>{if(ok===true)start(true);});
  });

  window.HypeReader={start,stop,forget};
  document.addEventListener('DOMContentLoaded',claim);
})();
