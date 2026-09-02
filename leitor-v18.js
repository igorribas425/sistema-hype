/* HYPE V18 // celular somente leitor */
(() => {
  'use strict';
  const READER_KEY='hype_reader_secret_v18';
  const state={sb:null,secret:'',stream:null,timer:null,busy:false,connected:false};
  const $=id=>document.getElementById(id);

  function client(){
    if(state.sb)return state.sb;
    const cfg=window.HYPE_SUPABASE_CONFIG||{};
    if(!cfg.url||!cfg.anonKey)throw new Error('Supabase não configurado.');
    state.sb=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:false}});
    return state.sb;
  }
  async function rpc(name,params={}){const {data,error}=await client().rpc(name,params);if(error)throw new Error(error.message||`Erro em ${name}`);return data;}
  function rows(data){return Array.isArray(data)?data:(data?[data]:[]);}
  function randomSecret(bytes=32){const a=new Uint8Array(bytes);crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');}
  function setStatus(text,kind=''){const el=$('readerStatus');el.textContent=text;el.className=`status ${kind}`;}

  async function claim(){
    const params=new URLSearchParams(location.search);
    const pair=params.get('pair')||'';
    if(pair){
      state.secret=randomSecret(32);
      try{
        const result=rows(await rpc('portaria_claim_pair_v18',{p_pair_token:pair,p_reader_secret:state.secret}))[0];
        if(!result?.ok)throw new Error(result?.message||'QR de conexão inválido.');
        localStorage.setItem(READER_KEY,state.secret);
        history.replaceState({},'',location.pathname);
        state.connected=true;
        setStatus('CONECTADO • SOMENTE LEITOR','ok');
        $('startBtn').disabled=false;
        setTimeout(()=>start(),250);
        return;
      }catch(err){setStatus(err.message||'Não foi possível conectar.','bad');$('startBtn').disabled=true;return;}
    }

    state.secret=localStorage.getItem(READER_KEY)||'';
    if(state.secret){state.connected=true;setStatus('Sessão anterior encontrada. Abra o leitor.','ok');$('startBtn').disabled=false;}
    else {setStatus('Leia o QR de conexão exibido no computador da Portaria.','bad');$('startBtn').disabled=true;}
  }

  async function submit(raw){
    if(state.busy||!raw)return false;
    state.busy=true;
    try{
      await rpc('portaria_reader_submit_v18',{p_reader_secret:state.secret,p_raw_code:String(raw).trim()});
      const box=$('lastScan');$('lastCode').textContent=String(raw).slice(0,80);box.classList.add('show');
      setStatus('QR ENVIADO AO COMPUTADOR ✅','ok');
      try{navigator.vibrate?.(70);}catch(_){}
      return true;
    }catch(err){
      setStatus(err.message||'Falha ao enviar QR.','bad');
      if(/expirada|autorizado/i.test(String(err.message||''))){localStorage.removeItem(READER_KEY);state.connected=false;$('startBtn').disabled=true;stop();}
      return false;
    }finally{setTimeout(()=>{state.busy=false;},650);}
  }

  async function start(){
    if(!state.connected)return;
    if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia){setStatus('Este navegador não suporta leitura automática. Use o campo de código abaixo.','bad');return;}
    try{
      stop();
      state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
      const video=$('video');video.srcObject=state.stream;$('cameraBox').classList.add('show');
      const detector=new BarcodeDetector({formats:['qr_code']});
      state.timer=setInterval(async()=>{
        if(state.busy||video.readyState<2)return;
        try{
          const found=await detector.detect(video);
          const raw=found?.[0]?.rawValue;
          if(raw){
            const ok=await submit(raw);
            if(ok){stop();setTimeout(()=>{if(state.connected)start();},1000);}
          }
        }catch(_){}
      },350);
      setStatus('LEITOR ATIVO • APONTE PARA O QR','ok');
    }catch(err){setStatus('Não foi possível abrir a câmera: '+err.message,'bad');}
  }

  function stop(){clearInterval(state.timer);state.timer=null;if(state.stream)state.stream.getTracks().forEach(t=>t.stop());state.stream=null;$('cameraBox')?.classList.remove('show');}
  async function sendManual(){const code=$('manualCode').value.trim();if(!code)return;const ok=await submit(code);if(ok)$('manualCode').value='';}

  window.HypeReader={start,stop,sendManual};
  document.addEventListener('DOMContentLoaded',claim);
})();
