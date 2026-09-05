/* HYPE V38 — Estorno ASAAS para qualquer ingresso
   Modos:
   - cancel: estorna e cancela o QR
   - keep_valid: estorna e mantém válido como cortesia/FREE
*/
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
  const esc = v => typeof hypeEscape === 'function'
    ? hypeEscape(v)
    : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money = v => typeof hypeFormatMoney === 'function'
    ? hypeFormatMoney(Number(v || 0))
    : Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  const state = { eventId:0, rows:[], busy:false, lastSignature:'' };

  function isAdmin() {
    try { return HYPE?.role === 'admin' && HYPE?.user && HYPE?.pass; }
    catch (_) { return false; }
  }

  function currentEventId() {
    try {
      const id = Number(HYPE?.selectedEventId || 0);
      if (id) return id;
    } catch (_) {}
    return Number($('v34EventSelect')?.value || 0) || 0;
  }

  function setProgress(text='',show=false) {
    const el=$('v36RefundProgress');
    if(!el)return;
    el.textContent=text;
    el.classList.toggle('show',Boolean(show));
  }

  function selectedGender() {
    return String($('v36RefundGender')?.value || 'all');
  }

  function selectedMode() {
    const v=String($('v36RefundMode')?.value || 'cancel');
    return v==='keep_valid'?'keep_valid':'cancel';
  }

  function filteredRows() {
    const g=selectedGender();
    return state.rows.filter(r => g==='all' || String(r.gender||'')===g);
  }

  function statusText(row) {
    const st=String(row.refund_status||'').toUpperCase();
    if (Number(row.refund_amount||0)>0 || ['REFUNDED','REFUND_REQUESTED','REFUND_IN_PROGRESS','PARTIALLY_REFUNDED'].includes(st)) {
      const mode=String(row.refund_mode||'').toUpperCase();
      if(mode==='KEEP_VALID' || row.free_after_refund) return {text:'ESTORNADO • CORTESIA',cls:'done'};
      return {text:'ESTORNADO • CANCELADO',cls:'done'};
    }
    if(row.eligible) return {text:'PODE ESTORNAR',cls:'eligible'};
    return {text:st || 'NÃO ELEGÍVEL',cls:'wait'};
  }

  function render() {
    const rows=filteredRows();
    const eligible=rows.filter(r=>r.eligible===true);
    const refunded=rows.filter(r=>Number(r.refund_amount||0)>0);
    const totalEligible=eligible.reduce((s,r)=>s+Number(r.price||0),0);
    const totalRefunded=refunded.reduce((s,r)=>s+Number(r.refund_amount||0),0);

    if($('v36RefundEligible')) $('v36RefundEligible').textContent=String(eligible.length);
    if($('v36RefundValue')) $('v36RefundValue').textContent=money(totalEligible);
    if($('v36RefundDone')) $('v36RefundDone').textContent=String(refunded.length);
    if($('v36RefundDoneValue')) $('v36RefundDoneValue').textContent=money(totalRefunded);

    const bulk=$('v36RefundAllBtn');
    if(bulk){
      bulk.disabled=state.busy||eligible.length===0;
      bulk.textContent=state.busy?'PROCESSANDO...':`💸 ESTORNAR ${eligible.length||''} SELECIONADO(S)`;
    }

    const box=$('v36RefundList');
    if(!box)return;
    if(!rows.length){
      box.innerHTML='<div class="v36-refund-empty">Nenhum ingresso pago pelo Asaas neste filtro.</div>';
      return;
    }

    box.innerHTML=rows.map(r=>{
      const st=statusText(r);
      const amount=Number(r.refund_amount||0)>0?Number(r.refund_amount||0):Number(r.price||0);
      const entered=String(r.entry_status||'')==='Entrada utilizada';
      return `<div class="v36-refund-row">
        <div>
          <strong>${esc(r.customer_name||'Cliente')}</strong>
          <small>${esc(r.gender||'')} • ${esc(r.ticket_code||'')}${r.lot_name?` • ${esc(r.lot_name)}`:''}${r.email?` • ${esc(r.email)}`:''}</small>
          ${entered?'<small style="color:#ffcc00">⚠️ Este ingresso já registrou entrada.</small>':''}
        </div>
        <div class="v36-refund-value">${money(amount)}</div>
        <div class="v36-provider">
          <small>${esc(r.payment_method||'Pagamento')}</small>
          <span class="v36-refund-status ${st.cls}">${esc(st.text)}</span>
        </div>
        <div class="v36-refund-actions-inline">
          ${r.eligible?`
            <button class="btn-action btn-del" type="button" onclick="HypeV36Refund.refundOne(${Number(r.ticket_id)},'cancel')">ESTORNAR + CANCELAR</button>
            <button class="btn-action" type="button" onclick="HypeV36Refund.refundOne(${Number(r.ticket_id)},'keep_valid')">ESTORNAR + CORTESIA</button>
          `:''}
        </div>
      </div>`;
    }).join('');
  }

  async function load(force=false) {
    const panel=$('v36RefundPanel');
    if(!panel)return;
    panel.style.display=isAdmin()?'':'none';
    if(!isAdmin())return;

    const eventId=currentEventId();
    if(!eventId){state.rows=[];render();return;}
    if(!force&&state.busy)return;

    try{
      const data=await sbRpc('staff_refund_list_v38',{
        p_username:HYPE.user,
        p_password:HYPE.pass,
        p_event_id:eventId
      });
      state.eventId=eventId;
      state.rows=arr(data);
      render();
    }catch(err){
      const box=$('v36RefundList');
      if(box)box.innerHTML=`<div class="v36-refund-empty">${esc(err.message||'Erro ao carregar estornos.')}</div>`;
    }
  }

  async function callRefund(ticketId,mode) {
    const cfg=window.HYPE_SUPABASE_CONFIG||{};
    if(!cfg.url||!cfg.anonKey)throw new Error('Supabase não configurado.');

    const response=await fetch(`${cfg.url}/functions/v1/asaas-refund`,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey':cfg.anonKey,
        'Authorization':`Bearer ${cfg.anonKey}`
      },
      body:JSON.stringify({
        ticket_id:Number(ticketId),
        username:HYPE.user,
        password:HYPE.pass,
        mode:mode==='keep_valid'?'keep_valid':'cancel'
      })
    });

    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.success===false){
      throw new Error(data?.error||'O Asaas não aceitou o estorno.');
    }
    return data;
  }

  function modeLabel(mode) {
    return mode==='keep_valid'
      ? 'ESTORNAR E MANTER O QR VÁLIDO COMO CORTESIA'
      : 'ESTORNAR E CANCELAR O INGRESSO';
  }

  async function refundOne(ticketId,mode='cancel') {
    if(!isAdmin()||state.busy)return;
    const row=state.rows.find(r=>Number(r.ticket_id)===Number(ticketId));
    if(!row?.eligible)return alert('Este ingresso não está disponível para estorno.');

    const extra=String(row.entry_status||'')==='Entrada utilizada'
      ? '\n\n⚠️ ATENÇÃO: este ingresso já registrou entrada.'
      : '';

    if(!confirm(`CONFIRMAR ESTORNO NO ASAAS?\n\n${row.customer_name}\n${row.gender||''} • ${row.ticket_code}\nValor: ${money(row.price)}\n\nAção: ${modeLabel(mode)}.${extra}\n\nEssa ação mexe no dinheiro real e não deve ser feita por engano.`))return;

    state.busy=true;
    render();
    setProgress(`Solicitando estorno de ${row.ticket_code} no Asaas...`,true);

    try{
      const result=await callRefund(ticketId,mode);
      setProgress(`✅ ${row.ticket_code}: estorno ${String(result.refund_status||'solicitado').toUpperCase()}.`,true);
      if(typeof hypeNotify==='function'){
        hypeNotify(mode==='keep_valid'?'Estorno solicitado. Ingresso mantido como cortesia.':'Estorno solicitado. Ingresso cancelado.');
      }
      await load(true);
      if(typeof refreshAdminOrders==='function')refreshAdminOrders(true).catch?.(()=>{});
    }catch(err){
      alert(err.message||'Não foi possível estornar.');
      setProgress(`❌ ${err.message||'Falha no estorno.'}`,true);
    }finally{
      state.busy=false;
      render();
    }
  }

  async function refundAll() {
    if(!isAdmin()||state.busy)return;
    const eligible=filteredRows().filter(r=>r.eligible===true);
    if(!eligible.length)return alert('Não há ingressos elegíveis para estorno neste filtro.');

    const mode=selectedMode();
    const total=eligible.reduce((s,r)=>s+Number(r.price||0),0);
    const entered=eligible.filter(r=>String(r.entry_status||'')==='Entrada utilizada').length;

    if(!confirm(`ATENÇÃO — ESTORNO EM LOTE\n\n${eligible.length} ingresso(s)\nTotal a devolver: ${money(total)}\nAção: ${modeLabel(mode)}\n${entered?`\n⚠️ ${entered} ingresso(s) já registraram entrada.\n`:''}\nCada pagamento será enviado ao Asaas individualmente.\n\nCONFIRMAR?`))return;

    state.busy=true;
    render();

    let ok=0,failed=0;
    const errors=[];

    for(let i=0;i<eligible.length;i++){
      const row=eligible[i];
      setProgress(`Estornando ${i+1}/${eligible.length}: ${row.customer_name} • ${row.ticket_code}`,true);
      try{
        await callRefund(row.ticket_id,mode);
        ok++;
      }catch(err){
        failed++;
        errors.push(`${row.ticket_code}: ${err.message||'falha'}`);
      }
    }

    state.busy=false;
    await load(true);
    if(typeof refreshAdminOrders==='function')refreshAdminOrders(true).catch?.(()=>{});
    render();

    const summary=`Concluído: ${ok} estorno(s) solicitado(s)${failed?` • ${failed} falha(s)`:''}.`;
    setProgress(summary,true);
    if(errors.length)alert(`${summary}\n\n${errors.slice(0,8).join('\n')}`);
    else if(typeof hypeNotify==='function')hypeNotify(summary);
  }

  function watch() {
    const signature=(()=>{
      try{return `${HYPE?.role||''}:${HYPE?.selectedEventId||0}`;}
      catch(_){return '';}
    })();
    if(signature&&signature!==state.lastSignature){
      state.lastSignature=signature;
      load(true).catch(()=>{});
    }
  }

  window.HypeV36Refund={load,render,refundOne,refundAll};

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>load(true).catch(()=>{}),1200);
    setInterval(watch,1500);
  });
})();
