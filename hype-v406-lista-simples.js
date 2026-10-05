/* HYPE V106 — Lista simples na Portaria
   A Portaria não adiciona nomes. Ela só busca nomes cadastrados no Admin e confirma entrada.
*/
(() => {
  'use strict';

  const DEVICE_KEY = 'hype_portaria_device_key_v18';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const arr = (d) => Array.isArray(d) ? d : (d ? [d] : []);

  let sb = null;
  let searchSerial = 0;
  let profileRow = null;
  let profileToken = '';
  let profileBusy = false;
  let ignoreToken = '';
  let ignoreTokenUntil = 0;
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
    f.innerHTML=`<div class="flash-box"><b>${esc(title)}</b><span>${esc(msg||'')}</span></div>`;
    f.className=`flash ${ok?'ok':'bad'} show`;
    setTimeout(()=>{ f.className='flash'; f.innerHTML=''; },1800);
  }
  function fmt(v){
    if(!v) return '';
    const d=new Date(v);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  function fmtDate(v){
    if(!v) return '';
    const raw=String(v);
    const d=new Date(raw.length<=10 ? raw+'T12:00:00' : raw);
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('pt-BR');
  }

  function formatCpf(v){
    const d=String(v||'').replace(/\D/g,'');
    return d.length===11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4') : (v||'Não informado');
  }

  function mountProfile(){
    if($('hypeListProfile')) return;
    const style=document.createElement('style');
    style.id='hype-list-profile-style-v106';
    style.textContent=`
      #hypeListProfile{position:fixed;inset:0;z-index:2600;display:none;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.88);backdrop-filter:blur(8px)}
      #hypeListProfile.show{display:flex}
      .hlp-card{width:min(560px,100%);max-height:94vh;overflow:auto;background:#0d0d11;border:1px solid rgba(255,255,255,.16);border-radius:24px;padding:20px;box-shadow:0 22px 70px rgba(0,0,0,.55)}
      .hlp-card.pending{border-color:rgba(255,210,75,.55)}
      .hlp-card.used,.hlp-card.denied{border-color:rgba(255,62,94,.6)}
      .hlp-card.success{border-color:rgba(40,209,124,.7)}
      .hlp-kicker{font-size:10px;font-weight:950;letter-spacing:1.4px;color:#a9a9b3;text-transform:uppercase}
      .hlp-title{font-size:clamp(24px,7vw,38px);font-weight:950;line-height:1.05;margin:8px 0 4px;color:#fff;word-break:break-word}
      .hlp-status{margin:14px 0;padding:11px 13px;border-radius:12px;font-size:11px;font-weight:950;text-align:center;letter-spacing:.5px}
      .hlp-status.pending{background:rgba(255,210,75,.1);border:1px solid rgba(255,210,75,.35);color:#ffe07a}
      .hlp-status.used,.hlp-status.denied{background:rgba(255,22,61,.1);border:1px solid rgba(255,22,61,.38);color:#ff9bab}
      .hlp-status.success{background:rgba(40,209,124,.11);border:1px solid rgba(40,209,124,.4);color:#a8f3c4}
      .hlp-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:14px 0}
      .hlp-field{padding:11px 12px;border:1px solid rgba(255,255,255,.1);background:#08080b;border-radius:12px;min-width:0}
      .hlp-field.full{grid-column:1/-1}
      .hlp-field small{display:block;color:#80818b;font-size:9px;font-weight:900;letter-spacing:.7px;text-transform:uppercase;margin-bottom:5px}
      .hlp-field b{display:block;color:#fff;font-size:13px;line-height:1.35;overflow-wrap:anywhere}
      .hlp-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:15px}
      .hlp-btn{min-height:52px;border:0;border-radius:13px;font-weight:950;font-size:12px;cursor:pointer}
      .hlp-btn.confirm{background:#28d17c;color:#03140c}
      .hlp-btn.close{background:#23232b;color:#fff;border:1px solid rgba(255,255,255,.13)}
      .hlp-btn:disabled{opacity:.55;cursor:wait}
      .hlp-success-mark{font-size:50px;text-align:center;margin:6px 0}
      @media(max-width:480px){.hlp-grid{grid-template-columns:1fr}.hlp-field.full{grid-column:auto}.hlp-actions{grid-template-columns:1fr}.hlp-card{padding:17px;border-radius:20px}}
    `;
    document.head.appendChild(style);
    const modal=document.createElement('div');
    modal.id='hypeListProfile';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    document.body.appendChild(modal);
  }

  function profileFields(row){
    const eventLabel=[row.event_name||'Evento HYPE',row.event_date?fmtDate(row.event_date):''].filter(Boolean).join(' • ');
    return `
      <div class="hlp-grid">
        <div class="hlp-field full"><small>Evento</small><b>${esc(eventLabel)}</b></div>
        <div class="hlp-field"><small>Gênero</small><b>${esc(row.gender||'Não informado')}</b></div>
        <div class="hlp-field"><small>CPF</small><b>${esc(formatCpf(row.cpf))}</b></div>
        <div class="hlp-field"><small>WhatsApp</small><b>${esc(row.phone||'Não informado')}</b></div>
        <div class="hlp-field"><small>E-mail</small><b>${esc(row.email||'Não informado')}</b></div>
        <div class="hlp-field full"><small>Origem</small><b>${esc(row.source||'Lista HYPE')}</b></div>
      </div>`;
  }

  function showProfile(row, token, mode='pending', message=''){
    mountProfile();
    profileRow=row||null;
    profileToken=String(token||profileToken||'');
    profileBusy=false;
    const modal=$('hypeListProfile');
    if(!modal || !row) return;
    const usedAt=row.entered_at ? fmt(row.entered_at) : '';
    const statusText=mode==='pending'
      ? 'CONFIRA OS DADOS E CONFIRME A ENTRADA'
      : mode==='used'
        ? `QR JÁ UTILIZADO${usedAt?' • ENTROU '+usedAt:''}`
        : mode==='success'
          ? 'ENTRADA LIBERADA'
          : (message||'ENTRADA NÃO LIBERADA');
    const successMark=mode==='success' ? '<div class="hlp-success-mark">✅</div>' : '';
    const actions=mode==='pending'
      ? `<div class="hlp-actions">
          <button class="hlp-btn confirm" id="hypeListProfileConfirm" type="button" onclick="HypeListaSimples.confirmProfile()">✅ CONFIRMAR ENTRADA</button>
          <button class="hlp-btn close" type="button" onclick="HypeListaSimples.closeProfile()">CANCELAR / PRÓXIMO QR</button>
        </div>`
      : `<div class="hlp-actions" style="grid-template-columns:1fr">
          <button class="hlp-btn close" type="button" onclick="HypeListaSimples.closeProfile()">PRÓXIMO QR</button>
        </div>`;
    modal.innerHTML=`
      <section class="hlp-card ${esc(mode)}">
        <div class="hlp-kicker">LISTA HYPE • PERFIL DA PESSOA</div>
        ${successMark}
        <div class="hlp-title">${esc(row.name||'Nome')}</div>
        <div class="hlp-status ${esc(mode)}">${esc(statusText)}</div>
        ${profileFields(row)}
        ${actions}
      </section>`;
    modal.classList.add('show');
  }

  function closeProfile(){
    const token=profileToken;
    const modal=$('hypeListProfile');
    modal?.classList.remove('show');
    if(modal) modal.innerHTML='';
    profileRow=null;
    profileToken='';
    profileBusy=false;
    if(token){
      ignoreToken=token;
      ignoreTokenUntil=Date.now()+1800;
    }
  }

  async function confirmProfile(){
    if(profileBusy || !profileRow?.list_id) return;
    profileBusy=true;
    const btn=$('hypeListProfileConfirm');
    if(btn){ btn.disabled=true; btn.textContent='CONFIRMANDO...'; }
    try{
      const r=arr(await rpc('portaria_guest_simple_enter_v406',{
        p_device_key:deviceKey(),
        p_list_id:Number(profileRow.list_id)
      }))[0]||{};

      if(!r.ok){
        profileRow={...profileRow,status:r.status||profileRow.status,entered_at:r.entered_at||profileRow.entered_at};
        if(/já entrou|ja entrou/i.test(String(r.message||''))){
          showProfile(profileRow,profileToken,'used',r.message||'Nome já entrou.');
        }else{
          showProfile(profileRow,profileToken,'denied',r.message||'Entrada não liberada.');
        }
        return;
      }

      profileRow={...profileRow,status:'Entrou',entered_at:r.entered_at||new Date().toISOString(),name:r.name||profileRow.name};
      const input=$('searchInput');
      if(input) input.value='';
      const results=$('results');
      if(results) results.innerHTML=`<div class="empty">✅ ${esc(profileRow.name||'Nome')} entrou pela Lista HYPE. Pronto para o próximo QR.</div>`;
      showProfile(profileRow,profileToken,'success');
      if(window.HypePortaria?.refresh) window.HypePortaria.refresh(false).catch(()=>{});
    }catch(err){
      console.warn('[HYPE V106][confirma Lista]',err);
      showProfile(profileRow,profileToken,'denied',err.message||'Erro ao confirmar entrada.');
    }finally{
      profileBusy=false;
    }
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
    try{ data=await rpc('portaria_guest_simple_search_v102',args); }
    catch(_){
      try{ data=await rpc('portaria_guest_simple_search_v77',args); }
      catch(__){
        try{ data=await rpc('portaria_guest_simple_search_v72',args); }
        catch(___){
          try{ data=await rpc('portaria_guest_simple_search_v67',args); }
          catch(____){ data=await rpc('portaria_guest_simple_search_v406',args); }
        }
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

  async function search(query,targetId='v406ListResult',append=false,silent=false){
    const seq=++searchSerial;
    const q=String(query || $('v406ListSearch')?.value || $('searchInput')?.value || '').trim();
    if(!q){ if(!append && !silent) out('<div class="empty">Digite um nome para buscar.</div>',targetId); return 0; }
    if(!deviceKey()){ if(!append && !silent) out('<div class="empty">Portaria não autorizada neste computador.</div>',targetId); return 0; }
    if(!eventId()){ if(!append && !silent) out('<div class="empty">Selecione o evento.</div>',targetId); return 0; }
    if(!append && !silent) out('<div class="empty">Buscando pessoas...</div>',targetId);
    try{
      // V81: busca somente no evento selecionado. Não puxa nomes de outro evento.
      const rows=await searchRowsForEvent(q,eventId());
      if(seq!==searchSerial) return 0;
      const liveMain=targetId==='results' ? String($('searchInput')?.value || '').trim() : q;
      if(targetId==='results' && liveMain!==q) return 0;
      if(!rows.length){
        if(!append && !silent) out('',targetId);
        return 0;
      }
      out(rows.map(render).join(''),targetId,append);
      return rows.length;
    }catch(err){
      if(seq!==searchSerial) return 0;
      console.warn('[HYPE V104][busca lista]',err);
      if(!append && !silent){
        const msg=String(err?.message||err||'');
        const networkFail=navigator.onLine===false || /failed to fetch|fetch failed|network|connection|timeout|offline/i.test(msg);
        out(networkFail
          ? '<div class="empty">⚠️ Sem internet. Reconecte e tente a busca novamente.</div>'
          : '<div class="empty">⚠️ Não foi possível consultar a Lista HYPE. Tente novamente.</div>',targetId);
      }
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

  async function processQr(rawCode){
    const token=String(rawCode||'').trim().replace(/^#/,'');
    if(!token || !deviceKey()) return false;

    // Evita reabrir imediatamente o mesmo perfil enquanto o QR ainda está
    // apontado para a câmera após o porteiro tocar em "Próximo QR".
    if(token===ignoreToken && Date.now()<ignoreTokenUntil) return true;
    if(profileRow && profileToken===token && $('hypeListProfile')?.classList.contains('show')) return true;

    try{
      const rows=arr(await rpc('portaria_guest_qr_lookup_v103',{
        p_device_key:deviceKey(),
        p_qr_token:token
      }));
      const row=rows[0]||null;
      if(!row) return false;

      if(Number(row.event_id)!==eventId()){
        out(render(row),'results',false);
        flash(false,'QR DA LISTA DE OUTRO EVENTO',row.event_name||'Selecione o evento correto.');
        return true;
      }

      out(render(row),'results',false);

      // V106: QR da Lista não registra entrada sozinho.
      // Primeiro mostra o perfil e exige confirmação do porteiro.
      if(String(row.status||'')==='Entrou'){
        showProfile(row,token,'used');
        return true;
      }

      showProfile(row,token,'pending');
      return true;
    }catch(err){
      console.warn('[HYPE V106][QR Lista]',err);
      const msg=String(err?.message||err||'');
      const networkFail=navigator.onLine===false || /failed to fetch|fetch failed|network|connection|timeout|offline/i.test(msg);
      if(networkFail){
        flash(false,'SEM INTERNET','A conexão caiu ao consultar a Lista HYPE. Reconecte e leia este QR novamente.');
      }else{
        flash(false,'ERRO NA LISTA HYPE',msg || 'Não foi possível consultar este QR. Tente novamente.');
      }
      return true;
    }
  }

  async function enter(id){
    if(!id) return;
    if(!confirm('Confirmar entrada deste nome da lista?')) return;
    try{
      const rows=arr(await rpc('portaria_guest_simple_enter_v406',{p_device_key:deviceKey(),p_list_id:Number(id)}));
      const r=rows[0];
      if(!r?.ok){ flash(false,'NEGADO',r?.message || 'Não liberado.'); return window.HypePortaria?.search?.(); }
      flash(true,'ENTRADA DA LISTA',r.name || 'Liberado');
      const input=$('searchInput');
      if(input) input.value='';
      const results=$('results');
      if(results) results.innerHTML='<div class="empty">✅ Entrada registrada. Pronto para a próxima pessoa.</div>';
      const listResults=$('v406ListResult');
      if(listResults) listResults.innerHTML='<div class="empty">Nome salvo na lista. Busque a próxima pessoa.</div>';
      if(window.HypePortaria?.refresh) window.HypePortaria.refresh(false).catch(()=>{});
    }catch(err){
      flash(false,'ERRO',err.message || 'Erro ao confirmar entrada.');
    }
  }

  window.HypeListaSimples={add,search,enter,processQr,showProfile,closeProfile,confirmProfile};
})();
