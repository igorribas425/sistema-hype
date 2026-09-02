/* HYPE V18 // Admin: Sorteios + Dispositivos da Portaria */
(() => {
  'use strict';
  const esc=v=>typeof hypeEscape==='function'?hypeEscape(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR');};
  const rows=d=>Array.isArray(d)?d:(d?[d]:[]);
  let deviceTimer=null;

  function adminReady(){return window.HYPE?.role==='admin'&&HYPE.user&&HYPE.pass;}
  function eventRows(){return (HYPE.adminEvents?.length?HYPE.adminEvents:HYPE.events)||[];}

  function populateRaffleEvents(){
    const select=document.getElementById('v18RaffleEvent');if(!select)return;
    const list=eventRows();
    const current=Number(select.value||HYPE.selectedEventId||0);
    select.innerHTML=list.length?list.map(e=>`<option value="${Number(e.id)}">${esc(e.name||'Evento HYPE')}${e.event_date?` • ${esc(new Date(`${String(e.event_date).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR'))}`:''}</option>`).join(''):'<option value="">Nenhum evento</option>';
    if(list.some(e=>Number(e.id)===current))select.value=String(current);
    else if(HYPE.selectedEventId&&list.some(e=>Number(e.id)===Number(HYPE.selectedEventId)))select.value=String(HYPE.selectedEventId);
  }

  async function loadRaffleV18(){
    if(!adminReady())return;
    populateRaffleEvents();
    const id=Number(document.getElementById('v18RaffleEvent')?.value||0);if(!id)return;
    const box=document.getElementById('v18RaffleState');
    try{
      const data=rows(await sbRpc('staff_raffle_status_v18',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:id}))[0];
      if(!data){if(box)box.textContent='Evento não encontrado.';return;}
      const enabled=document.getElementById('v18RaffleEnabled');const prize=document.getElementById('v18RafflePrize');
      if(enabled)enabled.checked=Boolean(data.enabled);if(prize)prize.value=data.prize||'';
      document.getElementById('v18RaffleCount').textContent=String(data.participant_count||0);
      const last=document.getElementById('v18RaffleLastWinner');
      if(last)last.innerHTML=data.last_winner_name?`Último vencedor: <b>${esc(data.last_winner_name)}</b> • ${esc(data.last_winner_code||'')} • ${esc(fmt(data.last_draw_at))}`:'Nenhum sorteio realizado neste evento.';
      if(box){box.textContent=data.enabled?'SORTEIO ATIVO • ingressos pagos entram automaticamente':'SORTEIO DESATIVADO';box.className=`v18-state ${data.enabled?'on':''}`;}
    }catch(err){if(box){box.textContent=err.message||'Erro ao carregar sorteio.';box.className='v18-state error';}}
  }

  async function saveRaffleV18(){
    if(!adminReady())return alert('Somente o Admin pode configurar sorteios.');
    const id=Number(document.getElementById('v18RaffleEvent')?.value||0);const enabled=Boolean(document.getElementById('v18RaffleEnabled')?.checked);const prize=document.getElementById('v18RafflePrize')?.value.trim()||'';
    if(!id)return alert('Selecione um evento.');if(enabled&&!prize)return alert('Informe o prêmio do sorteio.');
    try{await sbRpc('staff_save_raffle_v18',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:id,p_enabled:enabled,p_prize:prize});hypeNotify(enabled?'Sorteio ativado. Compras pagas já estão participando.':'Sorteio desativado.');await loadRaffleV18();}
    catch(err){alert(err.message||'Erro ao salvar sorteio.');}
  }

  async function drawRaffleV18(){
    if(!adminReady())return alert('Somente o Admin pode realizar o sorteio.');
    const id=Number(document.getElementById('v18RaffleEvent')?.value||0);if(!id)return alert('Selecione um evento.');
    const prize=document.getElementById('v18RafflePrize')?.value.trim()||'o prêmio';
    if(!confirm(`Confirmar o sorteio agora?\n\nPrêmio: ${prize}\nSomente ingressos com pagamento PAGO participam.`))return;
    const btn=document.getElementById('v18DrawBtn');if(btn){btn.disabled=true;btn.textContent='SORTEANDO...';}
    try{
      const winner=rows(await sbRpc('staff_draw_raffle_v18',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:id}))[0];
      if(!winner)throw new Error('O sorteio não retornou um vencedor.');
      const result=document.getElementById('v18RaffleWinner');
      if(result){result.classList.add('show');result.innerHTML=`<small>🎉 VENCEDOR DO SORTEIO</small><strong>${esc(winner.customer_name)}</strong><span>${esc(winner.ticket_code)}${winner.promoter_code?` • Promoter ${esc(winner.promoter_code)}`:''}</span><b>🎁 ${esc(winner.prize||prize)}</b><em>${winner.phone?`WhatsApp: ${esc(winner.phone)}`:''}</em>`;}
      hypeNotify('Sorteio realizado e registrado.');await loadRaffleV18();await loadRaffleParticipantsV18(true);
    }catch(err){alert(err.message||'Não foi possível realizar o sorteio.');}
    finally{if(btn){btn.disabled=false;btn.textContent='🎲 REALIZAR SORTEIO AGORA';}}
  }

  async function loadRaffleParticipantsV18(forceShow=false){
    if(!adminReady())return;
    const id=Number(document.getElementById('v18RaffleEvent')?.value||0);if(!id)return;
    const list=document.getElementById('v18RaffleParticipants');if(!list)return;
    if(!forceShow&&list.dataset.open==='1'){list.dataset.open='0';list.innerHTML='';return;}
    list.dataset.open='1';list.innerHTML='<div class="v18-empty">Carregando participantes pagos...</div>';
    try{
      const data=rows(await sbRpc('staff_raffle_participants_v18',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:id}));
      list.innerHTML=data.length?`<div class="v18-participants-head">${data.length} participante(s) pago(s) • 1 ingresso = 1 chance</div>${data.map((p,i)=>`<div class="v18-participant"><b>${i+1}. ${esc(p.customer_name)}</b><span>${esc(p.ticket_code)}${p.promoter_code?` • promoter ${esc(p.promoter_code)}`:''}</span></div>`).join('')}`:'<div class="v18-empty">Nenhum pagamento confirmado ainda.</div>';
    }catch(err){list.innerHTML=`<div class="v18-empty error">${esc(err.message||'Erro ao carregar participantes.')}</div>`;}
  }

  async function loadDevicesV18(){
    if(!adminReady())return;
    const box=document.getElementById('v18DeviceList');if(!box)return;
    try{
      const data=rows(await sbRpc('staff_list_portaria_devices_v18',{p_username:HYPE.user,p_password:HYPE.pass}));
      if(!data.length){box.innerHTML='<div class="v18-empty">Nenhum computador solicitou acesso ainda. Abra portaria.html no computador da portaria para gerar o código.</div>';return;}
      box.innerHTML=data.map(d=>`<div class="v18-device ${d.active?'active':'pending'}"><div><strong>${esc(d.label||'Computador da Portaria')}</strong><small>Código: <b>${esc(d.request_code)}</b> • ${d.active?'AUTORIZADO':'AGUARDANDO AUTORIZAÇÃO'}${d.last_seen?` • último acesso ${esc(fmt(d.last_seen))}`:''}</small></div><div class="v18-device-actions">${!d.active?`<button class="btn-action btn-confirm" onclick="approveDeviceV18('${esc(d.request_code)}')">✅ AUTORIZAR</button>`:`<button class="btn-action btn-del" onclick="revokeDeviceV18('${esc(d.device_id)}')">🔒 REVOGAR</button>`}</div></div>`).join('');
    }catch(err){box.innerHTML=`<div class="v18-empty error">${esc(err.message||'Erro ao carregar dispositivos.')}</div>`;}
  }

  async function approveDeviceV18(code=null){
    if(!adminReady())return;
    const input=document.getElementById('v18DeviceCode');const label=document.getElementById('v18DeviceLabel');const value=String(code||input?.value||'').trim().toUpperCase();if(!value)return alert('Informe o código que apareceu no computador da Portaria.');
    if(!confirm(`Autorizar este computador para usar SOMENTE a Portaria?\n\nCódigo: ${value}`))return;
    try{await sbRpc('staff_approve_portaria_device_v18',{p_username:HYPE.user,p_password:HYPE.pass,p_request_code:value,p_label:label?.value.trim()||null});if(input)input.value='';hypeNotify('Computador autorizado para a Portaria.');await loadDevicesV18();}
    catch(err){alert(err.message||'Não foi possível autorizar o computador.');}
  }

  async function revokeDeviceV18(id){
    if(!adminReady())return;if(!confirm('Revogar este computador?\n\nEle perde o acesso à Portaria e os celulares pareados são encerrados.'))return;
    try{await sbRpc('staff_revoke_portaria_device_v18',{p_username:HYPE.user,p_password:HYPE.pass,p_device_id:id});hypeNotify('Acesso da Portaria revogado.');await loadDevicesV18();}
    catch(err){alert(err.message||'Não foi possível revogar o dispositivo.');}
  }

  async function hypeV18AdminInit(){
    if(!adminReady())return;
    populateRaffleEvents();
    await Promise.allSettled([loadRaffleV18(),loadDevicesV18()]);
    clearInterval(deviceTimer);deviceTimer=setInterval(()=>{if(!document.hidden&&adminReady())loadDevicesV18().catch(()=>{});},7000);
  }

  window.hypeV18AdminInit=hypeV18AdminInit;
  window.loadRaffleV18=loadRaffleV18;
  window.saveRaffleV18=saveRaffleV18;
  window.drawRaffleV18=drawRaffleV18;
  window.loadRaffleParticipantsV18=loadRaffleParticipantsV18;
  window.loadDevicesV18=loadDevicesV18;
  window.approveDeviceV18=approveDeviceV18;
  window.revokeDeviceV18=revokeDeviceV18;

  document.addEventListener('DOMContentLoaded',()=>{
    // Mantém o contador do sorteio sincronizado quando o Admin confirma/cancela pagamento
    // ou cria/edita eventos, sem exigir F5.
    if(typeof window.setPayment==='function'){
      const originalSetPayment=window.setPayment;
      window.setPayment=async function(){const r=await originalSetPayment.apply(this,arguments);if(adminReady())await loadRaffleV18().catch(()=>{});return r;};
    }
    if(typeof window.saveAdminEvent==='function'){
      const originalSaveEvent=window.saveAdminEvent;
      window.saveAdminEvent=async function(){const r=await originalSaveEvent.apply(this,arguments);if(adminReady()){populateRaffleEvents();await loadRaffleV18().catch(()=>{});}return r;};
    }
    setTimeout(()=>{if(adminReady())hypeV18AdminInit();},900);
  });
})();
