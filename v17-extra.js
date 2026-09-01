/* HYPE V17.3 - contingência persistente, documento, reentrada, logs e ingresso salvo */
(function(){
  const OFFLINE_KEY='hype_v17_portaria_snapshot';
  const QUEUE_KEY='hype_v17_portaria_queue';
  const OFFLINE_AUTH_KEY='hype_v17_portaria_auth_v173';
  const SAVED_TICKET_KEY='hype_v17_saved_ticket';
  const OFFLINE_DB='hype_v17_portaria_v173';
  const OFFLINE_STORE='kv';
  const OFFLINE_TTL_MS=12*60*60*1000;
  const CACHE_NAME='hype-v17-3-offline';
  const norm=v=>String(v||'').replace(/\D/g,'');
  const online=()=>navigator.onLine!==false;

  function localRead(k,f){
    try{
      const raw=localStorage.getItem(k);
      if(!raw)return f;
      const val=JSON.parse(raw);
      return val==null?f:val;
    }catch(_){return f}
  }
  function localWrite(k,v){
    try{localStorage.setItem(k,JSON.stringify(v));return true}catch(_){return false}
  }
  function openOfflineDb(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)) return reject(new Error('IndexedDB indisponível'));
      const req=indexedDB.open(OFFLINE_DB,1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(OFFLINE_STORE))db.createObjectStore(OFFLINE_STORE)};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Falha ao abrir armazenamento offline'));
    });
  }
  async function idbSet(k,v){
    const db=await openOfflineDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(OFFLINE_STORE,'readwrite');
      tx.objectStore(OFFLINE_STORE).put(v,k);
      tx.oncomplete=()=>{db.close();resolve(true)};
      tx.onerror=()=>{const e=tx.error;db.close();reject(e||new Error('Falha ao salvar offline'))};
    });
  }
  async function idbGet(k){
    const db=await openOfflineDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(OFFLINE_STORE,'readonly');
      const req=tx.objectStore(OFFLINE_STORE).get(k);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Falha ao ler offline'));
      tx.oncomplete=()=>db.close();
    });
  }
  async function durableWrite(k,v){
    const localOk=localWrite(k,v);
    let idbOk=false;
    try{await idbSet(k,v);idbOk=true}catch(_){}
    if(!localOk&&!idbOk) throw new Error('O navegador bloqueou o armazenamento offline. Saia do modo anônimo/privado e tente novamente.');
    return true;
  }
  async function durableRead(k,f=null){
    const local=localRead(k,undefined);
    if(local!==undefined)return local;
    try{
      const val=await idbGet(k);
      if(val!==undefined){localWrite(k,val);return val}
    }catch(_){}
    return f;
  }
  const readJSON=(k,f)=>localRead(k,f);
  const writeJSON=(k,v)=>{localWrite(k,v);idbSet(k,v).catch(()=>{});};

  async function digestPassword(username,password){
    if(!window.crypto?.subtle) throw new Error('Este navegador não permite proteger a autorização offline.');
    const bytes=new TextEncoder().encode(`HYPE-V17.3|${location.origin}|${String(username).toLowerCase()}|${password}`);
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function authExpired(auth){return !auth?.expires_at||Date.now()>=new Date(auth.expires_at).getTime()}

  async function warmOfflineCache(){
    try{
      if('serviceWorker' in navigator){
        const reg=await navigator.serviceWorker.ready;
        try{await reg.update()}catch(_){}
      }
      if('caches' in window){
        const cache=await caches.open(CACHE_NAME);
        const urls=['./portaria.html','./app.js?v=20260901-v17-3','./v17-extra.js?v=20260901-v17-3','./v17-extra.css?v=20260901-v17-3','./register-sw.js?v=20260901-v17-3','./supabase-config.js','./apple-touch-icon.png'];
        for(const u of urls){
          try{const r=await fetch(u,{cache:'reload'});if(r.ok)await cache.put(new Request(u),r.clone())}catch(_){}
        }
      }
    }catch(_){}
  }

  window.hypeV17RestoreOfflineStorage=async function(){
    for(const k of [OFFLINE_KEY,QUEUE_KEY,OFFLINE_AUTH_KEY]){
      if(localRead(k,undefined)===undefined){
        try{const v=await idbGet(k);if(v!==undefined)localWrite(k,v)}catch(_){}
      }
    }
    window.hypeV17UpdateOfflineBadge();
  };

  window.hypeV17DownloadOffline = async function(){
    if(!HYPE.user||!HYPE.pass) return alert('Faça login novamente.');
    const eventId=Number(HYPE.portariaEventId||document.getElementById('portariaEventSelect')?.value||0);
    if(!eventId) return alert('Selecione um evento.');
    if(!online()) return alert('Conecte à internet para preparar o modo offline.');
    const btn=[...document.querySelectorAll('button')].find(b=>b.getAttribute('onclick')==='hypeV17DownloadOffline()');
    const oldText=btn?.textContent;
    if(btn){btn.disabled=true;btn.textContent='SALVANDO OFFLINE...'}
    try{
      const rows=await v17rpc('staff_offline_snapshot_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_event_id:eventId});
      const tickets=Array.isArray(rows)?rows:[];
      const eventName=document.getElementById('portariaEventSelect')?.selectedOptions?.[0]?.textContent?.trim()||HYPE.event?.name||`Evento ${eventId}`;
      const now=new Date();
      const snapshot={event_id:eventId,event_name:eventName,downloaded_at:now.toISOString(),tickets};
      const password_hash=await digestPassword(HYPE.user,HYPE.pass);
      const auth={username:String(HYPE.user),role:HYPE.role||'portaria',event_id:eventId,password_hash,created_at:now.toISOString(),expires_at:new Date(now.getTime()+OFFLINE_TTL_MS).toISOString()};
      await durableWrite(OFFLINE_KEY,snapshot);
      await durableWrite(QUEUE_KEY,readJSON(QUEUE_KEY,[]));
      await durableWrite(OFFLINE_AUTH_KEY,auth);
      await warmOfflineCache();
      const verify=await durableRead(OFFLINE_KEY,null);
      if(!verify||Number(verify.event_id)!==eventId||!Array.isArray(verify.tickets)||verify.tickets.length!==tickets.length){
        throw new Error('A conferência do armazenamento offline falhou. Tente novamente fora do modo anônimo/privado.');
      }
      window.hypeV17UpdateOfflineBadge();
      hypeNotify(`✅ Offline salvo: ${tickets.length} ingressos neste aparelho.`);
      alert(`MODO OFFLINE PRONTO ✅\n\n${tickets.length} ingresso(s) pagos salvos.\nEvento: ${eventName}\nValidade da autorização offline: 12 horas.\n\nAgora você pode testar ativando o modo avião e recarregando a Portaria.`);
    }catch(e){alert(e.message||e)}
    finally{if(btn){btn.disabled=false;btn.textContent=oldText||'⬇ PREPARAR MODO OFFLINE'}}
  };

  window.hypeV17TestOffline=async function(){
    const snap=await durableRead(OFFLINE_KEY,null);
    const auth=await durableRead(OFFLINE_AUTH_KEY,null);
    if(!snap?.tickets) return alert('Nenhum pacote offline salvo neste aparelho. Clique em PREPARAR MODO OFFLINE.');
    const when=snap.downloaded_at?new Date(snap.downloaded_at).toLocaleString('pt-BR'):'sem data';
    const authText=authExpired(auth)?'EXPIRADA':'VÁLIDA';
    alert(`OFFLINE SALVO ✅\n\nEvento: ${snap.event_name||snap.event_id}\nIngressos: ${snap.tickets.length}\nSalvo em: ${when}\nAutorização: ${authText}\n\nPara testar de verdade: ative o modo avião e atualize esta página.`);
  };

  window.hypeV17UpdateOfflineBadge=function(){
    const el=document.getElementById('v17OfflineStatus'); if(!el)return;
    const snap=readJSON(OFFLINE_KEY,null), q=readJSON(QUEUE_KEY,[]);
    const when=snap?.downloaded_at?new Date(snap.downloaded_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
    const saved=snap?.tickets?.length||0;
    el.textContent=online()?`ONLINE • offline salvo: ${saved}${when?` às ${when}`:''} • fila ${q.length}`:`OFFLINE • ${saved} ingressos • fila ${q.length}`;
    el.className='v17-offline-badge '+(online()?'online':'offline');
  };

  window.hypeV17OfflineResumeSession=async function(username,password){
    const auth=await durableRead(OFFLINE_AUTH_KEY,null);
    const snap=await durableRead(OFFLINE_KEY,null);
    if(!auth||!snap||authExpired(auth))return false;
    if(String(auth.username||'').toLowerCase()!==String(username||'').toLowerCase())return false;
    try{return (await digestPassword(username,password))===auth.password_hash}catch(_){return false}
  };

  window.hypeV17OfflineLogin=async function(username,password){
    const auth=await durableRead(OFFLINE_AUTH_KEY,null);
    const snap=await durableRead(OFFLINE_KEY,null);
    if(!auth||!snap)return {ok:false,message:'Este aparelho ainda não foi preparado para funcionar offline.'};
    if(authExpired(auth))return {ok:false,message:'A autorização offline expirou. Conecte à internet e prepare o modo offline novamente.'};
    if(String(auth.username||'').toLowerCase()!==String(username||'').toLowerCase())return {ok:false,message:'Usuário não autorizado neste pacote offline.'};
    const hash=await digestPassword(username,password);
    if(hash!==auth.password_hash)return {ok:false,message:'Senha incorreta para o modo offline.'};
    return {ok:true,role:auth.role||'portaria'};
  };

  window.hypeV17InitOfflinePortaria=async function(){
    const snap=await durableRead(OFFLINE_KEY,null);
    if(!snap?.tickets)throw new Error('Nenhum pacote offline salvo neste aparelho.');
    HYPE.portariaEventId=Number(snap.event_id||0);
    HYPE.portariaOffline=true;
    const sel=document.getElementById('portariaEventSelect');
    if(sel){sel.innerHTML=`<option value="${Number(snap.event_id)}">${hypeEscape(snap.event_name||`Evento ${snap.event_id}`)} — OFFLINE</option>`;sel.value=String(snap.event_id);sel.disabled=true}
    const tickets=snap.tickets||[];
    const inside=tickets.filter(t=>t.entry_status==='Entrada utilizada'&&!t.temporary_exit).length;
    const entered=tickets.filter(t=>t.entry_status==='Entrada utilizada').length;
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
    set('portariaLiveEventName',`${snap.event_name||'Evento'} • OFFLINE`);
    set('portariaLiveUpdated',`Pacote salvo em ${snap.downloaded_at?new Date(snap.downloaded_at).toLocaleString('pt-BR'):'data não informada'}`);
    set('portariaPaidCount',tickets.length);set('portariaEnteredCount',entered);set('portariaRemainingCount',Math.max(0,tickets.length-entered));
    set('portariaFemaleCount','—');set('portariaMaleCount','—');
    const sector=document.getElementById('portariaSectorStats');if(sector)sector.innerHTML=`<span>DENTRO AGORA: ${inside}</span><span>MODO OFFLINE ATIVO</span>`;
    await window.hypeV17RestoreOfflineStorage();
  };

  function offlineFind(code){
    const snap=readJSON(OFFLINE_KEY,null); if(!snap)return null;
    const c=String(code||'').trim();
    const cNorm=c.replace(/^#/,'').toUpperCase();
    return (snap.tickets||[]).find(t=>String(t.ticket_code||'').toUpperCase()===cNorm||String(t.qr_token||'')===c||('#'+String(t.ticket_code||'').toUpperCase())===c.toUpperCase())||null;
  }
  function offlineSaveTicket(ticket){
    const snap=readJSON(OFFLINE_KEY,null); if(!snap)return;
    const i=(snap.tickets||[]).findIndex(t=>Number(t.id)===Number(ticket.id));
    if(i>=0){snap.tickets[i]=ticket;writeJSON(OFFLINE_KEY,snap)}
  }
  function enqueue(item){const q=readJSON(QUEUE_KEY,[]);q.push(item);writeJSON(QUEUE_KEY,q);hypeV17UpdateOfflineBadge();}

  window.hypeV17SyncQueue=async function(show=true){
    if(!online()) return show&&alert('Sem internet. A fila continua salva neste aparelho.');
    let q=await durableRead(QUEUE_KEY,[]); if(!q.length){if(show)hypeNotify('Nada pendente para sincronizar.');return;}
    const rest=[];
    for(const item of q){
      try{
        if(item.type==='entry') await v17rpc('staff_validate_entry_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_code:item.code,p_device:item.device,p_offline_sync:true});
        else if(item.type==='document') await v17rpc('staff_mark_document_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:item.ticket_id,p_checked:item.checked});
        else if(item.type==='exit') await v17rpc('staff_temporary_exit_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:item.ticket_id});
        else if(item.type==='reentry_authorize') await v17rpc('staff_authorize_reentry_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:item.ticket_id,p_authorized:true});
      }catch(e){rest.push({...item,error:String(e.message||e)});}
    }
    await durableWrite(QUEUE_KEY,rest); hypeV17UpdateOfflineBadge();
    if(show) hypeNotify(rest.length?`${rest.length} ação(ões) ficaram pendentes.`:'Fila offline sincronizada.');
    try{await portariaRefreshDashboard(false)}catch(_){}
  };

  async function v17rpc(name,params){ return sbRpc(name,params); }
  window.hypeV17MarkDocument=async function(id,checked,code){
    if(!checked && !confirm('Desmarcar documento conferido?'))return;
    const shouldAutoEnter = checked && String(HYPE.v17PendingAutoEntryCode||'')===String(code||'');
    if(!online()){
      const t=offlineFind(code); if(!t)return alert('Ingresso não está no pacote offline.');
      t.document_checked=checked; offlineSaveTicket(t); enqueue({type:'document',ticket_id:id,checked,at:new Date().toISOString()}); renderPortariaResults([t]);
      if(shouldAutoEnter){HYPE.v17PendingAutoEntryCode=''; await validateEntry(t.ticket_code||code,{fromScan:true});}
      return;
    }
    try{
      await v17rpc('staff_mark_document_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:id,p_checked:checked});
      const t=await lookupTicketByQr(code,false,{skipAuto:true});
      if(t)renderPortariaResults([t]);
      if(shouldAutoEnter){HYPE.v17PendingAutoEntryCode=''; await validateEntry(t?.ticket_code||code,{fromScan:true});}
    }
    catch(e){alert(e.message||e)}
  };

  window.hypeV17TemporaryExit=async function(id,code){
    if(!confirm('Marcar esta pessoa como SAÍDA? A reentrada ficará bloqueada até ser autorizada.'))return;
    if(!online()){
      const t=offlineFind(code); if(!t)return alert('Ingresso não está no pacote offline.');
      if(t.entry_status!=='Entrada utilizada'||t.temporary_exit)return alert('Esta pessoa não está marcada como dentro.');
      t.temporary_exit=true; t.reentry_authorized=false; offlineSaveTicket(t);
      enqueue({type:'exit',ticket_id:id,code:t.ticket_code,at:new Date().toISOString()});
      renderPortariaResults([t]); hypeNotify('🚪 Saída registrada offline.');
      return;
    }
    try{
      await v17rpc('staff_temporary_exit_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:id});
      const t=await lookupTicketByQr(code,false,{skipAuto:true}); if(t)renderPortariaResults([t]);
      hypeNotify('🚪 SAÍDA REGISTRADA');
      try{await portariaRefreshDashboard(false)}catch(_){}
    }catch(e){alert(e.message||e)}
  };
  window.hypeV17AuthorizeReentry=async function(id,code){
    if(!online()){
      const t=offlineFind(code); if(!t)return alert('Ingresso não está no pacote offline.');
      if(!t.temporary_exit)return alert('Esta pessoa não está marcada como saída.');
      t.reentry_authorized=true; offlineSaveTicket(t);
      enqueue({type:'reentry_authorize',ticket_id:id,code:t.ticket_code,at:new Date().toISOString()});
      renderPortariaResults([t]); hypeNotify('🔓 Reentrada autorizada offline.');
      return;
    }
    try{
      await v17rpc('staff_authorize_reentry_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:id,p_authorized:true});
      const t=await lookupTicketByQr(code,false,{skipAuto:true}); if(t)renderPortariaResults([t]);hypeNotify('Reentrada autorizada.');
    }catch(e){alert(e.message||e)}
  };

  // Sobrescreve a renderização da portaria com CPF/documento/reentrada.
  window.renderPortariaResults=function(list){
    const c=document.getElementById('resultsContainer'); if(!c)return;
    if(!list?.length){c.innerHTML='<div class="empty-state" style="color:var(--red)">❌ Nenhum ingresso encontrado.</div>';return;}
    c.innerHTML=list.map(item=>{
      const paid=item.payment_status==='Pago', used=item.entry_status==='Entrada utilizada', canceled=item.payment_status==='Cancelado';
      const selected=Number(HYPE.portariaEventId||0),wrong=selected&&Number(item.event_id)!==selected;
      const inside=used&&!item.temporary_exit;
      const cls=wrong||canceled?'cancelado':inside?'used':paid?'pago':'pendente';
      const doc=!!item.document_checked;
      const text=wrong?'OUTRO EVENTO ⚠️':canceled?'CANCELADO ❌':item.temporary_exit?(item.reentry_authorized?'FORA 🚪 • REENTRADA AUTORIZADA ✅':'SAIU 🚪 • REENTRADA BLOQUEADA ⛔'):inside?'DENTRO ✅':paid?(doc?'PAGO • PRONTO PARA ENTRAR':'PAGO • CONFIRA DOCUMENTO'):'BLOQUEADO ❌';
      const canEntry=paid&&!canceled&&!wrong&&doc&&(!used||(item.temporary_exit&&item.reentry_authorized));
      const cpf=norm(item.cpf); const cpfFmt=cpf.length===11?cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'):(item.cpf||'NÃO INFORMADO');
      const pendingScan = String(HYPE.v17PendingAutoEntryCode||'')===String(item.ticket_code||'');
      return `<div class="result-card ${cls}"><div class="client-info"><div class="portaria-sector-big">${hypeEscape(String(item.sector||item.lot_name||'INGRESSO').toUpperCase())}</div><h3>${hypeEscape(item.customer_name||'')}</h3><div class="portaria-extra">CPF: <b>${hypeEscape(cpfFmt)}</b> • ${hypeEscape(item.ticket_code||'')}</div><div class="v17-doc-row"><label><input type="checkbox" ${doc?'checked':''} onchange="hypeV17MarkDocument(${Number(item.id)},this.checked,'${hypeEscape(item.ticket_code||'')}')"> Documento conferido</label><span>${doc?'✅ CONFERIDO':pendingScan?'⚠️ CONFIRA PARA REGISTRAR ENTRADA':'⚠️ OBRIGATÓRIO'}</span></div>${item.temporary_exit?`<div class="portaria-warning">Saída registrada. Reentrada: <b>${item.reentry_authorized?'AUTORIZADA':'NÃO AUTORIZADA'}</b>.</div>`:''}</div><div class="status-area"><div class="status-tag ${cls}">${text}</div>${canEntry&&!inside?`<button class="btn-entry" onclick="validateEntry('${hypeEscape(item.ticket_code)}',{fromScan:false})">✅ REGISTRAR ENTRADA</button>`:''}${inside?`<button class="btn-entry v17-exit" onclick="hypeV17TemporaryExit(${Number(item.id)},'${hypeEscape(item.ticket_code)}')">🚪 MARCAR SAÍDA</button>`:''}${item.temporary_exit&&!item.reentry_authorized?`<button class="btn-entry v17-reentry" onclick="hypeV17AuthorizeReentry(${Number(item.id)},'${hypeEscape(item.ticket_code)}')">🔓 AUTORIZAR REENTRADA</button>`:''}</div></div>`;
    }).join('');
  };

  window.lookupTicketByQr=async function(code,changeInput=true,opts={}){
    const fromCamera=!!HYPE.portariaLastScanFromCamera && !opts.skipAuto;
    const processItem=async item=>{
      if(!item)return null;
      if(changeInput){const i=document.getElementById('portariaSearch');if(i)i.value=item.customer_name||item.ticket_code;}
      HYPE.portariaCurrentItem=item;
      renderPortariaResults([item]);

      if(fromCamera){
        const selected=Number(HYPE.portariaEventId||0);
        const wrong=selected&&Number(item.event_id)!==selected;
        if(wrong){HYPE.portariaLastScanFromCamera=false;portariaDeniedFeedback('INGRESSO DE OUTRO EVENTO');return item;}
        if(item.payment_status==='Cancelado'||item.payment_status!=='Pago'){HYPE.portariaLastScanFromCamera=false;portariaDeniedFeedback(item.payment_status==='Cancelado'?'INGRESSO CANCELADO':'PAGAMENTO NÃO CONFIRMADO');return item;}
        if(item.entry_status==='Entrada utilizada'&&!item.temporary_exit){HYPE.portariaLastScanFromCamera=false;portariaDuplicateAlert(item);return item;}
        if(item.temporary_exit&&!item.reentry_authorized){HYPE.portariaLastScanFromCamera=false;portariaDeniedFeedback('REENTRADA NÃO AUTORIZADA');return item;}
        if(!item.document_checked){
          HYPE.v17PendingAutoEntryCode=item.ticket_code||String(code||'').trim();
          HYPE.portariaLastScanFromCamera=false;
          portariaDeniedFeedback('CONFIRA O DOCUMENTO/CPF');
          hypeNotify('QR válido. Marque “Documento conferido” e a entrada será registrada automaticamente.');
          renderPortariaResults([item]);
          return item;
        }
        await validateEntry(item.ticket_code||code,{fromScan:true});
        return item;
      }
      return item;
    };

    if(!online()){
      const item=offlineFind(code); const c=document.getElementById('resultsContainer');
      if(!item){if(c)c.innerHTML='<div class="empty-state" style="color:var(--red)">❌ NÃO ENCONTRADO NO PACOTE OFFLINE.</div>';HYPE.portariaLastScanFromCamera=false;return null;}
      return await processItem(item);
    }
    try{
      let rows;
      try{
        rows=await v17rpc('staff_lookup_ticket_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_code:String(code||'').trim()});
      }catch(_){
        rows=await v17rpc('staff_lookup_ticket',{p_username:HYPE.user,p_password:HYPE.pass,p_code:String(code||'').trim()});
      }
      const item=Array.isArray(rows)?rows[0]:rows;
      if(!item){HYPE.portariaLastScanFromCamera=false;return null;}
      return await processItem(item);
    }catch(e){
      // Internet oscilando: se há pacote salvo, cai automaticamente para ele.
      const item=offlineFind(code);
      if(item){HYPE.portariaLastScanFromCamera=fromCamera;hypeNotify('⚠️ Internet instável. Usando pacote offline.');return await processItem(item);}
      HYPE.portariaLastScanFromCamera=false;alert(e.message||e);return null;
    }
  };

  window.validateEntry=async function(code,opts={}){
    const device=`${navigator.userAgent.slice(0,40)} | ${location.hostname}`;
    const finishQuick=()=>{
      HYPE.v17PendingAutoEntryCode='';
      const quick=document.getElementById('portariaQuickMode')?.checked!==false;
      const wasCamera=!!opts.fromScan||!!HYPE.portariaLastScanFromCamera;
      HYPE.portariaLastScanFromCamera=false;
      if(!quick)return;
      setTimeout(async()=>{
        const input=document.getElementById('portariaSearch'); if(input){input.value='';input.focus();}
        const container=document.getElementById('resultsContainer'); if(container)container.innerHTML='<div class="empty-state">✅ Entrada registrada. Pronto para o próximo ingresso.</div>';
        if(wasCamera){try{await startQrScanner();}catch(_){}}
      },900);
    };

    if(!online()){
      const t=offlineFind(code); if(!t){HYPE.portariaLastScanFromCamera=false;return portariaDeniedFeedback('NÃO ENCONTRADO OFFLINE');}
      if(t.payment_status!=='Pago'){HYPE.portariaLastScanFromCamera=false;return portariaDeniedFeedback('PAGAMENTO NÃO CONFIRMADO');}
      if(!t.document_checked){HYPE.v17PendingAutoEntryCode=t.ticket_code||code;HYPE.portariaLastScanFromCamera=false;renderPortariaResults([t]);return portariaDeniedFeedback('CONFIRA O DOCUMENTO/CPF');}
      if(t.entry_status==='Entrada utilizada'&&!t.temporary_exit){HYPE.portariaLastScanFromCamera=false;return portariaDuplicateAlert(t);}
      if(t.temporary_exit&&!t.reentry_authorized){HYPE.portariaLastScanFromCamera=false;return portariaDeniedFeedback('REENTRADA NÃO AUTORIZADA');}
      if(t.temporary_exit){t.temporary_exit=false;t.reentry_authorized=false;t.reentry_count=Number(t.reentry_count||0)+1;}else{t.entry_status='Entrada utilizada';t.entry_at=new Date().toISOString();}
      offlineSaveTicket(t); enqueue({type:'entry',code:t.ticket_code,device,at:new Date().toISOString()}); portariaSuccessFeedback(t); renderPortariaResults([t]); finishQuick(); return;
    }
    try{
      const rows=await v17rpc('staff_validate_entry_v17',{p_username:HYPE.user,p_password:HYPE.pass,p_code:code,p_device:device,p_offline_sync:false});
      const r=Array.isArray(rows)?rows[0]:rows;
      if(!r?.ok){
        HYPE.portariaLastScanFromCamera=false;
        if(String(r?.message||'').toUpperCase().includes('JÁ UTILIZADO'))return portariaDuplicateAlert(r);
        return portariaDeniedFeedback(r?.message||'Entrada negada.');
      }
      portariaSuccessFeedback(r); renderPortariaResults([r]); try{await portariaRefreshDashboard(false)}catch(_){}
      finishQuick();
    }catch(e){
      // Se a rede caiu exatamente durante a leitura, registra localmente para não
      // travar a fila da Portaria e sincroniza quando a internet voltar.
      const t=offlineFind(code);
      if(t){
        if(t.payment_status!=='Pago'){HYPE.portariaLastScanFromCamera=false;return portariaDeniedFeedback('PAGAMENTO NÃO CONFIRMADO');}
        if(!t.document_checked){HYPE.v17PendingAutoEntryCode=t.ticket_code||code;HYPE.portariaLastScanFromCamera=false;renderPortariaResults([t]);return portariaDeniedFeedback('CONFIRA O DOCUMENTO/CPF');}
        if(t.entry_status==='Entrada utilizada'&&!t.temporary_exit){HYPE.portariaLastScanFromCamera=false;return portariaDuplicateAlert(t);}
        if(t.temporary_exit&&!t.reentry_authorized){HYPE.portariaLastScanFromCamera=false;return portariaDeniedFeedback('REENTRADA NÃO AUTORIZADA');}
        if(t.temporary_exit){t.temporary_exit=false;t.reentry_authorized=false;t.reentry_count=Number(t.reentry_count||0)+1;}else{t.entry_status='Entrada utilizada';t.entry_at=new Date().toISOString();}
        offlineSaveTicket(t);enqueue({type:'entry',code:t.ticket_code,device,at:new Date().toISOString()});hypeNotify('⚠️ Rede caiu. Entrada salva na fila offline.');portariaSuccessFeedback(t);renderPortariaResults([t]);finishQuick();return;
      }
      HYPE.portariaLastScanFromCamera=false;portariaDeniedFeedback(e.message||'Erro ao validar entrada.');
    }
  };

  // Busca manual também funciona por nome/CPF/código no pacote offline.
  const oldSearchClientV173=window.searchClient;
  window.searchClient=async function(){
    const q=String(document.getElementById('portariaSearch')?.value||'').trim();
    const useOffline=()=>{
      const snap=readJSON(OFFLINE_KEY,null);const container=document.getElementById('resultsContainer');
      if(!snap?.tickets){if(container)container.innerHTML='<div class="empty-state" style="color:var(--red)">❌ Nenhum pacote offline salvo.</div>';return []}
      if(!q){if(container)container.innerHTML='<div class="empty-state">Digite nome, CPF ou código.</div>';return []}
      const needle=q.toLowerCase().replace(/^#/,'');const digits=norm(q);
      const rows=(snap.tickets||[]).filter(t=>String(t.customer_name||'').toLowerCase().includes(needle)||String(t.ticket_code||'').toLowerCase().includes(needle)||String(t.qr_token||'').toLowerCase()===needle||(digits&&norm(t.cpf).includes(digits)));
      renderPortariaResults(rows);return rows;
    };
    if(!online())return useOffline();
    try{return await oldSearchClientV173.apply(this,arguments)}catch(_){hypeNotify('⚠️ Busca pelo pacote offline.');return useOffline()}
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
      const host=document.querySelector('.search-box')||document.querySelector('.container'); const d=document.createElement('div');d.id='v17OfflinePanel';d.className='v17-offline-panel';d.innerHTML='<div id="v17OfflineStatus" class="v17-offline-badge">ONLINE</div><button class="portaria-btn" onclick="hypeV17DownloadOffline()">⬇ PREPARAR MODO OFFLINE</button><button class="portaria-btn secondary" onclick="hypeV17TestOffline()">🧪 TESTAR OFFLINE SALVO</button><button class="portaria-btn secondary" onclick="hypeV17SyncQueue(true)">⟳ SINCRONIZAR FILA</button>';host?.appendChild(d);hypeV17RestoreOfflineStorage().catch(()=>{});
    }
    if(document.getElementById('v16DashboardPanel')&&!document.getElementById('v17AdminWrap')){
      const sec=document.createElement('section');sec.id='v17AdminWrap';sec.className='panel-box';sec.innerHTML='<h3>🧾 EVENTO ENCERRADO / AUDITORIA</h3><p style="color:var(--muted);font-size:12px;margin-bottom:12px">Resumo final da noite, limite por CPF e log de ações.</p><div id="v17AdminPanel">Clique em atualizar.</div><button class="btn-action" style="margin-top:12px" onclick="hypeV17LoadAdminPanel()">↻ ATUALIZAR RESUMO E LOG</button>';document.getElementById('v16DashboardPanel').after(sec);
    }
  }
  window.addEventListener('online',()=>{hypeV17UpdateOfflineBadge();hypeV17SyncQueue(false).catch(()=>{})});
  window.addEventListener('offline',()=>{hypeV17UpdateOfflineBadge();if(typeof window.hypeV17InitOfflinePortaria==='function'&&HYPE.user)window.hypeV17InitOfflinePortaria().catch(()=>{})});
  // Inicia a recuperação do IndexedDB antes mesmo do DOM ficar pronto.
  hypeV17RestoreOfflineStorage().catch(()=>{});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,350));
})();
