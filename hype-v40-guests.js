/* HYPE V40 — Adicionar convidado/cortesia pelo Admin */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => typeof hypeEscape === 'function' ? hypeEscape(v) : String(v ?? '');
  const arr = v => Array.isArray(v) ? v : (v ? [v] : []);

  function ready(){
    try { return !!(HYPE?.user && HYPE?.pass && ['admin','gerente','caixa'].includes(String(HYPE?.role||'').toLowerCase())); }
    catch(_){ return false; }
  }
  function auth(extra={}){ return {p_username:HYPE.user,p_password:HYPE.pass,...extra}; }
  function result(text,ok=true){ const el=$('v40GuestResult'); if(!el)return; el.className='v40-guest-result '+(ok?'ok':'bad'); el.innerHTML=text; }

  async function listEvents(){
    let data=[];
    try { data=arr(await sbRpc('staff_list_raffle_events_v23',auth())); }
    catch(_) { data=arr(await sbRpc('staff_list_events_v13',auth())); }
    data.sort((a,b)=>String(a.event_date||'9999-12-31').localeCompare(String(b.event_date||'9999-12-31'))||Number(a.id)-Number(b.id));
    return data;
  }

  async function loadEvents(){
    const sel=$('v40GuestEvent'); if(!sel||!ready())return;
    try{
      const data=await listEvents();
      sel.innerHTML=data.length?data.map(e=>`<option value="${Number(e.id)}">${esc(e.name||'Evento')} • ${esc(e.event_date||'')}</option>`).join(''):'<option value="">Nenhum evento</option>';
      const preferred=Number(HYPE?.selectedEventId||0);
      if(preferred && data.some(e=>Number(e.id)===preferred))sel.value=String(preferred);
      await loadLots();
    }catch(err){ sel.innerHTML='<option value="">Erro ao carregar</option>'; result(esc(err.message||'Erro ao carregar eventos.'),false); }
  }

  async function loadLots(){
    const eventId=Number($('v40GuestEvent')?.value||0); const sel=$('v40GuestLot');
    if(!sel)return;
    if(!eventId){sel.innerHTML='<option value="">Selecione o evento</option>';return;}
    sel.innerHTML='<option value="">Carregando...</option>';
    try{
      const lots=arr(await sbRpc('staff_list_lots_v16',auth({p_event_id:eventId})));
      const active=lots.filter(l=>l.active!==false);
      sel.innerHTML=active.length?active.map(l=>`<option value="${Number(l.id)}">${esc(l.name||'Ingresso')} • ${esc(l.sector||'')}</option>`).join(''):'<option value="">Nenhum ingresso ativo</option>';
    }catch(err){sel.innerHTML='<option value="">Erro ao carregar</option>';result(esc(err.message||'Erro ao carregar ingressos.'),false);}
  }

  async function add(){
    if(!ready())return alert('Entre novamente no Admin.');
    const eventId=Number($('v40GuestEvent')?.value||0), lotId=Number($('v40GuestLot')?.value||0);
    const name=String($('v40GuestName')?.value||'').trim();
    const gender=String($('v40GuestGender')?.value||'Feminino');
    const cpf=String($('v40GuestCpf')?.value||'').replace(/\D/g,'');
    if(!eventId)return alert('Selecione o evento.');
    if(!lotId)return alert('Selecione o ingresso/lote.');
    if(name.length<2)return alert('Digite o nome da pessoa.');
    if(cpf && cpf.length!==11)return alert('CPF precisa ter 11 números ou pode ficar vazio.');
    const btn=$('v40GuestAdd'); if(btn){btn.disabled=true;btn.textContent='ADICIONANDO...';}
    try{
      const row=arr(await sbRpc('staff_add_guest_ticket_v40',auth({p_event_id:eventId,p_lot_id:lotId,p_name:name,p_gender:gender,p_cpf:cpf||null})))[0];
      if(!row?.ticket_id)throw new Error('O ingresso não foi criado.');
      result(`✅ <b>${esc(name)}</b> adicionado. Código: <b>${esc(row.ticket_code||'')}</b>. Já está válido na Portaria e entra no sorteio se ele estiver ativo.`,true);
      if($('v40GuestName'))$('v40GuestName').value=''; if($('v40GuestCpf'))$('v40GuestCpf').value='';
      try{ if(typeof refreshAdminOrders==='function') await refreshAdminOrders(true); }catch(_){ }
      try{ if(Number($('v18RaffleEvent')?.value||0)===eventId && typeof loadRaffleV18==='function') await loadRaffleV18(false); }catch(_){ }
      try{ if(Number($('v18RaffleEvent')?.value||0)===eventId && typeof loadRaffleParticipantsV18==='function') await loadRaffleParticipantsV18(true); }catch(_){ }
    }catch(err){result(`❌ ${esc(err.message||'Não foi possível adicionar a pessoa.')}`,false);}
    finally{if(btn){btn.disabled=false;btn.textContent='+ ADICIONAR INGRESSO';}}
  }


  async function addList(){
    if(!ready())return alert('Entre novamente no Admin.');
    const eventId=Number($('v40GuestEvent')?.value||0), lotId=Number($('v40GuestLot')?.value||0);
    const gender=String($('v40GuestGender')?.value||'Feminino');
    const raw=String($('v40GuestList')?.value||'');
    const names=[...new Set(raw.split(/\n|;|,/).map(x=>x.trim()).filter(x=>x.length>=2))];
    if(!eventId)return alert('Selecione o evento.');
    if(!lotId)return alert('Selecione o ingresso/lote.');
    if(!names.length)return alert('Cole os nomes, um por linha.');
    if(names.length>150)return alert('Faça no máximo 150 nomes por vez para não travar a internet.');
    if(!confirm(`Adicionar ${names.length} pessoa(s) como cortesia/PAGO neste evento?\n\nCada nome ganha QR válido e entra no sorteio.`))return;
    const btn=$('v40GuestAddList'); if(btn){btn.disabled=true;btn.textContent='ADICIONANDO LISTA...';}
    let ok=0, fail=[];
    result(`⏳ Adicionando ${names.length} nome(s)...`,true);
    for(const name of names){
      try{
        const row=arr(await sbRpc('staff_add_guest_ticket_v40',auth({p_event_id:eventId,p_lot_id:lotId,p_name:name,p_gender:gender,p_cpf:null})))[0];
        if(row?.ticket_id)ok++; else fail.push(name);
      }catch(err){ fail.push(`${name} (${err.message||'erro'})`); }
      if(ok%10===0)result(`⏳ ${ok}/${names.length} adicionados...`,true);
    }
    if(ok && $('v40GuestList'))$('v40GuestList').value=fail.length?fail.map(x=>String(x).replace(/ \(.+\)$/,'')).join('\n'):'';
    const failText=fail.length?`<br><br>⚠️ Falhou: ${esc(fail.slice(0,8).join(', '))}${fail.length>8?'...':''}`:'';
    result(`✅ ${ok} pessoa(s) adicionada(s). Já estão na lista de ingressos e no sorteio como PAGO/CORTESIA.${failText}`,fail.length===0);
    try{ if(typeof refreshAdminOrders==='function') await refreshAdminOrders(true); }catch(_){ }
    try{ if(Number($('v18RaffleEvent')?.value||0)===eventId && typeof loadRaffleV18==='function') await loadRaffleV18(false); }catch(_){ }
    try{ if(Number($('v18RaffleEvent')?.value||0)===eventId && typeof loadRaffleParticipantsV18==='function') await loadRaffleParticipantsV18(true); }catch(_){ }
    if(btn){btn.disabled=false;btn.textContent='+ ADICIONAR LISTA';}
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{if(ready())loadEvents().catch(()=>{});},1200));
  window.HypeV40Guests={loadEvents,loadLots,add,addList};
})();
