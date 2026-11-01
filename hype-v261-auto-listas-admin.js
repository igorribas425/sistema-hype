/* HYPE V261 — aprovação assistida automática, APENAS no ADM logado.
   Beijo Proibido, evento 26, até 23h15 de 01/11/2026 (America/Sao_Paulo).
   Preserva as validações de aprovação do banco, QR, histórico e limites.
   É executada no navegador do administrador enquanto a página permanece aberta. */
(()=>{
  'use strict';
  const EVENT_ID=26;
  const START=Date.parse('2026-11-01T18:00:00-03:00');
  const END=Date.parse('2026-11-01T23:15:00-03:00');
  const RECHECK_MS=75*1000;
  const RETRY_MS=5*60*1000;
  let working=false, lastText='', sb=null;
  const attempted=new Map();
  function active(){const n=Date.now();return n>=START&&n<END;}
  function ready(){
    return active()&&typeof HYPE!=='undefined'&&HYPE?.role==='admin'&&
      !!HYPE.user&&!!HYPE.pass&&document.visibilityState==='visible';
  }
  function status(text){
    lastText=text;
    let el=document.getElementById('hypeAutoListaStatusV261');
    if(!el){
      const target=document.getElementById('v50GuestReviewList')?.parentElement
         ||document.getElementById('v206Stats')?.parentElement;
      if(!target)return;
      el=document.createElement('div');
      el.id='hypeAutoListaStatusV261';
      el.style.cssText='border:1px solid #6e5065;background:#261726;color:#f8d9e8;border-radius:10px;padding:12px;margin:9px 0;font:600 12px/1.6 Arial,sans-serif;';
      target.insertBefore(el,target.firstChild);
    }
    el.textContent='HYPE • Confirmação automática (apenas Beijo Proibido, até 23h15): '+text;
  }
  function client(){
    if(sb)return sb;
    const cfg=window.HYPE_SUPABASE_CONFIG||{};
    if(!cfg.url||!cfg.anonKey||!window.supabase?.createClient)throw Error('Supabase indisponível');
    sb=window.supabase.createClient(cfg.url,cfg.anonKey);
    return sb;
  }
  async function rpc(name, params){
    const {data,error}=await client().rpc(name,params);
    if(error)throw Error(error.message||name);
    return Array.isArray(data)?data:(data?[data]:[]);
  }
  function auth(){return {p_username:HYPE.user,p_password:HYPE.pass};}
  function id(row){return Number(row?.list_id||row?.id||0);}
  function valid(row){
    if(String(row.status)!=='Pendente'||id(row)<=0)return false;
    if(String(row.name||'').trim().length<5)return false;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email||'')))return false;
    if(String(row.cpf||'').replace(/\D/g,'').length!==11)return false;
    // Quem não enviou selfie fica para análise manual.
    if(!String(row.photo_path||'').trim())return false;
    if(row.photo_consent===false)return false;
    if(row.promoter_archived_at)return false;
    return true;
  }
  async function sendQr(listId){
    const cfg=window.HYPE_SUPABASE_CONFIG||{};
    const response=await fetch(cfg.url+'/functions/v1/send-ticket-email',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        action:'guest_list_approved',
        username:HYPE.user,password:HYPE.pass,list_id:listId,force:false
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true)throw Error(data.error||'Falha no Brevo');
    return data;
  }
  async function run(){
    if(working||!ready())return;
    working=true;
    let approved=0,emailed=0,failed=0;
    try{
      status('procurando cadastros pendentes, sem alterar outras festas...');
      const [publicRows,promoterRows]=await Promise.all([
        rpc('staff_guest_registration_list_v50',{...auth(),p_event_id:EVENT_ID,p_status:'Pendente'}),
        rpc('staff_promoter_guests_v209',{...auth(),p_event_id:EVENT_ID,p_archived_only:false})
      ]);
      const candidates=[
        ...publicRows.filter(g=>String(g.source||'')!=='Promoter').map(g=>({row:g,promoter:false})),
        ...promoterRows.map(g=>({row:g,promoter:true}))
      ].filter(x=>valid(x.row));
      const seen=new Set();
      for(const candidate of candidates){
        if(!ready())break;
        const uid=id(candidate.row);
        if(seen.has(uid))continue;
        seen.add(uid);
        const last=attempted.get(uid)||0;
        if(Date.now()-last<RETRY_MS)continue;
        attempted.set(uid,Date.now());
        try{
          const result=await rpc(candidate.promoter?'staff_promoter_guest_review_v206':'staff_guest_registration_review_v50',{
            ...auth(),p_list_id:uid,p_decision:'aprovar'
          });
          if(String(result[0]?.status)!=='Liberado')continue;
          approved++;
          try{await sendQr(uid);emailed++;}
          catch(e){failed++;console.warn('[HYPE auto-lista V261] QR não confirmado:',e.message);}
        }catch(e){
          failed++;
          // Regras do banco (CPF duplicado, bloqueado, limite etc.) continuam soberanas.
          console.warn('[HYPE auto-lista V261] Revisão mantida pendente:',String(e.message||e));
        }
      }
      status('concluído: '+approved+' aprovações, '+emailed+' e-mails aceitos, '+failed+
        ' verificações/envios com pendência. Atualiza a cada 75 segundos ENQUANTO o ADM estiver aberto.');
      if(approved){
        window.HypeV49Registration?.loadListSettings?.().catch?.(()=>{});
        window.HypePromoterInvitesV206?.refreshGuests?.().catch?.(()=>{});
      }
    }catch(e){
      status('não foi possível consultar: '+String(e.message||e).slice(0,160));
    }finally{working=false;}
  }
  function tick(){
    if(Date.now()>=END){
      status('encerrada automaticamente às 23h15 de 01/11. A partir de agora, análise manual.');
      return;
    }
    if(ready())run().catch(err=>console.warn('[HYPE auto-lista V261]',err));
  }
  document.addEventListener('DOMContentLoaded',()=>{
    tick();
    setInterval(tick,RECHECK_MS);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tick();});
  });
  window.HypeAutoListaV261={run,active,getStatus:()=>lastText};
})();