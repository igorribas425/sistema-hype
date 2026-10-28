/* HYPE v199 — ativação visual só no evento Halloween da Hype 30/10/2026.
   Não interfere nas funções de checkout, seleção de lotes ou links de promoters. */
(function(){
  'use strict';
  var FRIDAY_ID=25;
  var FRIDAY_DATE='2026-10-30';
  var regularLogo='logo-hype.png?v=20260831-v16-2';
  var halloweenLogo='assets/hype-logo-halloween-v193.webp?v=20261027-logo-v193';
  var lastState=null;

  function isHalloweenSelected(){
    if(typeof HYPE==='undefined'||!HYPE)return false;
    var id=Number(HYPE.selectedEventId||0);
    if(id!==FRIDAY_ID)return false;
    var events=Array.isArray(HYPE.events)?HYPE.events:[];
    var event=events.find(function(e){return Number(e.id)===id});
    if(!event&&HYPE.event&&Number(HYPE.event.id)===id)event=HYPE.event;
    return Boolean(event&&String(event.event_date||'').slice(0,10)===FRIDAY_DATE);
  }

  function syncTheme(){
    if(!document.body)return;
    var enabled=isHalloweenSelected();
    if(enabled!==lastState){
      document.body.classList.toggle('hh196-halloween',enabled);
      document.body.setAttribute('data-hh-event-theme',enabled?'halloween-friday':'normal');
      lastState=enabled;
    }
    var img=document.querySelector('.brand-logo-wrap.page-brand img.brand-logo');
    if(img){
      var src=enabled?halloweenLogo:regularLogo;
      if(img.getAttribute('src')!==src)img.setAttribute('src',src);
      var alt=enabled?'HYPE Lounge Club - Halloween':'HYPE Lounge Club';
      if(img.alt!==alt)img.alt=alt;
    }
  }
  function begin(){
    syncTheme();
    var carousel=document.getElementById('eventCarousel');
    var title=document.getElementById('v14EventName');
    if(typeof MutationObserver!=='undefined'){
      var observer=new MutationObserver(syncTheme);
      if(carousel)observer.observe(carousel,{childList:true});
      if(title)observer.observe(title,{childList:true,characterData:true,subtree:true});
    }
    // Seleção do evento é atualizada pelo app no clique; reavaliar após o evento.
    document.addEventListener('click',function(ev){
      if(ev.target&&ev.target.closest&&ev.target.closest('.event-select-btn,.event-dot')){
        requestAnimationFrame(syncTheme);
      }
    },true);
    // Cobre atualizações programáticas e estado restaurado em links de promoters.
    window.setInterval(function(){
      if(!document.hidden)syncTheme();
    },1600);
    document.addEventListener('visibilitychange',function(){
      if(!document.hidden)syncTheme();
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',begin,{once:true});
  else begin();
})();