/* HYPE cinematic intro v185: maior volume de névoa e revelação suave. */
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
  // Fumaça em camadas grandes e menores, misturadas, mas sem cobrir a tela inteira.
  var fog=document.createElement('div');
  fog.className='hi185-fog';
  fog.setAttribute('aria-hidden','true');
  var smokeParts=[
   ['46%','53%','62%','36%','-20deg','-160px','-120px','0ms'],
   ['56%','53%','60%','38%','35deg','170px','-125px','55ms'],
   ['39%','47%','53%','36%','-36deg','-190px','15px','80ms'],
   ['64%','43%','50%','34%','15deg','150px','-175px','120ms'],
   ['37%','62%','62%','35%','28deg','-160px','115px','135ms'],
   ['63%','66%','62%','38%','-28deg','195px','122px','185ms'],
   ['50%','42%','50%','32%','15deg','-15px','-180px','155ms'],
   ['51%','71%','67%','37%','-25deg','-40px','160px','190ms'],
   ['28%','55%','52%','41%','42deg','-195px','-70px','105ms'],
   ['75%','56%','51%','37%','-45deg','190px','-65px','160ms'],
   ['48%','55%','44%','33%','12deg','55px','-128px','255ms'],
   ['55%','61%','53%','33%','-12deg','100px','118px','265ms']
  ];
  smokeParts.forEach(function(v){
   var s=document.createElement('span');s.className='hi185-cloud';
   ['--sx','--sy','--sw','--sh','--rot','--dx','--dy','--delay'].forEach(function(k,i){s.style.setProperty(k,v[i]);});
   fog.appendChild(s);
  });
  stage.appendChild(fog);
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
    document.removeEventListener('keydown',keydown);
    openBtn.disabled=true;
    buyBtn.disabled=true;
    skipBtn.disabled=true;
    // Se pulou, não precisa reproduzir fumaça: apenas revelar a página.
    if(!goToTickets)root.classList.add('hi185-skipping');
    else if(!reduced)sparks();
    root.classList.add('hi182-exiting');
    var preRevealDelay=goToTickets&&!reduced?1430:20;
    window.setTimeout(function(){
      // Ajusta o site enquanto a camada ainda é totalmente opaca.
      // Evita ver a página rolando por trás de uma névoa semitransparente.
      document.documentElement.classList.remove('hi182-lock');
      document.body.classList.remove('hi182-lock');
      if(goToTickets&&target&&target.isConnected){
        var top=window.scrollY+target.getBoundingClientRect().top-12;
        window.scrollTo({top:Math.max(0,top),left:0,behavior:'instant'});
      }
      if(reduced){
        root.remove();
        if(!goToTickets&&oldFocus&&oldFocus.focus)try{oldFocus.focus({preventScroll:true})}catch(_e){}
        return;
      }
      // A página já está na posição certa: dissolve o cenário por cima dela.
      requestAnimationFrame(function(){
        root.classList.add('hi185-revealing');
      });
      window.setTimeout(function(){
        root.remove();
        if(!goToTickets&&oldFocus&&oldFocus.focus)try{oldFocus.focus({preventScroll:true})}catch(_e){}
      },790);
    },preRevealDelay);
  }
  openBtn.addEventListener('click',function(){
    if(opened||exiting)return;
    opened=true;
    root.classList.add('hi182-opened');
    if(!reduced)sparks();
    // Não força o foco depois do toque: isso desenhava um quadro sobre o botão.
    // Quem usa teclado alcança o botão normalmente pela tecla Tab.
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
  // Evita borda visual no primeiro carregamento; mantém foco visível via Tab.
  // Never prevent a payment return from rendering; intro is optional.
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
