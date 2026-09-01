/* HYPE V17 - contingência, documento, reentrada, logs, resumo e ingresso salvo */
(function(){
  const OFFLINE_KEY='hype_v17_portaria_snapshot';
  const QUEUE_KEY='hype_v17_portaria_queue';
  const SAVED_TICKET_KEY='hype_v17_saved_ticket';
  const norm=v=>String(v||'').replace(/\D/g,'');
  const online=()=>navigator.onLine!==false;
  const readJSON=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'')||f}catch(_){return f}};
  const writeJSON=(k,v)=>localStorage.setItem(k,JSON.stringify(v));

  async function v17rpc(name,params){ return sbRpc(name,params); }
  window.hypeV17DownloadOffline = async function(){
    if(!HYPE.user||!HYPE.pass) return alert('Faça login novamente.');
    const eventId=Number(HYPE.portariaEventId||document.getElementById('portariaEventSelect')?.value||0);
    if(!eventId) return alert('Selecione um evento.');
    try{
      const rows=await v17rpc('staff_offline_snapshot_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:eventId});
      writeJSON(OFFLINE_KEY,{event_id:eventId,downloaded_at:new Date().toISOString(),tickets:Array.isArray(rows)?rows:[]});
      hypeV17UpdateOfflineBadge();
      hypeNotify(`Offline pronto: ${(rows||[]).length} ingressos pagos salvos neste aparelho.`);
    }catch(e){alert(e.message||e)}
  };

  window.hypeV17UpdateOfflineBadge=function(){
    const el=document.getElementById('v17OfflineStatus'); if(!el)return;
    const snap=readJSON(OFFLINE_KEY,null), q=readJSON(QUEUE_KEY,[]);
    el.textContent=online()?`ONLINE • ${q.length} pendência(s)`:`OFFLINE • ${snap?.tickets?.length||0} ingressos • ${q.length} pendência(s)`;
    el.className='v17-offline-badge '+(online()?'online':'offline');
  };

  function offlineFind(code){
    const snap=readJSON(OFFLINE_KEY,null); if(!snap)return null;
    const c=String(code||'').trim();
    return (snap.tickets||[]).find(t=>t.ticket_code===c||t.qr_token===c||('#'+t.ticket_code)===c)||null;
  }
  function offlineSaveTicket(ticket){
    const snap=readJSON(OFFLINE_KEY,null); if(!snap)return;
    const i=(snap.tickets||[]).findIndex(t=>Number(t.id)===Number(ticket.id));
    if(i>=0)snap.tickets[i]=ticket; writeJSON(OFFLINE_KEY,snap);
  }
  function enqueue(item){const q=readJSON(QUEUE_KEY,[]);q.push(item);writeJSON(QUEUE_KEY,q);hypeV17UpdateOfflineBadge();}

  window.hypeV17SyncQueue=async function(show=true){
    if(!online()) return show&&alert('Sem internet. A fila continua salva neste aparelho.');
    let q=readJSON(QUEUE_KEY,[]); if(!q.length){if(show)hypeNotify('Nada pendente para sincronizar.');return;}
    const rest=[];
    for(const item of q){
      try{
        if(item.type==='entry') await v17rpc('staff_validate_entry_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_code:item.code,p_device:item.device,p_offline_sync:true});
        else if(item.type==='document') await v17rpc('staff_mark_document_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:item.ticket_id,p_checked:item.checked});
      }catch(e){rest.push({...item,error:String(e.message||e)});}
    }
    writeJSON(QUEUE_KEY,rest); hypeV17UpdateOfflineBadge();
    if(show) hypeNotify(rest.length?`${rest.length} ação(ões) ficaram pendentes.`:'Fila offline sincronizada.');
    try{await portariaRefreshDashboard(false)}catch(_){}
  };

  window.hypeV17MarkDocument=async function(id,checked,code){
    if(!checked && !confirm('Desmarcar documento conferido?'))return;
    if(!online()){
      const t=offlineFind(code); if(!t)return alert('Ingresso não está no pacote offline.');
      t.document_checked=checked; offlineSaveTicket(t); enqueue({type:'document',ticket_id:id,checked,at:new Date().toISOString()}); renderPortariaResults([t]); return;
    }
    try{await v17rpc('staff_mark_document_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:id,p_checked:checked}); const t=await lookupTicketByQr(code,false); if(t)renderPortariaResults([t]);}
    catch(e){alert(e.message||e)}
  };

  window.hypeV17TemporaryExit=async function(id,code){
    if(!confirm('Marcar saída temporária? A reentrada continuará BLOQUEADA até ser autorizada.'))return;
    try{await v17rpc('staff_temporary_exit_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:id}); const t=await lookupTicketByQr(code,false); if(t)renderPortariaResults([t]);}catch(e){alert(e.message||e)}
  };
  window.hypeV17AuthorizeReentry=async function(id,code){
    try{await v17rpc('staff_authorize_reentry_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:id,p_authorized:true}); const t=await lookupTicketByQr(code,false); if(t)renderPortariaResults([t]);hypeNotify('Reentrada autorizada.');}catch(e){alert(e.message||e)}
  };

  // Sobrescreve a renderização da portaria com CPF/documento/reentrada.
  window.renderPortariaResults=function(list){
    const c=document.getElementById('resultsContainer'); if(!c)return;
    if(!list?.length){c.innerHTML='<div class="empty-state" style="color:var(--red)">❌ Nenhum ingresso encontrado.</div>';return;}
    c.innerHTML=list.map(item=>{
      const paid=item.payment_status==='Pago', used=item.entry_status==='Entrada utilizada', canceled=item.payment_status==='Cancelado';
      const selected=Number(HYPE.portariaEventId||0),wrong=selected&&Number(item.event_id)!==selected;
      const cls=wrong||canceled?'cancelado':used&&!item.temporary_exit?'used':paid?'pago':'pendente';
      const doc=!!item.document_checked;
      const text=wrong?'OUTRO EVENTO ⚠️':canceled?'CANCELADO ❌':item.temporary_exit?(item.reentry_authorized?'REENTRADA AUTORIZADA ✅':'FORA • REENTRADA BLOQUEADA ⛔'):used?'JÁ ENTROU ⚠️':paid?'PAGO — AGUARDANDO DOCUMENTO':'BLOQUEADO ❌';
      const canEntry=paid&&!canceled&&!wrong&&doc&&(!used||(item.temporary_exit&&item.reentry_authorized));
      const cpf=norm(item.cpf); const cpfFmt=cpf.length===11?cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'):(item.cpf||'NÃO INFORMADO');
      return `<div class="result-card ${cls}"><div class="client-info"><div class="portaria-sector-big">${hypeEscape(String(item.sector||item.lot_name||'INGRESSO').toUpperCase())}</div><h3>${hypeEscape(item.customer_name||'')}</h3><div class="portaria-extra">CPF: <b>${hypeEscape(cpfFmt)}</b> • ${hypeEscape(item.ticket_code||'')}</div><div class="v17-doc-row"><label><input type="checkbox" ${doc?'checked':''} onchange="hypeV17MarkDocument(${Number(item.id)},this.checked,'${hypeEscape(item.ticket_code||'')}')"> Documento conferido</label><span>${doc?'✅ CONFERIDO':'⚠️ OBRIGATÓRIO'}</span></div>${item.temporary_exit?`<div class="portaria-warning">Saída temporária registrada. Reentrada: <b>${item.reentry_authorized?'AUTORIZADA':'NÃO AUTORIZADA'}</b>.</div>`:''}</div><div class="status-area"><div class="status-tag ${cls}">${text}</div>${canEntry?`<button class="btn-entry" onclick="validateEntry('${hypeEscape(item.ticket_code)}')">✅ ${item.temporary_exit?'CONFIRMAR REENTRADA':'CONFIRMAR ENTRADA'}</button>`:''}${used&&!item.temporary_exit?`<button class="btn-entry v17-exit" onclick="hypeV17TemporaryExit(${Number(item.id)},'${hypeEscape(item.ticket_code)}')">↩ SAÍDA TEMPORÁRIA</button>`:''}${item.temporary_exit&&!item.reentry_authorized?`<button class="btn-entry v17-reentry" onclick="hypeV17AuthorizeReentry(${Number(item.id)},'${hypeEscape(item.ticket_code)}')">🔓 AUTORIZAR REENTRADA</button>`:''}</div></div>`;
    }).join('');
  };

  window.lookupTicketByQr=async function(code,changeInput=true){
    if(!online()){
      const item=offlineFind(code); const c=document.getElementById('resultsContainer');
      if(!item){if(c)c.innerHTML='<div class="empty-state" style="color:var(--red)">❌ NÃO ENCONTRADO NO PACOTE OFFLINE.</div>';return null;}
      if(changeInput){const i=document.getElementById('portariaSearch');if(i)i.value=item.customer_name||item.ticket_code;}
      renderPortariaResults([item]); return item;
    }
    try{
      const rows=await v17rpc('staff_lookup_ticket',{p_username:HYPE.user,p_password:HYPE.pass,p_code:String(code||'').trim()});
      const item=Array.isArray(rows)?rows[0]:rows; if(!item)return null; if(changeInput){const i=document.getElementById('portariaSearch');if(i)i.value=item.customer_name||item.ticket_code;}
      renderPortariaResults([item]); return item;
    }catch(e){alert(e.message||e);return null}
  };

  window.validateEntry=async function(code){
    const device=`${navigator.userAgent.slice(0,40)} | ${location.hostname}`;
    if(!online()){
      const t=offlineFind(code); if(!t)return portariaDeniedFeedback('NÃO ENCONTRADO OFFLINE');
      if(t.payment_status!=='Pago')return portariaDeniedFeedback('PAGAMENTO NÃO CONFIRMADO');
      if(!t.document_checked)return portariaDeniedFeedback('CONFIRA O DOCUMENTO/CPF');
      if(t.entry_status==='Entrada utilizada'&&!t.temporary_exit)return portariaDuplicateAlert(t);
      if(t.temporary_exit&&!t.reentry_authorized)return portariaDeniedFeedback('REENTRADA NÃO AUTORIZADA');
      if(t.temporary_exit){t.temporary_exit=false;t.reentry_authorized=false;t.reentry_count=Number(t.reentry_count||0)+1;}else{t.entry_status='Entrada utilizada';t.entry_at=new Date().toISOString();}
      offlineSaveTicket(t); enqueue({type:'entry',code:t.ticket_code,device,at:new Date().toISOString()}); portariaSuccessFeedback(t); renderPortariaResults([t]); return;
    }
    try{
      const rows=await v17rpc('staff_validate_entry_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_code:code,p_device:device,p_offline_sync:false});
      const r=Array.isArray(rows)?rows[0]:rows;
      if(!r?.ok){return portariaDeniedFeedback(r?.message||'Entrada negada.');}
      portariaSuccessFeedback(r); renderPortariaResults([r]); try{await portariaRefreshDashboard(false)}catch(_){}
    }catch(e){portariaDeniedFeedback(e.message||'Erro ao validar entrada.')}
  };

  // Log adicional de pagamento feito pelo painel atual.
  const oldSetPayment=window.setPayment;
  if(typeof oldSetPayment==='function') window.setPayment=async function(id,status){
    const before=(HYPE.tickets||[]).find(x=>Number(x.id)===Number(id));
    await oldSetPayment(id,status);
    try{await v17rpc('staff_log_action_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:id,p_action:'PAYMENT_STATUS',p_details:{from:before?.payment_status||null,to:status}})}catch(_){}
  };

  window.hypeV17SaveTicket=function(){
    const code=document.getElementById('tTicketId')?.textContent?.trim(); if(!code)return alert('Abra seu ingresso primeiro.');
    const data={code,name:document.getElementById('tClientName')?.textContent||'',email:document.getElementById('tClientEmail')?.textContent||'',sector:document.getElementById('tTicketName')?.textContent||'',saved_at:new Date().toISOString()};
    writeJSON(SAVED_TICKET_KEY,data); hypeNotify('Ingresso salvo neste celular para acesso rápido.');
  };
  window.hypeV17OpenSavedTicket=function(){
    const d=readJSON(SAVED_TICKET_KEY,null); if(!d)return alert('Nenhum ingresso salvo neste celular.');
    const code=document.getElementById('tTicketId'); if(code)code.textContent=d.code; const name=document.getElementById('tClientName');if(name)name.textContent=d.name; const email=document.getElementById('tClientEmail');if(email)email.textContent=d.email; const sec=document.getElementById('tTicketName');if(sec)sec.textContent=d.sector; document.getElementById('ticketCard')?.style.setProperty('display','block'); document.getElementById('ticketCard')?.scrollIntoView({behavior:'smooth'});
  };

  window.hypeV17LoadAdminPanel=async function(){
    const box=document.getElementById('v17AdminPanel'); if(!box||!HYPE.user||!HYPE.pass)return;
    const eventId=Number(HYPE.selectedEventId||0); if(!eventId){box.innerHTML='<p>Selecione um evento.</p>';return;}
    try{
      const [sum,logs]=await Promise.all([
        v17rpc('staff_event_summary_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:eventId}),
        v17rpc('staff_action_logs_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:eventId,p_limit:60})
      ]);
      const s=Array.isArray(sum)?sum[0]:sum;
      box.innerHTML=`<div class="v17-summary"><div><span>Pagos</span><b>${Number(s?.sold||0)}</b></div><div><span>Faturamento</span><b>${hypeFormatMoney(s?.revenue||0)}</b></div><div><span>Entraram</span><b>${Number(s?.entered||0)}</b></div><div><span>Não entraram</span><b>${Number(s?.not_entered||0)}</b></div><div><span>Reentradas</span><b>${Number(s?.reentries||0)}</b></div></div><div class="v17-admin-actions"><button class="btn-action" onclick="hypeV17ToggleCpfLimit()">CPF: 1 INGRESSO/PESSOA</button><button class="btn-action btn-del" onclick="hypeV17CloseEvent()">ENCERRAR EVENTO</button></div><h4>LOG DE AÇÕES</h4><div class="v17-log-list">${(logs||[]).map(l=>`<div><b>${hypeEscape(l.actor_username||'sistema')}</b> • ${hypeEscape(l.action||'')}<small>${hypeEscape(l.customer_name||l.ticket_code||'')} • ${hypeFormatDateTime(l.created_at)}</small></div>`).join('')||'<div>Sem ações registradas.</div>'}</div>`;
    }catch(e){box.innerHTML=`<p style="color:#ff6b7d">${hypeEscape(e.message||String(e))}</p>`}
  };
  window.hypeV17ToggleCpfLimit=async function(){
    const id=Number(HYPE.selectedEventId||0); if(!id)return; const on=confirm('OK = ATIVAR limite de 1 ingresso por CPF.\nCancelar = DESATIVAR.');
    try{await v17rpc('staff_set_event_cpf_limit_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:id,p_limit_one:on});hypeNotify(on?'Limite por CPF ativado.':'Limite por CPF desativado.')}catch(e){alert(e.message||e)}
  };
  window.hypeV17CloseEvent=async function(){
    const id=Number(HYPE.selectedEventId||0); if(!id||!confirm('Encerrar este evento e retirar das vendas?'))return;
    try{await v17rpc('staff_close_event_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:id});hypeNotify('Evento encerrado. Resumo final preservado.');await hypeV17LoadAdminPanel();}catch(e){alert(e.message||e)}
  };

  function inject(){
    if(document.getElementById('ticketCard')&&!document.getElementById('v17SaveTicket')){
      const card=document.getElementById('ticketCard'); const b=document.createElement('button');b.id='v17SaveTicket';b.className='btn';b.style.marginTop='10px';b.textContent='📱 SALVAR INGRESSO NESTE CELULAR';b.onclick=hypeV17SaveTicket;card.appendChild(b);
      const open=document.createElement('button');open.className='btn ghost-btn';open.style.marginTop='8px';open.textContent='⚡ ABRIR INGRESSO SALVO';open.onclick=hypeV17OpenSavedTicket;card.appendChild(open);
    }
    if(document.getElementById('portariaSearch')&&!document.getElementById('v17OfflinePanel')){
      const host=document.querySelector('.search-box')||document.querySelector('.container'); const d=document.createElement('div');d.id='v17OfflinePanel';d.className='v17-offline-panel';d.innerHTML='<div id="v17OfflineStatus" class="v17-offline-badge">ONLINE</div><button class="portaria-btn" onclick="hypeV17DownloadOffline()">⬇ PREPARAR MODO OFFLINE</button><button class="portaria-btn secondary" onclick="hypeV17SyncQueue(true)">⟳ SINCRONIZAR FILA</button>';host?.appendChild(d);hypeV17UpdateOfflineBadge();
    }
    if(document.getElementById('v16DashboardPanel')&&!document.getElementById('v17AdminWrap')){
      const sec=document.createElement('section');sec.id='v17AdminWrap';sec.className='panel-box';sec.innerHTML='<h3>🧾 EVENTO ENCERRADO / AUDITORIA</h3><p style="color:var(--muted);font-size:12px;margin-bottom:12px">Resumo final da noite, limite por CPF e log de ações.</p><div id="v17AdminPanel">Clique em atualizar.</div><button class="btn-action" style="margin-top:12px" onclick="hypeV17LoadAdminPanel()">↻ ATUALIZAR RESUMO E LOG</button>';document.getElementById('v16DashboardPanel').after(sec);
    }
  }
  window.addEventListener('online',()=>{hypeV17UpdateOfflineBadge();hypeV17SyncQueue(false).catch(()=>{})});
  window.addEventListener('offline',hypeV17UpdateOfflineBadge);
  document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,700));
})();
