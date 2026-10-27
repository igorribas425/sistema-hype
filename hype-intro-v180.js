/* HYPE v180: cinematic invitation; purely presentational, preserves URL and checkout. */
(function () {
  'use strict';
  if (window.__hypeIntroV180) return;
  window.__hypeIntroV180 = true;
  function start() {
    if (!document.body || !document.getElementById('ticketBox') || document.getElementById('hypeIntroV180')) return;
    var params = new URLSearchParams(window.location.search);
    var returnKeys = ['pedido','order','payment','paymentId','status','retorno','success','checkout','transaction','txid','external_reference'];
    if (returnKeys.some(function (key) { return params.has(key); })) return;
    var sessionKey = 'hype-invitation-v180:' + window.location.pathname + ':' + (params.get('promoter') || '');
    try { if (window.sessionStorage.getItem(sessionKey) === 'seen') return; } catch (e) {}
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var crown = '<svg viewBox="0 0 72 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7 43L2 13L21 30L35 3L52 30L70 13L64 43Z" fill="#a77839" stroke="#ffe0a5" stroke-width="2"/><path d="M10 43H62V51H10Z" fill="#d1a365" stroke="#ffdda2" stroke-width="2"/><circle cx="35" cy="33" r="5" fill="#fbdf9c"/><circle cx="7" cy="11" r="4" fill="#f3d69c"/><circle cx="35" cy="3" r="3" fill="#f3d69c"/><circle cx="69" cy="11" r="4" fill="#f3d69c"/></svg>';
    var el = document.createElement('div');
    el.id = 'hypeIntroV180';
    el.setAttribute('role','dialog');
    el.setAttribute('aria-modal','true');
    el.setAttribute('aria-label','Convite especial HYPE Lounge Club');
    el.innerHTML =
      '<div class="hi180-world" aria-hidden="true"></div><div class="hi180-grain" aria-hidden="true"></div><div class="hi180-vignette" aria-hidden="true"></div><div class="hi180-frame" aria-hidden="true"></div>' +
      '<div class="hi180-scene">' +
      '  <div class="hi180-brand"><span class="hi180-crown" aria-hidden="true">' + crown + '</span><div class="hi180-logo">HYPE</div><div class="hi180-lounge">LOUNGE CLUB</div></div>' +
      '  <p class="hi180-tagline">MAIS QUE NOITES. EXPERIÊNCIAS.</p>' +
      '  <div class="hi180-stage"><div class="hi180-envelope" id="hi180Envelope">' +
      '    <div class="hi180-back"></div><div class="hi180-inside"></div>' +
      '    <div class="hi180-card" id="hi180Invite">' +
      '      <div class="hi180-card-logo">HYPE<small>LOUNGE CLUB</small></div>' +
      '      <p class="hi180-invite-text">Você está convidado<br>para uma noite<br>inesquecível na Hype.</p>' +
      '      <div class="hi180-rule" aria-hidden="true">✦</div>' +
      '      <button class="hi180-enter" type="button" id="hi180Buy">COMPRAR INGRESSO &nbsp;➜</button>' +
      '    </div>' +
      '    <div class="hi180-front"></div><div class="hi180-flap"></div><div class="hi180-flourish" aria-hidden="true"></div>' +
      '    <span class="hi180-seal" aria-hidden="true">' + crown + '</span>' +
      '    <button class="hi180-open-hit" id="hi180Open" type="button" aria-label="Abrir convite da Hype"></button>' +
      '  </div></div>' +
      '  <div class="hi180-hint" id="hi180Hint" aria-live="polite">CLIQUE NA CARTA PARA DESCOBRIR</div>' +
      '</div>' +
      '<div class="hi180-fog" aria-hidden="true" id="hi180Fog"></div>' +
      '<button type="button" class="hi180-skip" id="hi180Skip">Pular introdução ✕</button>';
    var fog = el.querySelector('#hi180Fog');
    var plumes = [
      [25,40,'-90px','-90px','-16deg','0ms'],[47,55,'110px','-80px','35deg','75ms'],
      [74,48,'180px','70px','-60deg','110ms'],[37,70,'-130px','130px','48deg','150ms'],
      [65,29,'-60px','-120px','14deg','40ms'],[51,48,'-30px','150px','-30deg','230ms'],
      [14,64,'-80px','95px','-45deg','170ms'],[83,67,'100px','-30px','25deg','260ms']
    ];
    plumes.forEach(function (p) {
      var span = document.createElement('span');
      span.className = 'hi180-plume';
      span.style.cssText = '--left:'+p[0]+'%;--top:'+p[1]+'%;--dx:'+p[2]+';--dy:'+p[3]+';--angle:'+p[4]+';--delay:'+p[5]+';';
      fog.appendChild(span);
    });
    for (var i=0; i<24; i++) {
      var spark = document.createElement('i');
      spark.className = 'hi180-spark';
      spark.style.cssText = '--left:'+(20+(i*37)%60)+'%;--top:'+(21+(i*29)%64)+'%;--dx:'+(-200+(i*77)%400)+'px;--dy:'+(-210+(i*47)%350)+'px;--delay:'+((i*49)%470)+'ms;';
      fog.appendChild(spark);
    }
    document.body.appendChild(el);
    document.documentElement.classList.add('hi180-locked');
    document.body.classList.add('hi180-locked');
    var open = el.querySelector('#hi180Open');
    var buy = el.querySelector('#hi180Buy');
    var skip = el.querySelector('#hi180Skip');
    var opened = false, leaving = false;
    var priorFocus = document.activeElement;
    var keyHandler;
    function markSeen() { try { window.sessionStorage.setItem(sessionKey,'seen'); } catch(e){} }
    function clear(scrollToCheckout) {
      markSeen();
      document.documentElement.classList.remove('hi180-locked');
      document.body.classList.remove('hi180-locked');
      el.classList.add('hi180-gone');
      window.removeEventListener('keydown', keyHandler);
      var delay = reduceMotion ? 20 : 870;
      window.setTimeout(function () {
        el.remove();
        if(scrollToCheckout){
          var target = document.getElementById('ticketBox');
          if(target) target.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'});
        } else if (priorFocus && typeof priorFocus.focus === 'function') {
          try {priorFocus.focus({preventScroll:true});} catch(e){}
        }
      },delay);
    }
    function reveal(scrollToCheckout) {
      if(leaving) return;
      leaving = true;
      skip.disabled=true;buy.disabled=true;
      el.classList.add('hi180-leaving');
      var delay = reduceMotion ? 90 : 1250;
      window.setTimeout(function(){clear(scrollToCheckout);},delay);
    }
    open.addEventListener('click', function() {
      if(opened || leaving) return;
      opened=true;
      el.classList.add('hi180-open');
      el.querySelector('#hi180Hint').textContent='';
      window.setTimeout(function() { if(!leaving) buy.focus({preventScroll:true}); }, reduceMotion?20:1150);
    });
    buy.addEventListener('click', function(event) { event.stopPropagation(); reveal(true); });
    skip.addEventListener('click', function() { reveal(false); });
    keyHandler = function(event) {
      if(event.key==='Escape'){event.preventDefault();reveal(false);}
      if(event.key==='Tab' && !leaving){
        var controls=opened?[buy,skip]:[open,skip];
        var at=controls.indexOf(document.activeElement);
        if(event.shiftKey && (at===0||at===-1)){event.preventDefault();controls[controls.length-1].focus();}
        else if(!event.shiftKey && at===controls.length-1){event.preventDefault();controls[0].focus();}
      }
    };
    window.addEventListener('keydown',keyHandler);
    open.focus({preventScroll:true});
    document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden') markSeen(); },{once:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();