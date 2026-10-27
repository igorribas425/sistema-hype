/* HYPE Halloween v194: aranhas e morcegos são SVGs animados via CSS (não imagens estáticas). */
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
    spider.innerHTML='<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'+
      '<g class="hh194-leg hh194-legs-left" stroke="#312329" stroke-width="2.9" stroke-linecap="round" fill="none">'+
      '<path d="M26 29 Q12 16 5 20 L2 10 M25 33 Q11 25 4 34 L1 37 M25 36 Q10 38 6 49 L2 56 M26 39 Q18 48 19 58"/></g>'+
      '<g class="hh194-leg hh194-legs-right" stroke="#312329" stroke-width="2.9" stroke-linecap="round" fill="none">'+
      '<path d="M38 29 Q52 16 59 20 L62 10 M39 33 Q53 25 60 34 L63 37 M39 36 Q54 38 58 49 L62 56 M38 39 Q46 48 45 58"/></g>'+
      '<ellipse cx="32" cy="25" rx="7" ry="8" fill="#20161b" stroke="#5e3236" stroke-width="1"/>'+
      '<ellipse cx="32" cy="41" rx="11" ry="14" fill="#120e13" stroke="#51272e" stroke-width="1.6"/>'+
      '<path d="M26 39 L32 45 L38 39" stroke="#922a34" stroke-width="2" fill="none" opacity=".75"/>'+
      '<circle cx="29" cy="25" r="1.5" fill="#b53b3b"/><circle cx="35" cy="25" r="1.5" fill="#b53b3b"/></svg>';
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