/* HYPE V18 // Cliente: aviso de sorteio automático para ingressos pagos */
(() => {
  'use strict';
  const esc=v=>typeof hypeEscape==='function'?hypeEscape(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const rows=d=>Array.isArray(d)?d:(d?[d]:[]);

  function ensureBox(){
    let box=document.getElementById('v18RaffleClient');
    if(box)return box;
    box=document.createElement('section');
    box.id='v18RaffleClient';
    box.style.display='none';
    box.innerHTML='<div class="v18-raffle-client-icon">🎁</div><div><small>SORTEIO HYPE</small><strong id="v18RaffleClientPrize"></strong><p id="v18RaffleClientText"></p></div>';
    const ticket=document.getElementById('ticketBox');
    if(ticket?.parentNode)ticket.parentNode.insertBefore(box,ticket);
    const style=document.createElement('style');
    style.textContent='#v18RaffleClient{width:min(1240px,100%);margin:0 auto 24px;padding:18px 20px;border-radius:22px;border:1px solid rgba(255,255,255,.2);background:linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.025));display:flex;gap:15px;align-items:center;box-shadow:0 18px 45px rgba(0,0,0,.28)}#v18RaffleClient .v18-raffle-client-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:14px;background:#fff;color:#080808;font-size:24px;flex:0 0 auto}#v18RaffleClient small{display:block;color:#bdbdc3;font-size:10px;font-weight:950;letter-spacing:1.6px}#v18RaffleClient strong{display:block;color:#fff;font-size:20px;margin:4px 0}#v18RaffleClient p{margin:0;color:#b7b7be;font-size:12px;line-height:1.55}@media(max-width:560px){#v18RaffleClient{align-items:flex-start}}';
    document.head.appendChild(style);
    return box;
  }

  async function refresh(){
    const box=ensureBox();
    const eventId=Number(window.HYPE?.selectedEventId||window.HYPE?.event?.id||0);
    if(!eventId){box.style.display='none';return;}
    try{
      const data=rows(await sbRpc('public_raffle_info_v18',{p_event_id:eventId}))[0];
      if(!data?.enabled){box.style.display='none';return;}
      document.getElementById('v18RaffleClientPrize').textContent=data.prize||'Prêmio especial HYPE';
      document.getElementById('v18RaffleClientText').textContent=`Seu ingresso entra automaticamente no sorteio assim que o Admin confirmar o pagamento. Não precisa fazer outro cadastro. Participantes confirmados: ${Number(data.participant_count||0)}.`;
      box.style.display='flex';
    }catch(_){box.style.display='none';}
  }

  document.addEventListener('DOMContentLoaded',()=>{
    ensureBox();
    setTimeout(refresh,900);
    const original=window.selectEvent;
    if(typeof original==='function'){
      window.selectEvent=async function(){const result=await original.apply(this,arguments);await refresh();return result;};
    }
    const originalRefresh=window.refreshClientCatalogSafely;
    if(typeof originalRefresh==='function'){
      window.refreshClientCatalogSafely=async function(){const result=await originalRefresh.apply(this,arguments);await refresh();return result;};
    }
  });
  window.hypeV18ClientRefresh=refresh;
})();
