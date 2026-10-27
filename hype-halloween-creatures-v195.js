/* HYPE Halloween v195: aranhas e morcegos são SVGs animados via CSS (não imagens estáticas). */
(function(){
  'use strict';
  function createBat(n){
    var bat=document.createElement('span');
    bat.className='hh194-bat hh194-bat--'+n;
    bat.setAttribute('aria-hidden','true');
    bat.innerHTML='<svg viewBox="0 0 120 65" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">'+
      '<g class="hh194-wing hh194-wing-left"><path d="M56 32 Q43 21 39 11 Q28 7 18 14 Q23 20 12 21 L1 17 Q5 31 19 35 Q24 38 24 45 Q35 36 45 42 L57 37Z" fill="#171018" stroke="#853b41" stroke-width="1.4"/></g>'+
      '<g class="hh194-wing hh194-wing-right"><path d="M64 32 Q77 21 81 11 Q92 7 102 14 Q97 20 108 21 L119 17 Q115 31 101 35 Q96 38 96 45 Q85 36 75 42 L63 37Z" fill="#171018" stroke="#853b41" stroke-width="1.4"/></g>'+
      '<path d="M53 32 L54 24 L58 28 L61 22 L65 28 L68 23 L67 35 Q67 43 60 47 Q53 43 53 32Z" fill="#121015" stroke="#853b41" stroke-width="1"/>'+
      '<circle cx="57.7" cy="34" r="1.2" fill="#ed6251"/><circle cx="63" cy="34" r="1.2" fill="#ed6251"/></svg>';
    return bat;
  }
  function createSpider(side){
    var spider=document.createElement('span');
    spider.className='hh194-spider-line hh194-spider--'+side;
    spider.setAttribute('aria-hidden','true');
    // Desenho vetorial com anatomia em 8 pernas articuladas, brilho e sombra.
    // Segue animável em SVG/CSS: não é imagem PNG nem vídeo.
    spider.innerHTML='<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'+
      '<defs>'+
      '<radialGradient id="hh195-abdomen-'+side+'" cx="33%" cy="26%" r="72%"><stop offset="0" stop-color="#65414a"/><stop offset=".23" stop-color="#3d252c"/><stop offset=".61" stop-color="#1c1218"/><stop offset="1" stop-color="#08060a"/></radialGradient>'+
      '<radialGradient id="hh195-head-'+side+'" cx="38%" cy="24%" r="82%"><stop offset="0" stop-color="#62444b"/><stop offset=".42" stop-color="#261a20"/><stop offset="1" stop-color="#0c0a0e"/></radialGradient>'+
      '</defs>'+
      '<g class="hh194-leg hh194-legs-left" fill="none" stroke-linecap="round" stroke-linejoin="round">'+
        '<path d="M27 27 L17 16 L7 11 L2 1 M25 32 L12 24 L3 27 L0 33 M25 36 L10 38 L3 47 L0 53 M27 39 L18 47 L15 57 L13 63"/>'+
        '<path d="M18 16 L11 13 M12 24 L6 24 M10 38 L6 42 M18 47 L15 51" stroke="#78545b" stroke-width="1" opacity=".68"/>'+
      '</g>'+
      '<g class="hh194-leg hh194-legs-right" fill="none" stroke-linecap="round" stroke-linejoin="round">'+
        '<path d="M37 27 L47 16 L57 11 L62 1 M39 32 L52 24 L61 27 L64 33 M39 36 L54 38 L61 47 L64 53 M37 39 L46 47 L49 57 L51 63"/>'+
        '<path d="M46 16 L53 13 M52 24 L58 24 M54 38 L58 42 M46 47 L49 51" stroke="#78545b" stroke-width="1" opacity=".68"/>'+
      '</g>'+
      '<ellipse cx="32" cy="41" rx="13.3" ry="16.8" fill="url(#hh195-abdomen-'+side+')" stroke="#644047" stroke-width="1.3"/>'+
      '<path d="M23 39 Q29 34 35 37 Q40 39 43 43" stroke="#916b72" stroke-opacity=".54" stroke-width="1.1" fill="none"/>'+
      '<path d="M26 44 Q32 49 39 44 M27 52 Q32 55 38 51" stroke="#65343d" stroke-opacity=".64" fill="none" stroke-width="1.2"/>'+
      '<ellipse cx="32" cy="25" rx="8.7" ry="9.2" fill="url(#hh195-head-'+side+')" stroke="#6d4548" stroke-width="1"/>'+
      '<ellipse cx="28.5" cy="23" rx="1.6" ry="1.9" fill="#d94642"/>'+
      '<ellipse cx="35.5" cy="23" rx="1.6" ry="1.9" fill="#d94642"/>'+
      '<circle cx="29" cy="22.6" r=".55" fill="#ffdab4"/><circle cx="36" cy="22.6" r=".55" fill="#ffdab4"/>'+
      '<path d="M28 32 L30 36 M36 32 L34 36" stroke="#533038" stroke-width="1.8" stroke-linecap="round"/>'+
      '</svg>';
    return spider;
  }
  function mount(){
    var host=document.querySelector('.brand-logo-wrap.page-brand');
    if(!host||host.classList.contains('hh194-host')||!host.querySelector('img.brand-logo'))return;
    var scene=document.createElement('div');
    scene.className='hh194-scene';
    scene.setAttribute('aria-hidden','true');
    scene.appendChild(createSpider('left'));
    scene.appendChild(createSpider('right'));
    for(var i=1;i<=3;i++)scene.appendChild(createBat(i));
    host.classList.add('hh194-host');
    host.appendChild(scene);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();