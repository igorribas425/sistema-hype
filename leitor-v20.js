/* HYPE V25 // celular somente leitor por LINK EXCLUSIVO
   Correção de revogação em tempo real:
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
    if(state.stream)state.stream.getTracks().forEach(t=>t.stop());
    state.stream=null;
    $('cameraBox')?.classList.remove('show');
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
        history.replaceState({},'',location.pathname);
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
      await rpc('portaria_reader_submit_v19',{p_reader_secret:state.secret,p_raw_code:String(raw).trim()});
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

  async function start(fromHeartbeat=false){
    state.wantsCamera=true;
    if(!state.connected)return;
    if(!fromHeartbeat){
      const valid=await statusCheck();
      if(valid!==true)return;
    }
    if(state.stream)return;
    if(!navigator.mediaDevices?.getUserMedia){setStatus('Este navegador não permite abrir a câmera.','bad');return;}
    if(!('BarcodeDetector' in window)){setStatus('Este navegador não oferece leitura automática de QR. Abra o link no Chrome atualizado.','bad');return;}
    try{
      stopCameraOnly();
      state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
      const video=$('video');video.srcObject=state.stream;$('cameraBox').classList.add('show');
      const detector=new BarcodeDetector({formats:['qr_code']});
      state.timer=setInterval(async()=>{
        if(state.busy||video.readyState<2)return;
        try{
          const found=await detector.detect(video);
          const raw=found?.[0]?.rawValue;
          if(raw){const ok=await submit(raw);if(ok){stopCameraOnly();setTimeout(()=>{if(state.connected&&state.wantsCamera)start(true);},850);}}
        }catch(_){ }
      },300);
      setStatus(`${state.label} • CÂMERA ATIVA — APONTE PARA O QR`,'ok');
    }catch(err){setStatus('Não foi possível abrir a câmera: '+err.message,'bad');}
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
