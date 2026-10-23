/* HYPE V108 — Chamar ADM (Portaria) + alerta sonoro no ADM.
   O toque no navegador precisa ser habilitado pelo administrador.
   Push em segundo plano usa a inscrição já existente no chat HYPE. */
(() => {
  'use strict';
  if (!document.getElementById('portariaApp')) return;
  const $ = id => document.getElementById(id);
  const key = () => String(localStorage.getItem('hype_portaria_device_key_v18') || '');
  const cfg = () => window.HYPE_SUPABASE_CONFIG || {};
  let sb = null, currentId = Number(localStorage.getItem('hype_v108_pending_call') || 0);
  let busy = false, checking = false, realtimeChannel=null;
  const SIGNAL_TOPIC='hype-portaria-admin-v110';
  function startRealtime(){
    if(realtimeChannel)return;
    try{
      realtimeChannel=client().channel(SIGNAL_TOPIC)
        .on('broadcast',{event:'refresh'},()=>{if(currentId)check();})
        .subscribe((status)=>{
          if(status==='SUBSCRIBED'&&currentId)check();
        });
    }catch(e){console.warn('[HYPE V110 portaria realtime]',e);realtimeChannel=null;}
  }
  const choices = ['Preciso de atendimento','Problema no QR Code','Pagamento / ingresso','Segurança / ocorrência','Cliente precisa do ADM','Outro assunto'];
  const client = () => {
    if (sb) return sb;
    if (!window.supabase?.createClient || !cfg().url || !cfg().anonKey) throw new Error('Supabase indisponível');
    return (sb=window.supabase.createClient(cfg().url,cfg().anonKey,{auth:{persistSession:false}}));
  };
  async function rpc(name,args) {
    const {data,error} = await client().rpc(name,args);
    if (error) throw new Error(error.message||'Falha ao comunicar com ADM');
    return Array.isArray(data) ? (data[0]||null) : data;
  }
  function message(s,isError=false) {
    const el=$('hype108PortariaStatus');
    if(el){el.textContent=s;el.style.color=isError?'#ffa8b4':'#c5f3d9';}
  }
  function update() {
    const active = !!currentId;
    const send=$('hype108CallBtn'), cancel=$('hype108CancelBtn');
    if(send){send.disabled=busy||active;send.textContent=active?'⏳ AGUARDANDO ADM...':'🆘 CHAMAR ADM';}
    if(cancel)cancel.hidden=!active;
    const sel=$('hype108Reason');
    if(sel)sel.disabled=busy||active;
  }
  function clear() {
    currentId=0;
    localStorage.removeItem('hype_v108_pending_call');
    update();
  }
  async function pushToAdmin(reason) {
    // O push é opcional: o chamado continua registrado mesmo sem notificação.
    const endpoint=String(window.HYPE_CHAT_PUSH_FUNCTION_URL||cfg().url+'/functions/v1/hype-chat-push').replace(/\/$/,'');
    const hdr={'Content-Type':'application/json',apikey:cfg().anonKey,Authorization:'Bearer '+cfg().anonKey};
    const ctrl=new AbortController(), timeout=setTimeout(()=>ctrl.abort(),7000);
    try {
      const response=await fetch(endpoint+'/send',{method:'POST',headers:hdr,signal:ctrl.signal,body:JSON.stringify({
        senderRole:'portaria',senderName:'🆘 Portaria / Chamar ADM',
        message:'🆘 CHAMADO URGENTE PARA O ADM: '+reason+'. Abra o painel HYPE e toque em ATENDER.',
        device_key:key(),endpoint:String(localStorage.getItem('hypePushEndpointV42')||'')
      })});
      if(!response.ok)throw new Error('Push não entregue: HTTP '+response.status);
      const result=await response.json().catch(()=>({}));
      if(result.ok===false)throw new Error(result.error||'Falha no serviço push');
    } finally {clearTimeout(timeout);}
  }
  async function call() {
    if(busy||currentId)return;
    if(!$('portariaApp')||$('portariaApp').classList.contains('hidden'))return message('Autorize a portaria antes de chamar.',true);
    if(!navigator.onLine)return message('Sem internet: o ADM não receberá o chamado.',true);
    const k=key();
    if(k.length<20)return message('Portaria ainda não autorizada.',true);
    busy=true;update();
    const reason=$('hype108Reason')?.value||choices[0];
    try {
      const row=await rpc('portaria_request_admin_call_v108',{p_device_key:k,p_event_id:Number($('eventSelect')?.value||0)||null,p_reason:reason});
      if(!row?.call_id)throw new Error('Nenhum chamado confirmado pelo servidor');
      currentId=Number(row.call_id);
      localStorage.setItem('hype_v108_pending_call',String(currentId));
      message('✅ Chamado enviado! Aguarde o ADM atender.');
      pushToAdmin(reason).catch(e=>console.warn('[HYPE chamado push opcional]',e));
    } catch(e){message('Não foi possível chamar o ADM: '+e.message,true);}
    finally {busy=false;update();}
  }
  async function cancel() {
    if(!currentId||busy)return;
    if(!confirm('Cancelar o chamado ao ADM?'))return;
    busy=true;update();
    try {
      await rpc('portaria_cancel_admin_call_v108',{p_device_key:key(),p_call_id:currentId});
      clear();message('Chamado cancelado pela portaria.');
    } catch(e){message('Falha ao cancelar: '+e.message,true);}
    finally {busy=false;update();}
  }
  async function check() {
    if(!currentId||checking||document.hidden||!navigator.onLine)return;
    checking=true;
    try {
      const row=await rpc('portaria_admin_call_status_v108',{p_device_key:key(),p_call_id:currentId});
      if(!row){clear();message('Chamado encerrado ou não encontrado.');}
      else if(row.status==='atendido'){clear();message('✅ ADM ATENDEU! Pode falar com a administração.');}
      else if(row.status==='cancelado'){clear();message('Chamado cancelado.');}
      else message('⏳ ADM foi chamado. Aguardando atendimento...');
    } catch(e){message('Sem confirmação do ADM: '+e.message,true);}
    finally {checking=false;}
  }
  function init(){
    const root=$('portariaApp');
    if(!root || $('hype108PortariaCall'))return;
    const panel=document.createElement('section');
    panel.id='hype108PortariaCall';
    panel.style.cssText='max-width:1100px;margin:12px auto 18px;padding:15px;border:1px solid #b32844;border-radius:15px;background:linear-gradient(110deg,#2e0e17,#101014);color:#fff;box-shadow:0 8px 22px #0006;';
    panel.innerHTML='<div style="font-weight:900;font-size:18px;margin-bottom:6px">🆘 CHAMAR ADMINISTRAÇÃO</div><p style="font-size:12px;color:#d5b7c0;line-height:1.5;margin:0 0 12px">Precisa de ajuda na entrada? O ADM receberá um alerta e poderá atender.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><select id="hype108Reason" aria-label="Motivo do chamado" style="flex:1 1 185px;min-height:43px;border-radius:9px;border:1px solid #66424b;background:#121217;color:#fff;padding:8px"></select><button type="button" id="hype108CallBtn" class="btn red" style="flex:1 1 130px;min-height:44px;background:#d71942;color:#fff;font-weight:900">🆘 CHAMAR ADM</button><button type="button" id="hype108CancelBtn" class="btn" hidden style="min-height:44px">CANCELAR CHAMADO</button></div><p id="hype108PortariaStatus" role="status" aria-live="polite" style="font-size:12px;color:#c5f3d9;margin:11px 0 0">Somente a portaria autorizada pode solicitar atendimento.</p>';
    // Insere dentro do aplicativo, antes da busca de ingressos.
    const anchor=root.querySelector('.search-card');
    if(anchor)anchor.parentNode.insertBefore(panel,anchor);
    else root.appendChild(panel);
    const sel=$('hype108Reason');
    choices.forEach(x=>{const option=document.createElement('option');option.value=x;option.textContent=x;sel.appendChild(option);});
    $('hype108CallBtn').addEventListener('click',call);
    $('hype108CancelBtn').addEventListener('click',cancel);
    update();
    startRealtime();
    if(currentId)check();
    setInterval(check,2500);
    window.addEventListener('pageshow',check);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  }
  document.addEventListener('DOMContentLoaded',init);
})();