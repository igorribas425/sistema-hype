/* HYPE V40.8 — Lista simples na Portaria
   A Portaria não adiciona nomes. Ela só busca nomes cadastrados no Admin e confirma entrada.
*/
(() => {
  'use strict';

  const DEVICE_KEY = 'hype_portaria_device_key_v18';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const arr = (d) => Array.isArray(d) ? d : (d ? [d] : []);

  let sb = null;
  function client(){
    if(sb) return sb;
    const cfg = window.HYPE_SUPABASE_CONFIG || {};
    if(!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');
    if(!window.supabase?.createClient) throw new Error('Biblioteca do Supabase não carregou.');
    sb = window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:false}});
    return sb;
  }
  async function rpc(name,params={}){
    const {data,error}=await client().rpc(name,params);
    if(error) throw new Error(error.message || `Erro em ${name}`);
    return data;
  }
  function deviceKey(){ return localStorage.getItem(DEVICE_KEY) || ''; }
  function eventId(){ return Number(($('eventSelect')?.value || 0)); }
  function out(html,targetId='v406ListResult',append=false){
    const box=$(targetId);
    if(!box) return;
    if(append) box.insertAdjacentHTML('beforeend',html);
    else box.innerHTML=html;
  }
  function flash(ok,title,msg){
    if(window.HypePortaria?.flash) return window.HypePortaria.flash(ok,title,msg);
    const f=$('flash');
    if(!f) return;
    f.innerHTML=`<b>${esc(title)}</b><span>${esc(msg||'')}</span>`;
    f.className=`flash ${ok?'ok':'bad'} show`;
    setTimeout(()=>f.classList.remove('show'),2200);
  }
  function fmt(v){
    if(!v) return '';
    const d=new Date(v);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  function add(){
    alert('Agora a lista é cadastrada somente no Admin. A Portaria só busca e confirma entrada.');
  }

  async function searchRowsForEvent(query, selectedEventId){
    const args={
      p_device_key:deviceKey(),
      p_event_id:Number(selectedEventId),
      p_query:query
    };
    let data;
    try{ data=await rpc('portaria_guest_simple_search_v77',args); }
    catch(_){
      try{ data=await rpc('portaria_guest_simple_search_v72',args); }
      catch(__){
        try{ data=await rpc('portaria_guest_simple_search_v67',args); }
        catch(___){ data=await rpc('portaria_guest_simple_search_v406',args); }
      }
    }
    return arr(data).map(row=>({...row,event_id:Number(selectedEventId)}));
  }

  async function publicListEvent(){
    try{
      return arr(await rpc('public_guest_registration_events_v50'))[0] || null;
    }catch(_){
      return null;
    }
  }

  async function search(query,targetId='v406ListResult',append=false){
    const q=String(query || $('v406ListSearch')?.value || $('searchInput')?.value || '').trim();
    if(!q){ if(!append) out('<div class="empty">Digite um nome para buscar.</div>',targetId); return 0; }
    if(!deviceKey()){ if(!append) out('<div class="empty error">Portaria não autorizada neste computador.</div>',targetId); return 0; }
    if(!eventId()){ if(!append) out('<div class="empty error">Selecione o evento.</div>',targetId); return 0; }
    if(!append) out('<div class="empty">Buscando pessoas...</div>',targetId);
    try{
      let rows=await searchRowsForEvent(q,eventId());
      if(!rows.length){
        const publicEvent=await publicListEvent();
        const publicEventId=Number(publicEvent?.event_id || 0);
        if(publicEventId && publicEventId!==eventId()){
          const fallback=await searchRowsForEvent(q,publicEventId);
          rows=fallback.map(row=>({...row,remote_event_name:publicEvent.event_name,remote_event_date:publicEvent.event_date}));
        }
      }
      if(!rows.length){ if(!append) out('<div class="empty error">Nenhuma pessoa encontrada neste evento.</div>',targetId); return 0; }
      out(rows.map(render).join(''),targetId,append);
      return rows.length;
    }catch(err){
      if(!append) out(`<div class="empty error">${esc(err.message || 'Erro ao buscar lista.')}</div>`,targetId);
      return 0;
    }
  }

  function render(row){
    const entrou=String(row.status||'')==='Entrou';
    const saiu=Boolean(row.final_exit_at);
    const cancelado=String(row.status||'')==='Cancelado';
    const rowEventId=Number(row.event_id || 0);
    const eventMismatch=Boolean(rowEventId && rowEventId!==eventId());
    const cls=cancelado||saiu?'bad':'ok';
    const state=cancelado?'CANCELADO':saiu?'SAÍDA CONFIRMADA':entrou?'DENTRO':(eventMismatch?'OUTRO EVENTO':'LISTA LIBERADA');
    let btn='';
    if(!eventMismatch && !cancelado){
      if(!entrou){
        btn=`<button class="btn green" onclick="HypeListaSimples.enter(${Number(row.list_id)})">✅ CONFIRMAR ENTRADA</button>`;
      }else if(!saiu){
        btn=`<button class="btn red" onclick="HypeV60Exit.openGuest(${Number(row.list_id)}, '${esc(String(row.name||'Nome')).replace(/'/g,'&#039;')}')">🚪 SAÍDA + FEEDBACK</button>`;
      }
    }
    const mismatch=eventMismatch ? `<br><b>Selecione ${esc(row.remote_event_name||'o evento correto')}${row.remote_event_date?` • ${esc(fmt(row.remote_event_date))}`:''} acima para liberar.</b>` : '';
    const fromPortaria=String(row.source||'').toLowerCase().includes('portaria');
    const sourceLabel=fromPortaria?'CADASTRO PORTARIA':'LISTA SIMPLES';
    const contact=[
      row.phone?`📱 ${esc(row.phone)}`:'',
      row.email?`📧 ${esc(row.email)}`:'',
      row.cpf?`CPF: ${esc(row.cpf)}`:'',
      row.payment_method?`Forma registrada: ${esc(row.payment_method)}`:''
    ].filter(Boolean).join('<br>');
    const exitInfo=row.final_exit_at?`<br>Saiu ${esc(fmt(row.final_exit_at))}`:'';
    return `<article class="ticket ${cls}"><div><span class="sector">${sourceLabel}</span><h2>${esc(row.name||'Nome')}</h2><div class="meta">Sem cobrança na Portaria${contact?`<br>${contact}`:''}${row.remote_event_name?`<br>Evento do cadastro: ${esc(row.remote_event_name)}`:''}<br>${row.created_at?`Adicionado ${esc(fmt(row.created_at))}`:''}${row.entered_at?`<br>Entrou ${esc(fmt(row.entered_at))}`:''}${exitInfo}${mismatch}</div></div><div class="ticket-actions"><div class="state ${cancelado||saiu||eventMismatch?'danger':'good'}">${esc(state)}</div>${btn}</div></article>`;
  }

  async function enter(id){
    if(!id) return;
    if(!confirm('Confirmar entrada deste nome da lista?')) return;
    try{
      const rows=arr(await rpc('portaria_guest_simple_enter_v406',{p_device_key:deviceKey(),p_list_id:Number(id)}));
      const r=rows[0];
      if(!r?.ok){ flash(false,'NEGADO',r?.message || 'Não liberado.'); return window.HypePortaria?.search?.(); }
      flash(true,'ENTRADA DA LISTA',r.name || 'Liberado');
      await window.HypePortaria?.search?.();
      if(window.HypePortaria?.refresh) window.HypePortaria.refresh(false).catch(()=>{});
    }catch(err){
      flash(false,'ERRO',err.message || 'Erro ao confirmar entrada.');
    }
  }

  window.HypeListaSimples={add,search,enter};
})();
