/* HYPE V108 — Chamados ao ADM: central sonora com atendimento protegido.
   Navegadores móveis podem pausar áudio com a aba em segundo plano.
   Push utiliza a mesma infraestrutura/assinatura do chat HYPE. */
(() => {
 'use strict';
 if(!document.getElementById('v95AdminHome'))return;
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 let client=null, polling=false, answering=false, active=[], seen=new Set(), audio=null, enabled=false, ringing=null;
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
   osc.type='sine';osc.frequency.value=freq;
   gain.gain.setValueAtTime(0.001,now);
   gain.gain.exponentialRampToValueAtTime(0.14,now+0.014);
   gain.gain.exponentialRampToValueAtTime(0.001,now+duration);
   osc.connect(gain).connect(audio.destination);osc.start(now);osc.stop(now+duration+0.03);
 }
 function ping(){
   if(!active.length||!enabled||!creds())return;
   try{note(659,0,0.16);note(880,0.22,0.16);note(659,0.48,0.2);navigator.vibrate?.([180,110,180]);}catch(e){console.warn('[HYPE V108 audio]',e);}
 }
 function ringMode(){
   const want=enabled&&active.length>0&&!!creds();
   if(want&&!ringing){ping();ringing=setInterval(ping,2500);}
   if(!want&&ringing){clearInterval(ringing);ringing=null;}
 }
 function render(){
   const widget=$('hype108AdminWidget'),list=$('hype108AdminList'),count=$('hype108AdminCount'),sound=$('hype108SoundBtn');
   if(!widget||!list)return;
   widget.hidden=!creds();
   if(!creds()){active=[];ringMode();return;}
   if(count)count.textContent=String(active.length);
   if(sound)sound.textContent=enabled?'🔊 SOM ATIVO':'🔔 ATIVAR TOQUE';
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
   try{const first=active[0];if(first){const n=new Notification('🆘 HYPE: Portaria chamando o ADM',{body:(first.device_label||'Portaria')+' — '+(first.reason||'Atendimento urgente'),tag:'hype-admin-call-'+first.call_id,requireInteraction:true});
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
     const reg=await navigator.serviceWorker.register('./service-worker.js?v=44',{scope:'./'});
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
   // Solicita push no clique do usuário, antes de perder a ativação por await.
   // O toque da aba continua funcionando mesmo se o push não for permitido.
   enablePush().catch(()=>{});
   try {
     const AC=window.AudioContext||window.webkitAudioContext;
     if(!AC)throw new Error('Este aparelho não suporta áudio do navegador');
     audio=audio||new AC();
     await audio.resume();
     enabled=audio.state==='running';
     if(!enabled)throw new Error('Toque bloqueado pelo navegador');
     note(784,0,.17);
     render();say('🔊 Toque ativado. Deixe o ADM aberto para receber som contínuo.');
   }catch(e){say(e.message,true);}
 }
 function init(){
   if($('hype108AdminWidget'))return;
   const w=document.createElement('aside');w.id='hype108AdminWidget';w.hidden=true;
   w.style.cssText='position:fixed;z-index:10005;right:12px;bottom:75px;width:min(350px,calc(100vw - 24px));max-height:60vh;overflow:auto;background:#110d11;border:2px solid #af2444;border-radius:16px;box-shadow:0 14px 46px #000b;color:white;padding:13px;font-family:system-ui,Arial,sans-serif;';
   w.innerHTML='<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong style="font-size:14px">🆘 CHAMADOS DA PORTARIA <b id="hype108AdminCount" style="color:#ff4870">0</b></strong><button type="button" id="hype108SoundBtn" style="font-size:11px;font-weight:bold;background:#a51b3b;color:white;padding:10px;border:0;border-radius:8px;cursor:pointer">🔔 ATIVAR TOQUE</button></div><p id="hype108AdminInfo" style="font-size:11px;color:#d6f1df;margin:10px 0">Aguardando chamados...</p><div id="hype108AdminList" aria-live="polite"></div><small style="display:block;font-size:10px;line-height:1.35;color:#aaa">O toque contínuo funciona com a página ADM ativa. Para avisos com tela bloqueada, permita notificações push; o som depende do celular.</small>';
   document.body.appendChild(w);
   $('hype108SoundBtn').addEventListener('click',unlock);
   render();setTimeout(poll,1500);setInterval(poll,4000);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
   window.addEventListener('pageshow',poll);
 }
 document.addEventListener('DOMContentLoaded',init);
})();