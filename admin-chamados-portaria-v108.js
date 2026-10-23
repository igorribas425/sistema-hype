/* HYPE V108 — Chamados ao ADM: central sonora com atendimento protegido.
   Navegadores móveis podem pausar áudio com a aba em segundo plano.
   Push utiliza a mesma infraestrutura/assinatura do chat HYPE. */
(() => {
 'use strict';
 if(!document.getElementById('v95AdminHome'))return;
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 let client=null, polling=false, answering=false, active=[], seen=new Set(), audio=null, enabled=false, ringing=null;
 let volumeLevel=Math.max(20,Math.min(100,Number(localStorage.getItem('hype108AlarmVolume')||100)||100));
 let visualEnabled=false, torchStream=null, torchTrack=null, torchMode=false, ledTimer=null, ledOffTimer=null, ledBusy=false;
 const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 const canAlert=()=>!!creds()&&active.length>0&&!document.hidden;
 function torchLabel(){
   const b=$('hype108FlashBtn');
   if(b)b.textContent=visualEnabled?(torchMode?'💡 FLASH ATIVO • DESLIGAR':'🚨 ALERTA VISUAL • DESLIGAR'):'💡 ATIVAR FLASH';
 }
 function stopLedCycle(){
   if(ledTimer!==null){clearInterval(ledTimer);ledTimer=null;}
   if(ledOffTimer!==null){clearTimeout(ledOffTimer);ledOffTimer=null;}
   if(torchTrack?.readyState==='live'){
     torchTrack.applyConstraints({advanced:[{torch:false}]}).catch(()=>{});
   }
 }
 async function setTorch(on){
   const track=torchTrack;
   if(!track||track.readyState!=='live'||ledBusy)return false;
   ledBusy=true;
   try{await track.applyConstraints({advanced:[{torch:Boolean(on)}]});return true;}
   catch(err){console.warn('[HYPE V108 flash]',err);return false;}
   finally{ledBusy=false;}
 }
 function pulseLed(){
   if(!visualEnabled||!torchMode||!canAlert()||reducedMotion()||ledBusy)return;
   setTorch(true).then(ok=>{
     if(!ok)return;
     ledOffTimer=setTimeout(()=>{
       ledOffTimer=null;
       setTorch(false).catch(()=>{});
     },550);
   }).catch(()=>{});
 }
 function syncVisual(){
   const should=visualEnabled&&canAlert();
   const overlay=$('hype108ScreenAlert');
   if(overlay){
     overlay.hidden=!should;
     overlay.classList.toggle('hype108-reduced',reducedMotion());
   }
   if(!should||reducedMotion()||!torchMode){
     stopLedCycle();
   }else if(ledTimer===null){
     pulseLed();
     ledTimer=setInterval(pulseLed,2600);
   }
   torchLabel();
 }
 async function stopTorch(){
   stopLedCycle();
   const stream=torchStream;
   torchStream=null;torchTrack=null;torchMode=false;
   try{stream?.getTracks().forEach(t=>t.stop());}catch(_){}
 }
 async function toggleFlash(){
   if(visualEnabled){
     visualEnabled=false;
     syncVisual();
     await stopTorch();
     torchLabel();
     say('💡 Flash e alerta visual desligados.');
     return;
   }
   if(!creds()){say('Entre no ADM antes de ativar o flash.',true);return;}
   visualEnabled=true;
   const btn=$('hype108FlashBtn');
   if(btn)btn.disabled=true;
   try{
     // A lanterna traseira somente funciona em alguns navegadores Android e
     // exige acesso à câmera em primeiro plano, após clique explícito.
     if(!navigator.mediaDevices?.getUserMedia)throw new Error('Câmera não disponível');
     torchStream=await navigator.mediaDevices.getUserMedia({
       audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:320},height:{ideal:240}}
     });
     torchTrack=torchStream.getVideoTracks()[0]||null;
     if(!torchTrack)throw new Error('Câmera não disponível');
     const capabilities=torchTrack.getCapabilities?.()||{};
     if(capabilities.torch!==true)throw new Error('Este aparelho/navegador não libera o flash ao site');
     await torchTrack.applyConstraints({advanced:[{torch:false}]});
     torchMode=true;
     say('💡 Flash traseiro preparado. Vai piscar devagar enquanto houver chamado e a página estiver aberta.');
   }catch(e){
     await stopTorch();
     say('🚨 Flash traseiro indisponível: ativado alerta vermelho na tela. '+e.message,true);
   }finally{
     if(btn)btn.disabled=false;
     syncVisual();
   }
 }
 function flashOffWhenHidden(){
   // Libera a câmera ao bloquear o celular, trocar de aba ou fechar o navegador.
   visualEnabled=false;
   syncVisual();
   stopTorch().catch(()=>{});
 }

 const vibrationSupported = typeof navigator.vibrate === 'function';
 const VIBRATION_PATTERN = [320,140,320,140,600];
 function vibrate(pattern=VIBRATION_PATTERN){
   if(!vibrationSupported)return false;
   try{return navigator.vibrate(pattern)===true;}catch(_){return false;}
 }
 function stopVibration(){
   if(vibrationSupported)try{navigator.vibrate(0);}catch(_){}
 }
 function creds(){
   try {if(typeof HYPE!=='undefined'&&HYPE.user&&HYPE.pass&&['admin','gerente'].includes(HYPE.role))
     return {p_username:HYPE.user,p_password:HYPE.pass};}catch(_){}
   return null;
 }
 function rpc(name,args){
   if(typeof sbRpc==='function')return sbRpc(name,args);
   throw new Error('Painel administrativo não carregou.');
 }
 function say(str,bad=false){
   const el=$('hype108AdminInfo');if(el){el.textContent=str;el.style.color=bad?'#ff9aa8':'#d6f1df';}
 }
 function note(freq,delay,duration=0.12){
   if(!audio||audio.state!=='running')return;
   const osc=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime+delay;
   osc.type='triangle';osc.frequency.value=freq;
   gain.gain.setValueAtTime(0.001,now);
   gain.gain.exponentialRampToValueAtTime(Math.min(.46,.46*(volumeLevel/100)),now+0.014);
   gain.gain.exponentialRampToValueAtTime(0.001,now+duration);
   osc.connect(gain).connect(audio.destination);osc.start(now);osc.stop(now+duration+0.03);
 }
 function ping(){
   if(!active.length||!enabled||!creds())return;
   try{
     // Alerta sonoro e vibração repetidos até ser atendido.
     note(659,0,0.16);note(880,0.22,0.16);note(659,0.48,0.2);
     vibrate();
   }catch(e){console.warn('[HYPE V108 toque/vibração]',e);}
 }
 function ringMode(){
   const want=enabled&&active.length>0&&!!creds();
   if(want&&!ringing){ping();ringing=setInterval(ping,3000);}
   if(!want){if(ringing){clearInterval(ringing);ringing=null;}stopVibration();}
   syncVisual();
 }
 function render(){
   const widget=$('hype108AdminWidget'),list=$('hype108AdminList'),count=$('hype108AdminCount'),sound=$('hype108SoundBtn');
   if(!widget||!list)return;
   widget.hidden=!creds();
   if(!creds()){active=[];ringMode();return;}
   if(count)count.textContent=String(active.length);
   if(sound)sound.textContent=enabled
     ? (vibrationSupported?'🔊📳 ALERTAS ATIVOS':'🔊 SOM ATIVO')
     : '🔔 ATIVAR ALERTAS';
   list.innerHTML='';
   if(active.length===0){
     list.innerHTML='<span style="color:#aba1a5;font-size:12px">Nenhum chamado aguardando.</span>';
   }else{
     active.forEach(c=>{
       const card=document.createElement('article');
       card.style.cssText='background:#2a111a;border:1px solid #bb2e50;padding:10px;border-radius:11px;margin:8px 0;color:#fff';
       const title=document.createElement('strong');
       title.style.cssText='display:block;font-size:14px';
       title.textContent='🆘 '+(c.device_label||'Portaria');
       const info=document.createElement('div');
       info.style.cssText='font-size:12px;margin:6px 0;color:#f0dfe4;line-height:1.45;overflow-wrap:anywhere';
       info.textContent=(c.event_name||'Evento HYPE')+' • '+(c.reason||'Chamado');
       const date=document.createElement('small');
       date.style.cssText='color:#c9aebb;display:block;margin-bottom:9px';
       date.textContent=new Date(c.created_at).toLocaleTimeString('pt-BR');
       const button=document.createElement('button');
       button.type='button';button.textContent='✅ ATENDER CHAMADO';button.disabled=answering;
       button.style.cssText='background:#25a66b;color:#fff;border:0;border-radius:9px;padding:12px;font-weight:900;cursor:pointer;width:100%;min-height:43px';
       button.addEventListener('click',()=>answer(c.call_id));
       card.append(title,info,date,button);list.appendChild(card);
     });
   }
   ringMode();
 }
 function notifyNew(){
   if(!('Notification' in window)||Notification.permission!=='granted')return;
   try{const first=active[0];if(first){const n=new Notification('🆘 HYPE: Portaria chamando o ADM',{body:(first.device_label||'Portaria')+' — '+(first.reason||'Atendimento urgente'),tag:'hype-admin-call-'+first.call_id,requireInteraction:true,vibrate:VIBRATION_PATTERN});
   n.onclick=()=>{window.focus();n.close();};}}catch(_){}
 }
 async function poll(){
   const credentials=creds();
   if(!credentials){active=[];render();return;}
   if(polling||navigator.onLine===false)return;
   polling=true;
   try {
     const data=await rpc('staff_admin_calls_v108',credentials);
     const rows=Array.isArray(data)?data:(data?[data]:[]);
     active=rows.filter(r=>r.status==='pendente');
     const fresh=active.filter(c=>!seen.has(String(c.call_id)));
     fresh.forEach(c=>seen.add(String(c.call_id)));
     render();
     if(fresh.length){notifyNew();if(enabled)ping();}
     say(active.length?active.length+' chamado(s) aguardando o ADM.':'Tudo certo. Aguardando chamados.');
   }catch(e){say('Sem conexão com os chamados: '+e.message,true);}
   finally{polling=false;}
 }
 async function answer(id){
   const credentials=creds();
   if(!credentials||answering)return;
   answering=true;render();
   try{
     const result=await rpc('staff_answer_admin_call_v108',{...credentials,p_call_id:Number(id)});
     const row=Array.isArray(result)?result[0]:result;
     if(!row?.call_id)throw new Error('Servidor não confirmou atendimento');
     active=active.filter(c=>Number(c.call_id)!==Number(id));
     render();say('✅ Chamado atendido. A portaria será avisada.');
     await poll();
   }catch(e){say('Não foi possível atender: '+e.message,true);}
   finally{answering=false;render();}
 }
 const base64ToU8=str=>{
   const pad='='.repeat((4-str.length%4)%4),raw=atob((str+pad).replace(/-/g,'+').replace(/_/g,'/'));
   return Uint8Array.from(raw,c=>c.charCodeAt(0));
 };
 async function enablePush(){
   const c=creds(),cfg=window.HYPE_SUPABASE_CONFIG||{};
   const publicKey=window.HYPE_PUSH_PUBLIC_KEY;
   if(!c||!publicKey||!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))return;
   try {
     if(Notification.permission==='default')await Notification.requestPermission();
     if(Notification.permission!=='granted')return;
     const reg=await navigator.serviceWorker.register('./service-worker.js?v=45',{scope:'./'});
     const ready=await navigator.serviceWorker.ready;
     let sub=await ready.pushManager.getSubscription();
     if(!sub)sub=await ready.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToU8(publicKey)});
     const json=sub.toJSON(),fn=String(window.HYPE_CHAT_PUSH_FUNCTION_URL||cfg.url+'/functions/v1/hype-chat-push').replace(/\/$/,'');
     const res=await fetch(fn+'/subscribe',{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.anonKey,Authorization:'Bearer '+cfg.anonKey},
       body:JSON.stringify({endpoint:json.endpoint,keys:json.keys||{},role:'admin',userAgent:navigator.userAgent||'',username:c.p_username,password:c.p_password})});
     if(!res.ok)throw Error('Push não pôde ser ativado');
     localStorage.setItem('hypePushEndpointV42',json.endpoint||'');
   } catch(e){console.warn('[HYPE chamado push opcional]',e);}
 }
 async function unlock(){
   // Os gestos de clique liberam áudio/vibração nos navegadores compatíveis.
   // A inscrição push também pede permissão aqui, mas não garante vibração com tela bloqueada.
   enablePush().catch(()=>{});
   const vibrated=vibrate([240,100,240]);
   try {
     const AC=window.AudioContext||window.webkitAudioContext;
     if(!AC)throw new Error('Áudio do navegador não disponível');
     audio=audio||new AC();
     await audio.resume();
     if(audio.state!=='running')throw new Error('Áudio bloqueado pelo navegador');
     enabled=true;
     note(784,0,.17);
     render();
     say(vibrationSupported
       ? '🔊📳 Alertas ativos com volume reforçado. Aumente também o volume de mídia do celular.'
       : '🔊 Som ativo. Este aparelho/navegador não oferece vibração pela página.');
   }catch(e){
     // Não bloquear a vibração apenas por falta de suporte ao áudio.
     enabled=vibrationSupported&&vibrated;
     render();
     say(enabled
       ? '📳 Vibração ativa! Som não disponível neste aparelho.'
       : 'Este navegador bloqueou o áudio e/ou não permite vibração. '+e.message,true);
   }
 }
 function testSound(){
   if(!enabled||!audio||audio.state!=='running'){
     say('Primeiro toque em ATIVAR ALERTAS para liberar o som.',true);return;
   }
   note(784,0,.20);note(987,.27,.22);note(784,.59,.28);
   say('🔊 Teste de som enviado. Se estiver baixo, aumente o volume de MÍDIA do celular.');
 }
 function testVibration(){
   if(!vibrationSupported){say('⚠️ Este aparelho/navegador não suporta vibração via site. No iPhone, normalmente não funciona.',true);return;}
   const ok=vibrate();
   say(ok?'📳 Vibração de teste enviada ao celular.':'⚠️ O navegador não permitiu vibrar. Teste no Chrome de um Android.',!ok);
 }
 function init(){
   if($('hype108AdminWidget'))return;
   const css=document.createElement('style');
   css.id='hype108FlashStyle';
   css.textContent=`
      #hype108ScreenAlert[hidden]{display:none!important}
      #hype108ScreenAlert{position:fixed;inset:0;z-index:10004;pointer-events:none;box-sizing:border-box;
        background:rgba(245,30,64,.13);border:12px solid rgba(255,52,90,.75);
        animation:hype108GentleBlink 2.6s steps(1,end) infinite}
      #hype108ScreenAlert.hype108-reduced{animation:none;background:transparent;border:10px solid #fa4167}
      @keyframes hype108GentleBlink{0%,29%{opacity:1}30%,100%{opacity:0}}
      @media (prefers-reduced-motion:reduce){#hype108ScreenAlert{animation:none;background:transparent;border:10px solid #fa4167}}
    `;
   document.head.appendChild(css);
   const overlay=document.createElement('div');
   overlay.id='hype108ScreenAlert';overlay.hidden=true;
   overlay.setAttribute('aria-hidden','true');document.body.appendChild(overlay);
   const w=document.createElement('aside');w.id='hype108AdminWidget';w.hidden=true;
   w.style.cssText='position:fixed;z-index:10005;right:12px;bottom:75px;width:min(350px,calc(100vw - 24px));max-height:60vh;overflow:auto;background:#110d11;border:2px solid #af2444;border-radius:16px;box-shadow:0 14px 46px #000b;color:white;padding:13px;font-family:system-ui,Arial,sans-serif;';
   w.innerHTML='<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong style="font-size:14px">🆘 CHAMADOS DA PORTARIA <b id="hype108AdminCount" style="color:#ff4870">0</b></strong><button type="button" id="hype108SoundBtn" style="font-size:11px;font-weight:bold;background:#a51b3b;color:white;padding:10px;border:0;border-radius:8px;cursor:pointer">🔔 ATIVAR ALERTAS</button></div><p id="hype108AdminInfo" style="font-size:11px;color:#d6f1df;margin:10px 0">Aguardando chamados...</p><div style="margin:0 0 9px;display:flex;gap:6px;flex-wrap:wrap"><button id="hype108VibrateTest" type="button" style="min-height:36px;padding:8px 10px;border-radius:8px;border:1px solid #7e3e51;background:#201017;color:#fff;font-size:11px;cursor:pointer">📳 TESTAR VIBRAÇÃO</button><button id="hype108SoundTest" type="button" style="min-height:36px;padding:8px 10px;border-radius:8px;border:1px solid #7e3e51;background:#201017;color:#fff;font-size:11px;cursor:pointer">🔊 TESTAR SOM</button><button id="hype108FlashBtn" type="button" style="min-height:36px;padding:8px 10px;border-radius:8px;border:1px solid #7e3e51;background:#a51b3b;color:#fff;font-size:11px;font-weight:800;cursor:pointer">💡 ATIVAR FLASH</button></div><label for="hype108AlarmVolume" style="display:flex;align-items:center;gap:8px;margin:8px 0 13px;font-size:12px;color:#eee">🔊 Volume do alerta <input id="hype108AlarmVolume" type="range" min="20" max="100" step="10" value="100" style="flex:1;min-width:75px;accent-color:#ff3159"><b id="hype108AlarmVolumeLabel">100%</b></label><div id="hype108AdminList" aria-live="polite"></div><small style="display:block;font-size:10px;line-height:1.35;color:#aaa">Som, vibração e flash traseiro precisam do ADM aberto e ativo. O flash usa a câmera do aparelho e pede permissão. Tela bloqueada: depende das notificações do celular; não garante flash, som ou vibração contínuos.</small>';
   document.body.appendChild(w);
   $('hype108SoundBtn').addEventListener('click',unlock);
   $('hype108VibrateTest').addEventListener('click',testVibration);
   $('hype108SoundTest').addEventListener('click',testSound);
   $('hype108FlashBtn').addEventListener('click',toggleFlash);
   const slider=$('hype108AlarmVolume');
   slider.value=String(volumeLevel);
   $('hype108AlarmVolumeLabel').textContent=volumeLevel+'%';
   slider.addEventListener('input',()=>{
     volumeLevel=Math.max(20,Math.min(100,Number(slider.value)||100));
     $('hype108AlarmVolumeLabel').textContent=volumeLevel+'%';
     localStorage.setItem('hype108AlarmVolume',String(volumeLevel));
   });
   render();setTimeout(poll,1500);setInterval(poll,4000);
   document.addEventListener('visibilitychange',()=>{
     if(document.hidden)flashOffWhenHidden();
     else {poll();syncVisual();}
   });
   window.addEventListener('pagehide',flashOffWhenHidden);
   window.addEventListener('pageshow',poll);
 }
 document.addEventListener('DOMContentLoaded',init);
})();