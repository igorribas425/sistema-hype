/* HYPE V103 — Cadastro permanente de clientes
   Unifica compras + Lista/FREE sem duplicar a pessoa.
   Mostra histórico, frequência e bloqueios.
*/
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const arr = d => Array.isArray(d) ? d : (d ? [d] : []);

  let timer = null;

  function ready(){
    try { return typeof HYPE !== 'undefined' && HYPE?.user && HYPE?.pass && typeof sbRpc === 'function'; }
    catch(_) { return false; }
  }

  function fmtDate(v){
    if(!v) return '—';
    const d = new Date(String(v).length<=10 ? String(v)+'T12:00:00' : v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  }

  function fmtDateTime(v){
    if(!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
  }

  function money(v){
    const n=Number(v||0);
    return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }

  function blockLabel(row){
    if(row.block_type==='permanent') return '<span class="v103-badge block">BLOQUEIO PERMANENTE</span>';
    if(row.block_type==='temporary'){
      const until=row.blocked_until ? fmtDateTime(row.blocked_until) : 'data não informada';
      return `<span class="v103-badge temp">BLOQUEADO ATÉ ${esc(until)}</span>`;
    }
    return '<span class="v103-badge ok">LIBERADO</span>';
  }

  function activityLine(a){
    const src=a.source_type==='ticket'?'🎟️ INGRESSO':'📋 LISTA';
    const status=a.source_type==='ticket'
      ? (a.payment_status||'')
      : (a.list_status||'');
    const attended=a.attended_at ? ` • ✅ ENTROU ${esc(fmtDateTime(a.attended_at))}` : '';
    const price=a.source_type==='ticket' ? ` • ${esc(money(a.price))}` : '';
    const lot=a.lot_name ? ` • ${esc(a.lot_name)}` : '';
    return `<div class="v103-history-row"><b>${src}</b><span>${esc(a.event_name||'Evento HYPE')} • ${esc(fmtDate(a.event_date))}${lot}${price}</span><small>${esc(status)}${attended}${a.ticket_code?` • ${esc(a.ticket_code)}`:''}</small></div>`;
  }

  function render(rows){
    const list=$('v103CustomerRegistryList');
    const total=$('v103CustomerCount');
    const blocked=$('v103BlockedCount');
    const attended=$('v103AttendanceTotal');
    if(total) total.textContent=String(rows.length);
    if(blocked) blocked.textContent=String(rows.filter(r=>r.block_type!=='none' && (r.block_type==='permanent' || !r.blocked_until || new Date(r.blocked_until)>new Date())).length);
    if(attended) attended.textContent=String(rows.reduce((s,r)=>s+Number(r.attendance_count||0),0));

    if(!list) return;
    if(!rows.length){
      list.innerHTML='<div class="v103-empty">Nenhum cliente cadastrado ainda.</div>';
      return;
    }

    list.innerHTML=rows.map(row=>{
      const activities=Array.isArray(row.activities)?row.activities:[];
      const buttons=row.block_type==='none'
        ? `<button class="v103-btn warn" onclick="HypeCustomerRegistryV103.tempBlock(${Number(row.customer_id)},'${esc(row.name).replace(/'/g,'&#039;')}')">⏳ BLOQUEIO TEMP.</button>
           <button class="v103-btn danger" onclick="HypeCustomerRegistryV103.permanentBlock(${Number(row.customer_id)},'${esc(row.name).replace(/'/g,'&#039;')}')">⛔ BLOQUEIO PERMANENTE</button>`
        : `<button class="v103-btn good" onclick="HypeCustomerRegistryV103.unblock(${Number(row.customer_id)},'${esc(row.name).replace(/'/g,'&#039;')}')">✅ DESBLOQUEAR</button>`;

      const reason=row.block_reason ? `<div class="v103-reason">Motivo: ${esc(row.block_reason)}</div>` : '';

      return `<article class="v103-card">
        <div class="v103-head">
          <div>
            <h4>${esc(row.name||'Sem nome')}</h4>
            <div class="v103-contact">
              ${row.cpf?`CPF: ${esc(row.cpf)} • `:''}
              ${row.phone?`📱 ${esc(row.phone)} • `:''}
              ${row.email?`📧 ${esc(row.email)}`:''}
            </div>
          </div>
          ${blockLabel(row)}
        </div>

        ${reason}

        <div class="v103-stats">
          <div><b>${Number(row.attendance_count||0)}</b><span>VEZ(ES) QUE FOI À FESTA</span></div>
          <div><b>${Number(row.ticket_count||0)}</b><span>INGRESSOS</span></div>
          <div><b>${Number(row.list_count||0)}</b><span>LISTA / FREE</span></div>
        </div>

        <div class="v103-last">
          <b>Último registro:</b> ${esc(row.last_event_name||'—')} ${row.last_event_date?`• ${esc(fmtDate(row.last_event_date))}`:''}
        </div>

        <details class="v103-history">
          <summary>VER HISTÓRICO DE INGRESSOS E LISTA</summary>
          <div>${activities.length?activities.map(activityLine).join(''):'<div class="v103-empty">Sem histórico.</div>'}</div>
        </details>

        <div class="v103-actions">${buttons}</div>
      </article>`;
    }).join('');
  }

  async function load(){
    if(!ready()) return;
    const q=($('v103CustomerSearch')?.value||'').trim();
    const box=$('v103CustomerRegistryList');
    if(box) box.innerHTML='<div class="v103-empty">Carregando cadastros...</div>';
    try{
      const rows=arr(await sbRpc('staff_customer_registry_list_v103',{
        p_username:HYPE.user,
        p_password:HYPE.pass,
        p_search:q
      }));
      render(rows);
    }catch(err){
      console.warn('[HYPE V103][cadastros]',err);
      if(box) box.innerHTML=`<div class="v103-empty error">${esc(err.message||'Erro ao carregar cadastros.')}</div>`;
    }
  }

  function search(){
    clearTimeout(timer);
    timer=setTimeout(load,250);
  }

  async function setBlock(id,mode,days=null,reason=''){
    const res=arr(await sbRpc('staff_customer_registry_block_v103',{
      p_username:HYPE.user,
      p_password:HYPE.pass,
      p_customer_id:Number(id),
      p_mode:mode,
      p_days:days,
      p_reason:reason||null
    }))[0]||{};
    if(typeof hypeNotify==='function') hypeNotify(res.message||'Cadastro atualizado.');
    await load();
  }

  async function tempBlock(id,name){
    const days=Number(prompt(`Bloqueio temporário de ${name}.\n\nPor quantos dias?`,'30'));
    if(!Number.isFinite(days) || days<1) return;
    const reason=prompt('Motivo do bloqueio temporário (opcional):','')||'';
    if(!confirm(`Bloquear ${name} por ${days} dia(s)?\n\nA pessoa não poderá comprar, entrar na Lista/FREE nem passar na Portaria durante o bloqueio.`)) return;
    try{ await setBlock(id,'temporary',Math.round(days),reason); }
    catch(err){ alert(err.message||'Não foi possível bloquear.'); }
  }

  async function permanentBlock(id,name){
    const reason=prompt(`Motivo do bloqueio permanente de ${name} (opcional):`,'')||'';
    if(!confirm(`BLOQUEAR PERMANENTEMENTE ${name}?\n\nA pessoa não poderá comprar, entrar na Lista/FREE nem passar na Portaria até ser desbloqueada.`)) return;
    try{ await setBlock(id,'permanent',null,reason); }
    catch(err){ alert(err.message||'Não foi possível bloquear.'); }
  }

  async function unblock(id,name){
    if(!confirm(`Desbloquear ${name}?`)) return;
    try{ await setBlock(id,'none',null,''); }
    catch(err){ alert(err.message||'Não foi possível desbloquear.'); }
  }

  window.HypeCustomerRegistryV103={load,search,tempBlock,permanentBlock,unblock};
})();
