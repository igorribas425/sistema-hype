/* HYPE V19 // Admin: sorteio por evento + computadores da Portaria
   Corrige o seletor de evento do sorteio para funcionar independente do evento de lotes.
*/
(() => {
  'use strict';
  const esc=v=>typeof hypeEscape==='function'?hypeEscape(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR');};
  const rows=d=>Array.isArray(d)?d:(d?[d]:[]);
  let deviceTimer=null;
  let raffleEventId=0;

  function adminReady(){return window.HYPE?.role==='admin'&&HYPE.user&&HYPE.pass;}
  function eventRows(){return (Array.isArray(HYPE.adminEvents)&&HYPE.adminEvents.length?HYPE.adminEvents:HYPE.events)||[];}
  function eventLabel(e){
    let date='';
    if(e?.event_date){const d=new Date(`${String(e.event_date).slice(0,10)}T12:00:00`);if(!Number.isNaN(d.getTime()))date=` • ${d.toLocaleDateString('pt-BR')}`;}
    return `${e?.name||e?.artist_name||'Evento HYPE'}${date}`;
  }

  async function refreshRaffleEventsV19(preferredId=null){
    const select=document.getElementById('v18RaffleEvent');if(!select)return 0;
    const before=Number(preferredId||raffleEventId||select.value||HYPE.selectedEventId||0);
    if(adminReady()&&typeof window.loadAdminEvents==='function'){
      try{await window.loadAdminEvents();}catch(_){ }
    }
    const list=eventRows();
    select.innerHTML=list.length?list.map(e=>`<option value="${Number(e.id)}">${esc(eventLabel(e))}</option>`).join(''):'<option value="">Nenhum evento cadastrado</option>';
    let chosen=before;
    if(!list.some(e=>Number(e.id)===chosen))chosen=Number(HYPE.selectedEventId||list[0]?.id||0);
    if(!list.some(e=>Number(e.id)===chosen))chosen=Number(list[0]?.id||0);
    if(chosen)select.value=String(chosen);
    raffleEventId=chosen;
    return chosen;
  }

  async function onRaffleEventChangeV19(){
    raffleEventId=Number(document.getElementById('v18RaffleEvent')?.value||0);
    const list=document.getElementById('v18RaffleParticipants');if(list){list.dataset.open='0';list.innerHTML='';}
    const result=document.getElementById('v18RaffleWinner');if(result){result.classList.remove('show');result.innerHTML='';}
    await loadRaffleV18(false);
  }

  async function loadRaffleV18(ensureEvents=true){
    if(!adminReady())return;
    const select=document.getElementById('v18RaffleEvent');if(!select)return;
    if(ensureEvents&&(!select.options.length||!Number(select.value||0)))await refreshRaffleEventsV19();
    const id=Number(select.value||raffleEventId||0);if(!id)return;
    raffleEventId=id;
    const box=document.getElementById('v18RaffleState');
    try{
      const data=rows(await sbRpc('staff_raffle_status_v18',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:id}))[0];
      if(!data){if(box)box.textContent='Evento não encontrado.';return;}
      const enabled=document.getElementById('v18RaffleEnabled');const prize=document.getElementById('v18RafflePrize');
      if(enabled)enabled.checked=Boolean(data.enabled);if(prize)prize.value=data.prize||'';
      const count=document.getElementById('v18RaffleCount');if(count)count.textContent=String(data.participant_count||0);
      const last=document.getElementById('v18RaffleLastWinner');
      if(last)last.innerHTML=data.last_winner_name?`Último vencedor: <b>${esc(data.last_winner_name)}</b> • ${esc(data.last_winner_code||'')} • ${esc(fmt(data.last_draw_at))}`:'Nenhum sorteio realizado neste evento.';
      if(box){box.textContent=data.enabled?'SORTEIO ATIVO • toda compra PAGA deste evento participa automaticamente':'SORTEIO DESATIVADO';box.className=`v18-state ${data.enabled?'on':''}`;}
      const selectedLabel=document.getElementById('v19RaffleSelectedLabel');if(selectedLabel)selectedLabel.textContent=select.selectedOptions?.[0]?.textContent||'';
    }catch(err){if(box){box.textContent=err.message||'Erro ao carregar sorteio.';box.className='v18-state error';}}
  }

  async function saveRaffleV18(){
    if(!adminReady())return alert('Somente o Admin pode configurar sorteios.');
    const id=Number(document.getElementById('v18RaffleEvent')?.value||0);const enabled=Boolean(document.getElementById('v18RaffleEnabled')?.checked);const prize=document.getElementById('v18RafflePrize')?.value.trim()||'';
    if(!id)return alert('Selecione um evento para o sorteio.');if(enabled&&!prize)return alert('Informe o prêmio do sorteio.');
    try{await sbRpc('staff_save_raffle_v18',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:id,p_enabled:enabled,p_prize:prize});hypeNotify(enabled?'Sorteio ativado neste evento. Pagamentos confirmados já participam.':'Sorteio desativado neste evento.');await loadRaffleV18(false);}
    catch(err){alert(err.message||'Erro ao salvar sorteio.');}
  }

  async function drawRaffleV18(){
    if(!adminReady())return alert('Somente o Admin pode realizar o sorteio.');
    const select=document.getElementById('v18RaffleEvent');const id=Number(select?.value||0);if(!id)return alert('Selecione um evento.');
    const prize=document.getElementById('v18RafflePrize')?.value.trim()||'o prêmio';
    const eventName=select?.selectedOptions?.[0]?.textContent||'evento selecionado';
    if(!confirm(`Confirmar o sorteio deste evento?\n\n${eventName}\nPrêmio: ${prize}\n\nSomente ingressos com pagamento PAGO participam.`))return;
    const btn=document.getElementById('v18DrawBtn');if(btn){btn.disabled=true;btn.textContent='SORTEANDO...';}
    try{
      const winner=rows(await sbRpc('staff_draw_raffle_v18',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:id}))[0];
      if(!winner)throw new Error('O sorteio não retornou um vencedor.');
      const result=document.getElementById('v18RaffleWinner');
      if(result){result.classList.add('show');result.innerHTML=`<small>🎉 VENCEDOR DO SORTEIO</small><strong>${esc(winner.customer_name)}</strong><span>${esc(winner.ticket_code)}${winner.promoter_code?` • Promoter ${esc(winner.promoter_code)}`:''}</span><b>🎁 ${esc(winner.prize||prize)}</b><em>${winner.phone?`WhatsApp: ${esc(winner.phone)}`:''}</em>`;}
      hypeNotify('Sorteio realizado e registrado neste evento.');await loadRaffleV18(false);await loadRaffleParticipantsV18(true);
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
      list.innerHTML=data.length?`<div class="v18-participants-head">${data.length} participante(s) PAGO(s) • compras HYPE, promoter e Portaria entram juntas • 1 ingresso = 1 chance</div>${data.map((p,i)=>`<div class="v18-participant"><b>${i+1}. ${esc(p.customer_name)}</b><span>${esc(p.ticket_code)}${p.promoter_code?` • promoter ${esc(p.promoter_code)}`:''}</span></div>`).join('')}`:'<div class="v18-empty">Nenhum pagamento confirmado neste evento ainda.</div>';
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
    const id=await refreshRaffleEventsV19(raffleEventId||HYPE.selectedEventId);
    if(id)await loadRaffleV18(false);
    await loadDevicesV18();
    clearInterval(deviceTimer);deviceTimer=setInterval(()=>{if(!document.hidden&&adminReady())loadDevicesV18().catch(()=>{});},7000);
  }

  window.hypeV18AdminInit=hypeV18AdminInit; // compatibilidade com app.js
  window.refreshRaffleEventsV19=refreshRaffleEventsV19;
  window.onRaffleEventChangeV19=onRaffleEventChangeV19;
  window.loadRaffleV18=loadRaffleV18;
  window.saveRaffleV18=saveRaffleV18;
  window.drawRaffleV18=drawRaffleV18;
  window.loadRaffleParticipantsV18=loadRaffleParticipantsV18;
  window.loadDevicesV18=loadDevicesV18;
  window.approveDeviceV18=approveDeviceV18;
  window.revokeDeviceV18=revokeDeviceV18;

  document.addEventListener('DOMContentLoaded',()=>{
    if(typeof window.setPayment==='function'){
      const original=window.setPayment;
      window.setPayment=async function(){const r=await original.apply(this,arguments);if(adminReady())await loadRaffleV18(false).catch(()=>{});return r;};
    }
    if(typeof window.saveAdminEvent==='function'){
      const original=window.saveAdminEvent;
      window.saveAdminEvent=async function(){const r=await original.apply(this,arguments);if(adminReady()){await refreshRaffleEventsV19(raffleEventId||HYPE.selectedEventId);await loadRaffleV18(false).catch(()=>{});}return r;};
    }
    setTimeout(()=>{if(adminReady())hypeV18AdminInit();},900);
  });
})();
