/* HYPE Halloween v199: arte oficial como referência; SVGs com volume e animação real. */
(function(){
  'use strict';
  var ns=0;
  function ornament(cls, svg){
    var el=document.createElement('span');
    el.className='hh198-ornament '+cls;
    el.setAttribute('aria-hidden','true');
    el.innerHTML=svg;
    return el;
  }
  function pumpkin(size){
    var id='hh198pump'+(++ns);
    var opening='<svg viewBox="0 0 120 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'+
      '<defs>'+
        '<radialGradient id="'+id+'skin" cx="35%" cy="24%" r="85%"><stop offset="0%" stop-color="#ffd188"/><stop offset="26%" stop-color="#e78639"/><stop offset="61%" stop-color="#a94321"/><stop offset="89%" stop-color="#662019"/><stop offset="100%" stop-color="#301013"/></radialGradient>'+
        '<linearGradient id="'+id+'grooves" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#331014"/><stop offset=".25" stop-color="#e69049"/><stop offset=".63" stop-color="#b6572b"/><stop offset="1" stop-color="#3c1818"/></linearGradient>'+
        '<radialGradient id="'+id+'glow" cx="50%" cy="45%" r="63%"><stop stop-color="#fff6ae"/><stop offset=".37" stop-color="#ffca57"/><stop offset=".82" stop-color="#f16d25"/><stop offset="1" stop-color="#672215"/></radialGradient>'+
      '</defs>';
    return ornament('hh198-pumpkin hh198-pumpkin--'+size,
      opening+
      '<ellipse cx="61" cy="113" rx="49" ry="10" fill="#0c0509" opacity=".47"/>'+
      '<path d="M56 35 C52 24 57 15 64 7 C69 4 75 5 79 10 C72 18 70 26 72 38Z" fill="#435031" stroke="#1b2119" stroke-width="3"/>'+
      '<path d="M61 21 Q46 12 38 25 M69 20 Q85 9 95 24" fill="none" stroke="#647040" stroke-width="4" stroke-linecap="round"/>'+
      '<path d="M61 34 C41 23 19 29 12 47 C4 67 12 95 32 107 C47 116 75 114 91 107 C114 95 121 62 105 41 C94 27 77 27 61 34Z" fill="url(#'+id+'skin)" stroke="#52211a" stroke-width="3"/>'+
      '<path d="M48 35 C29 39 20 76 33 105 M77 35 C93 47 103 83 90 106" fill="none" stroke="#672618" stroke-opacity=".63" stroke-width="4"/>'+
      '<path d="M50 34 C37 45 37 89 46 110 M71 34 C81 47 82 93 75 110" fill="none" stroke="url(#'+id+'grooves)" stroke-opacity=".57" stroke-width="3"/>'+
      '<path d="M62 33 Q55 59 61 110" fill="none" stroke="#eda15d" stroke-opacity=".55" stroke-width="3"/>'+
      '<path d="M25 54 Q32 42 46 43" stroke="#ffe2a5" stroke-width="3" opacity=".48" fill="none" stroke-linecap="round"/>'+
      '<g class="hh198-light" fill="url(#'+id+'glow)" stroke="#3c1614" stroke-width="3" stroke-linejoin="round">'+
        '<path d="M26 59 Q39 51 50 60 L30 75Z"/><path d="M94 59 Q82 51 70 60 L91 75Z"/>'+
        '<path d="M57 76 L63 67 L69 76Z"/>'+
        '<path d="M31 87 Q60 107 91 87 L85 99 L77 98 L71 107 L64 100 L57 110 L48 99 L40 101Z"/>'+
      '</g>'+
      '<path d="M20 87 Q31 110 56 111" stroke="#231015" stroke-opacity=".36" stroke-width="2.7" fill="none"/>'+
      '</svg>'
    );
  }
  function bat(){
    return ornament('hh198-bat',
      '<svg viewBox="0 0 130 74" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'+
      '<g class="hh198-bat-left"><path d="M59 36 C43 17 31 8 16 14 Q22 24 12 30 L1 25 C4 42 17 52 29 53 Q34 39 45 50 L61 41Z" fill="#100d13" stroke="#743744" stroke-width="1.8"/><path d="M20 27 L42 40" stroke="#59313b" stroke-width="1" opacity=".55"/></g>'+
      '<g class="hh198-bat-right"><path d="M71 36 C87 17 99 8 114 14 Q108 24 118 30 L129 25 C126 42 113 52 101 53 Q96 39 85 50 L69 41Z" fill="#100d13" stroke="#743744" stroke-width="1.8"/><path d="M110 27 L88 40" stroke="#59313b" stroke-width="1" opacity=".55"/></g>'+
      '<path d="M60 30 L60 20 L64 25 L68 19 L72 26 L74 22 L73 42 Q70 55 65 57 Q59 54 58 42Z" fill="#100c12" stroke="#64313c" stroke-width="1.5"/>'+
      '<circle cx="62" cy="36" r="1.5" fill="#fc744d"/><circle cx="69" cy="36" r="1.5" fill="#fc744d"/></svg>');
  }
  function spider(){
    return ornament('hh198-spider',
      '<svg viewBox="0 0 64 68" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'+
      '<defs><radialGradient id="hh198-sp-body" cx="38%" cy="23%" r="73%"><stop stop-color="#745159"/><stop offset=".26" stop-color="#352329"/><stop offset="1" stop-color="#0a090d"/></radialGradient></defs>'+
      '<g class="hh198-spider-legs" fill="none" stroke="#332329" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round">'+
      '<path d="M27 29 L14 17 L7 12 L2 1 M26 34 L10 27 L4 35 L1 37 M26 38 L10 41 L5 52 L0 59 M27 41 L19 49 L18 59 L15 67"/>'+
      '</g><g class="hh198-spider-legs hh198-spider-legs-r" fill="none" stroke="#332329" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round">'+
      '<path d="M37 29 L50 17 L57 12 L62 1 M38 34 L54 27 L60 35 L63 37 M38 38 L54 41 L59 52 L64 59 M37 41 L45 49 L46 59 L49 67"/>'+
      '</g><ellipse cx="32" cy="44" rx="13" ry="16" fill="url(#hh198-sp-body)" stroke="#79505a" stroke-width="1.4"/>'+
      '<path d="M25 43 Q32 48 39 43 M27 53 Q32 55 38 52" stroke="#975358" stroke-opacity=".54" stroke-width="1.2" fill="none"/>'+
      '<ellipse cx="32" cy="26" rx="8.5" ry="9" fill="url(#hh198-sp-body)" stroke="#79505a" stroke-width="1"/>'+
      '<circle cx="29" cy="25" r="1.45" fill="#cd5148"/><circle cx="35" cy="25" r="1.45" fill="#cd5148"/>'+
      '</svg>'
    );
  }
  function mount(selector, ornaments){
    var host=document.querySelector(selector);
    if(!host||host.hasAttribute('data-hh198-ornaments'))return;
    host.setAttribute('data-hh198-ornaments','1');
    ornaments.forEach(function(el){host.appendChild(el)});
  }
  function setup(){
    if(!document.body)return;
    mount('.v14-art-wrap',[pumpkin(1),pumpkin(2),bat(),spider()]);
    mount('.events-wrap',[pumpkin(3),bat()]);
    mount('.purchase-copy',[pumpkin(4),bat()]);
    mount('.purchase-layout>.box',[pumpkin(5),spider()]);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();