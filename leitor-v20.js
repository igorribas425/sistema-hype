/* HYPE V20 // celular somente leitor por LINK EXCLUSIVO
   O link de ativacao e de uso unico. Depois de aberto, a credencial fica somente neste celular.
   O aparelho recebe apenas permissao para enviar QR lido ao computador autorizado da Portaria.
*/
(() => {
  'use strict';
  const READER_KEY='hype_reader_secret_v20';
  const LABEL_KEY='hype_reader_label_v20';
  const state={sb:null,secret:'',label:'',stream:null,timer:null,busy:false,connected:false};
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
        state.connected=true;
        const name=$('readerName');if(name)name.textContent=state.label;
        setStatus(`${state.label} • LEITOR AUTORIZADO`,'ok');
        $('startBtn').disabled=false;
        setTimeout(()=>start(),250);
        return;
      }catch(err){
        setStatus(err.message||'Não foi possível ativar este celular.','bad');
        $('startBtn').disabled=true;
        return;
      }
    }

    state.secret=localStorage.getItem(READER_KEY)||'';
    state.label=localStorage.getItem(LABEL_KEY)||state.label;
    const name=$('readerName');if(name)name.textContent=state.label;
    if(state.secret){
      state.connected=true;
      setStatus(`${state.label} • sessão de trabalho encontrada.`,'ok');
      $('startBtn').disabled=false;
      setTimeout(()=>start(),250);
    } else {
      setStatus('Abra neste celular o link exclusivo gerado no computador da Portaria.','bad');
      $('startBtn').disabled=true;
    }
  }

  async function submit(raw){
    if(state.busy||!raw)return false;
    state.busy=true;
    try{
      await rpc('portaria_reader_submit_v19',{p_reader_secret:state.secret,p_raw_code:String(raw).trim()});
      const box=$('lastScan');$('lastCode').textContent=String(raw).slice(0,80);box.classList.add('show');
      setStatus(`${state.label} • QR ENVIADO AO COMPUTADOR ✅`,'ok');
      try{navigator.vibrate?.([70,40,70]);}catch(_){ }
      return true;
    }catch(err){
      setStatus(err.message||'Falha ao enviar QR.','bad');
      if(/expirada|autorizado|bloqueado/i.test(String(err.message||''))){localStorage.removeItem(READER_KEY);state.connected=false;$('startBtn').disabled=true;stop();}
      return false;
    }finally{setTimeout(()=>{state.busy=false;},650);}
  }

  async function start(){
    if(!state.connected)return;
    if(!navigator.mediaDevices?.getUserMedia){setStatus('Este navegador não permite abrir a câmera.','bad');return;}
    if(!('BarcodeDetector' in window)){setStatus('Este navegador não oferece leitura automática de QR. Abra o link no Chrome atualizado.','bad');return;}
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
          if(raw){const ok=await submit(raw);if(ok){stop();setTimeout(()=>{if(state.connected)start();},850);}}
        }catch(_){ }
      },300);
      setStatus(`${state.label} • CÂMERA ATIVA — APONTE PARA O QR`,'ok');
    }catch(err){setStatus('Não foi possível abrir a câmera: '+err.message,'bad');}
  }

  function stop(){clearInterval(state.timer);state.timer=null;if(state.stream)state.stream.getTracks().forEach(t=>t.stop());state.stream=null;$('cameraBox')?.classList.remove('show');}
  function forget(){if(!confirm('Desconectar este celular leitor?'))return;stop();localStorage.removeItem(READER_KEY);state.connected=false;$('startBtn').disabled=true;setStatus('Celular desconectado. Peça um novo link à Portaria para usar novamente.','bad');}

  window.HypeReader={start,stop,forget};
  document.addEventListener('DOMContentLoaded',claim);
})();
