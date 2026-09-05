/* HYPE V40.6 — Lista simples na Portaria
   Sem ingresso, sem QR, sem PIX. Apenas nome liberado e confirmação manual de entrada.
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
  function out(html){ const box=$('v406ListResult'); if(box) box.innerHTML=html; }
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

  async function add(){
    const name=($('v406ListName')?.value || '').trim().replace(/\s+/g,' ');
    if(!name || name.length<2) return alert('Digite o nome da pessoa.');
    if(!deviceKey()) return alert('Portaria não autorizada neste computador.');
    if(!eventId()) return alert('Selecione o evento da Portaria.');
    const btn=document.querySelector('#v406ListaSimplesPanel button.primary');
    const old=btn?.textContent;
    if(btn){btn.disabled=true;btn.textContent='SALVANDO...';}
    try{
      await rpc('portaria_guest_simple_add_v406',{p_device_key:deviceKey(),p_event_id:eventId(),p_name:name});
      if($('v406ListName')) $('v406ListName').value='';
      if($('v406ListSearch')) $('v406ListSearch').value=name;
      flash(true,'NOME NA LISTA',name);
      await search();
    }catch(err){
      out(`<div class="empty error">${esc(err.message || 'Erro ao adicionar na lista.')}</div>`);
      flash(false,'ERRO',err.message || 'Erro ao adicionar na lista.');
    }finally{
      if(btn){btn.disabled=false;btn.textContent=old || '+ COLOCAR NA LISTA';}
    }
  }

  async function search(){
    const q=($('v406ListSearch')?.value || $('v406ListName')?.value || '').trim();
    if(!q) return out('<div class="empty">Digite um nome para buscar na lista.</div>');
    if(!deviceKey()) return out('<div class="empty error">Portaria não autorizada neste computador.</div>');
    if(!eventId()) return out('<div class="empty error">Selecione o evento.</div>');
    out('<div class="empty">Buscando na lista...</div>');
    try{
      const rows=arr(await rpc('portaria_guest_simple_search_v406',{p_device_key:deviceKey(),p_event_id:eventId(),p_query:q}));
      if(!rows.length) return out('<div class="empty error">Nenhum nome encontrado na lista deste evento.</div>');
      out(rows.map(render).join(''));
    }catch(err){
      out(`<div class="empty error">${esc(err.message || 'Erro ao buscar lista.')}</div>`);
    }
  }

  function render(row){
    const entrou=String(row.status||'')==='Entrou';
    const cancelado=String(row.status||'')==='Cancelado';
    const cls=cancelado?'bad':(entrou?'bad':'ok');
    const state=cancelado?'CANCELADO':(entrou?'JÁ ENTROU':'LISTA LIBERADA');
    const btn=(!entrou && !cancelado) ? `<button class="btn green" onclick="HypeListaSimples.enter(${Number(row.list_id)})">✅ CONFIRMAR ENTRADA</button>` : '';
    return `<article class="ticket ${cls}"><div><span class="sector">LISTA SIMPLES</span><h2>${esc(row.name||'Nome')}</h2><div class="meta">Sem ingresso • sem QR Code<br>${row.created_at?`Adicionado ${esc(fmt(row.created_at))}`:''}${row.entered_at?`<br>Entrou ${esc(fmt(row.entered_at))}`:''}</div></div><div class="ticket-actions"><div class="state ${entrou||cancelado?'danger':'good'}">${esc(state)}</div>${btn}</div></article>`;
  }

  async function enter(id){
    if(!id) return;
    if(!confirm('Confirmar entrada deste nome da lista?')) return;
    try{
      const rows=arr(await rpc('portaria_guest_simple_enter_v406',{p_device_key:deviceKey(),p_list_id:Number(id)}));
      const r=rows[0];
      if(!r?.ok){ flash(false,'NEGADO',r?.message || 'Não liberado.'); return search(); }
      flash(true,'ENTRADA DA LISTA',r.name || 'Liberado');
      await search();
      if(window.HypePortaria?.refresh) window.HypePortaria.refresh(false).catch(()=>{});
    }catch(err){
      flash(false,'ERRO',err.message || 'Erro ao confirmar entrada.');
    }
  }

  window.HypeListaSimples={add,search,enter};
})();
