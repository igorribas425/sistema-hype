/* HYPE Halloween v197 · SVGs desenhados no código, decorativos, sem interação com vendas. */
(function(){
  'use strict';
  function pumpkin(n){
    var id='hh197p'+n;
    var node=document.createElement('span');
    node.className='hh197-ornament hh197-pumpkin';
    node.setAttribute('aria-hidden','true');
    node.innerHTML='<svg viewBox="0 0 90 95" xmlns="http://www.w3.org/2000/svg" focusable="false">'+
      '<defs><radialGradient id="'+id+'g" cx="33%" cy="26%" r="81%"><stop stop-color="#ffb75b"/><stop offset=".42" stop-color="#d76524"/><stop offset=".8" stop-color="#94331a"/><stop offset="1" stop-color="#441417"/></radialGradient>'+
      '<radialGradient id="'+id+'f" cx="50%" cy="50%" r="72%"><stop stop-color="#ffec9a"/><stop offset=".52" stop-color="#ff9c38"/><stop offset="1" stop-color="#9c301d"/></radialGradient></defs>'+
      '<ellipse cx="45" cy="78" rx="38" ry="10" fill="#070509" opacity=".43"/>'+
      '<path d="M40 27 Q38 17 41 8 Q44 3 51 6 Q45 15 48 28Z" fill="#405327" stroke="#172819" stroke-width="2"/>'+
      '<path d="M43 19 Q30 10 20 20 M49 20 Q61 10 69 19" stroke="#59642b" fill="none" stroke-width="3" stroke-linecap="round"/>'+
      '<path d="M45 24 C12 11 -1 35 9 66 C17 91 34 91 45 89 C59 94 76 87 83 62 C94 25 62 13 45 24Z" fill="url(#'+id+'g)" stroke="#532018" stroke-width="2"/>'+
      '<path d="M30 26 C11 35 18 73 32 86 M59 26 C79 40 68 77 57 86 M45 26 Q39 56 45 88" stroke="#f9a04c" stroke-opacity=".45" stroke-width="2.3" fill="none"/>'+
      '<path d="M24 43 L38 48 L29 56Z M66 43 L52 48 L61 56Z M43 57 L49 57 L46 63Z" class="hh197-face" fill="url(#'+id+'f)" stroke="#481b14" stroke-width="1.4"/>'+
      '<path class="hh197-face" d="M25 67 Q45 79 68 65 L65 75 L58 75 L54 81 L49 77 L43 84 L36 77 L30 78Z" fill="url(#'+id+'f)" stroke="#401915" stroke-width="1.5"/>'+
      '</svg>';
    return node;
  }
  function ghost(){
    var node=document.createElement('span');
    node.className='hh197-ornament hh197-ghost';
    node.setAttribute('aria-hidden','true');
    node.innerHTML='<svg viewBox="0 0 70 100" xmlns="http://www.w3.org/2000/svg" focusable="false">'+
      '<defs><linearGradient id="hh197ghostgrad" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#f4e1e0" stop-opacity=".77"/><stop offset=".55" stop-color="#b5a6bc" stop-opacity=".48"/><stop offset="1" stop-color="#59435e" stop-opacity=".04"/></linearGradient></defs>'+
      '<path d="M12 81 C9 66 10 41 13 29 C19 2 53 2 60 29 C66 51 62 72 62 90 Q53 81 48 89 Q42 96 37 85 Q27 99 21 84 Q14 92 12 81Z" fill="url(#hh197ghostgrad)" stroke="#d4bfc6" stroke-opacity=".31" stroke-width="1"/>'+
      '<ellipse cx="27" cy="37" rx="5" ry="7" fill="#281724"/><ellipse cx="46" cy="37" rx="5" ry="7" fill="#281724"/>'+
      '<path d="M32 57 Q37 61 43 56" stroke="#443042" stroke-width="2.5" fill="none" stroke-linecap="round"/>'+
      '</svg>';
    return node;
  }
  function bat(){
    var node=document.createElement('span');
    node.className='hh197-ornament hh197-bat-fly';
    node.setAttribute('aria-hidden','true');
    node.innerHTML='<svg viewBox="0 0 130 70" xmlns="http://www.w3.org/2000/svg" focusable="false">'+
      '<g class="hh197-wing-l"><path d="M64 37 Q47 16 28 13 Q32 24 17 23 L1 15 Q3 39 21 45 Q32 34 42 50 L64 42Z" fill="#160d19" stroke="#8c303c" stroke-width="2"/></g>'+
      '<g class="hh197-wing-r"><path d="M66 37 Q83 16 102 13 Q98 24 113 23 L129 15 Q127 39 109 45 Q98 34 88 50 L66 42Z" fill="#160d19" stroke="#8c303c" stroke-width="2"/></g>'+
      '<path d="M59 35 L60 25 L64 30 L67 23 L70 31 L72 26 L72 42 Q67 53 65 54 Q58 51 58 42Z" fill="#0e0a10" stroke="#592630" stroke-width="1"/>'+
      '<circle cx="62" cy="39" r="1.3" fill="#ed6754"/><circle cx="69" cy="39" r="1.3" fill="#ed6754"/></svg>';
    return node;
  }
  function decorate(selector, nodes){
    var host=document.querySelector(selector);
    if(!host||host.hasAttribute('data-hh197'))return;
    host.setAttribute('data-hh197','');
    nodes.forEach(function(n){host.appendChild(n)});
  }
  function setup(){
    if(!document.body.classList.contains('hh196-halloween'))return;
    decorate('.events-wrap',[pumpkin(1),bat()]);
    decorate('.v14-spotlight',[pumpkin(2),ghost()]);
    decorate('.purchase-copy',[pumpkin(3),ghost()]);
    decorate('.purchase-layout>.box',[pumpkin(4),bat()]);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();