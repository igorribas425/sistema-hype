/* HYPE cinematic photo intro v182 — decoration only; never modifies checkout or promoter links. */
(function(){
'use strict';
if(window.__hypeIntroV182)return;
window.__hypeIntroV182=true;
function init(){
  var target=document.getElementById('ticketBox');
  if(!target||document.getElementById('hypeIntroV182'))return;
  var query=new URLSearchParams(window.location.search);
  var bypass=['pedido','order','payment','paymentId','status','retorno','success','checkout','transaction','txid','external_reference'];
  if(bypass.some(function(k){return query.has(k);} ))return;
  var storageKey='hype-premium-intro-v182:'+location.pathname+':'+(query.get('promoter')||'');
  var replay=query.get('intro')==='1';
  try{if(!replay&&sessionStorage.getItem(storageKey)==='seen')return;}catch(_e){}
  var reduced=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var root=document.createElement('div');
  root.id='hypeIntroV182';
  root.setAttribute('role','dialog');
  root.setAttribute('aria-modal','true');
  root.setAttribute('aria-label','Convite especial para a HYPE Lounge Club');
  root.innerHTML='<div class="hi182-surround" aria-hidden="true"></div>'+
  '<div class="hi182-stage">'+
    '<img class="hi182-photo hi182-closed" src="assets/hype-intro-closed-v182.webp" alt="" decoding="async" fetchpriority="high" draggable="false">'+
    '<img class="hi182-photo hi182-open" src="assets/hype-intro-open-v182.webp" alt="" decoding="async" draggable="false">'+
    '<img class="hi182-photo hi182-smoke" src="assets/hype-intro-smoke-v182.webp" alt="" decoding="async" draggable="false">'+
    '<div class="hi182-darken" aria-hidden="true"></div><div class="hi182-glint" aria-hidden="true"></div>'+
    '<button type="button" class="hi182-hit hi182-envelope-hit" aria-label="Abrir envelope do convite Hype"></button>'+
    '<button type="button" class="hi182-hit hi182-buy-hit" aria-label="Comprar ingresso e abrir o site da Hype"></button>'+
    '<div class="hi182-sparks" aria-hidden="true"></div>'+
    '<button type="button" class="hi182-skip">Pular introdução ✕</button>'+
  '</div>';
  document.body.appendChild(root);
  document.documentElement.classList.add('hi182-lock');
  document.body.classList.add('hi182-lock');
  var openBtn=root.querySelector('.hi182-envelope-hit');
  var buyBtn=root.querySelector('.hi182-buy-hit');
  var skipBtn=root.querySelector('.hi182-skip');
  var stage=root.querySelector('.hi182-stage');
  var sparkBox=root.querySelector('.hi182-sparks');
  var oldFocus=document.activeElement;
  var opened=false, exiting=false, keydown;
  function save(){try{sessionStorage.setItem(storageKey,'seen')}catch(_e){}}
  function sparks(){
    if(reduced)return;
    sparkBox.innerHTML='';
    for(var i=0;i<28;i++){
      var s=document.createElement('i');
      s.className='hi182-spark';
      var angle=(i/28)*Math.PI*2,travel=50+(i*37)%160;
      s.style.setProperty('--x',(25+(i*17)%50)+'%');
      s.style.setProperty('--y',(25+(i*23)%48)+'%');
      s.style.setProperty('--dx',Math.cos(angle)*travel+'px');
      s.style.setProperty('--dy',Math.sin(angle)*travel+'px');
      s.style.setProperty('--delay',(i%8)*48+'ms');
      s.style.setProperty('--duration',(850+(i%6)*160)+'ms');
      sparkBox.appendChild(s);
    }
  }
  function finish(goToTickets){
    if(exiting)return;
    exiting=true;
    save();
    root.classList.add('hi182-exiting');
    if(!reduced)sparks();
    window.setTimeout(function(){
      document.documentElement.classList.remove('hi182-lock');
      document.body.classList.remove('hi182-lock');
      root.classList.add('hi182-gone');
      document.removeEventListener('keydown',keydown);
      if(goToTickets){
        target.scrollIntoView({block:'start',behavior:reduced?'auto':'smooth'});
      } else if(oldFocus&&oldFocus.focus){
        try{oldFocus.focus({preventScroll:true})}catch(_e){}
      }
      window.setTimeout(function(){root.remove()},reduced?35:390);
    },reduced?80:1600);
  }
  openBtn.addEventListener('click',function(){
    if(opened||exiting)return;
    opened=true;
    root.classList.add('hi182-opened');
    if(!reduced)sparks();
    window.setTimeout(function(){if(!exiting)buyBtn.focus({preventScroll:true})},reduced?20:1030);
  });
  buyBtn.addEventListener('click',function(e){e.preventDefault();finish(true)});
  skipBtn.addEventListener('click',function(){finish(false)});
  keydown=function(e){
    if(e.key==='Escape'){e.preventDefault();finish(false);return;}
    if(e.key==='Tab'&&!exiting){
      var controls=opened?[buyBtn,skipBtn]:[openBtn,skipBtn];
      var n=controls.indexOf(document.activeElement);
      if((e.shiftKey&&n<=0)||(!e.shiftKey&&n===controls.length-1)){
        e.preventDefault();controls[e.shiftKey?controls.length-1:0].focus();
      }
    }
  };
  document.addEventListener('keydown',keydown);
  openBtn.focus({preventScroll:true});
  // Never prevent a payment return from rendering; intro is optional.
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
