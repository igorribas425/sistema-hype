/* HYPE cinematic intro v187: noite sombria, velas vivas e corvo interativo à direita. */
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

  // Filtro noturno acima das fotos e focos de luz das velas, sem trocar as imagens.
  var night=document.createElement('div');night.className='hi187-night';
  night.setAttribute('aria-hidden','true');stage.appendChild(night);
  var effects=document.createElement('div');effects.className='hi187-effects-space';
  effects.setAttribute('aria-hidden','true');stage.appendChild(effects);
  var candles=[
    ['8.6%','16.4%','1.53s'],['15.2%','25.7%','1.81s'],
    ['23.1%','32.4%','1.37s'],['28.3%','39.6%','2.11s'],
    ['43.8%','39.5%','1.69s'],['97.5%','50.5%','1.94s']
  ];
  candles.forEach(function(v){
    var flame=document.createElement('span');flame.className='hi187-candle';
    flame.style.setProperty('--cx',v[0]);flame.style.setProperty('--cy',v[1]);
    flame.style.setProperty('--speed',v[2]);effects.appendChild(flame);
  });
  var crowHit=document.createElement('button');
  crowHit.type='button';crowHit.className='hi187-crow-hit';
  crowHit.setAttribute('aria-label','Tocar no corvo do lado direito');
  crowHit.title='Toque no corvo';
  effects.appendChild(crowHit);
  var crowEye=document.createElement('span');crowEye.className='hi187-crow-eye';effects.appendChild(crowEye);
  var feathers=[
    ['89%','31%','-12deg','-74px','-50px','0ms'],
    ['90%','35%','24deg','-114px','36px','80ms'],
    ['94%','37%','-21deg','28px','100px','125ms'],
    ['86%','34%','10deg','-95px','69px','170ms'],
    ['93%','29%','30deg','35px','-70px','65ms']
  ];
  feathers.forEach(function(v){
    var piece=document.createElement('span');piece.className='hi187-feather';
    ['--fx','--fy','--angle','--dx','--dy','--delay'].forEach(function(k,i){piece.style.setProperty(k,v[i]);});
    effects.appendChild(piece);
  });

  // Névoa texturizada que circula o envelope sem formar uma tela branca.
  var fog=document.createElement('div');
  fog.className='hi186-fog';
  fog.setAttribute('aria-hidden','true');
  var smokeParts=[
    ['38%','50%','56%','35%','-20deg','-128px','-104px','0ms'],
    ['60%','49%','55%','35%','29deg','135px','-103px','45ms'],
    ['38%','61%','55%','35%','22deg','-135px','74px','90ms'],
    ['64%','60%','55%','35%','-27deg','145px','90px','115ms'],
    ['46%','43%','44%','28%','-22deg','-64px','-136px','145ms'],
    ['53%','68%','51%','30%','25deg','25px','122px','175ms'],
    ['27%','57%','40%','30%','39deg','-132px','20px','230ms'],
    ['74%','55%','44%','31%','-30deg','131px','-42px','220ms'],
    ['49%','55%','40%','28%','8deg','-24px','-92px','285ms']
  ];
  smokeParts.forEach(function(v){
    var s=document.createElement('span');s.className='hi186-cloud';
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
    if(!goToTickets)root.classList.add('hi186-skipping');
    else if(!reduced)sparks();
    root.classList.add('hi182-exiting');
    var preRevealDelay=goToTickets&&!reduced?1190:20;
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
        root.classList.add('hi186-revealing');
      });
      window.setTimeout(function(){
        root.remove();
        if(!goToTickets&&oldFocus&&oldFocus.focus)try{oldFocus.focus({preventScroll:true})}catch(_e){}
      },950);
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

  var crowReset=null;
  function crowCall(){
    // Áudio curto apenas depois de toque intencional; nunca toca automaticamente.
    try{
      var AudioCtx=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtx)return;
      var context=new AudioCtx();
      var now=context.currentTime;
      [0,.18].forEach(function(delay,i){
        var osc=context.createOscillator(),filter=context.createBiquadFilter(),gain=context.createGain();
        osc.type='sawtooth';filter.type='lowpass';filter.frequency.value=910;
        osc.frequency.setValueAtTime(i?510:610,now+delay);
        osc.frequency.exponentialRampToValueAtTime(i?210:255,now+delay+.17);
        gain.gain.setValueAtTime(.0001,now+delay);
        gain.gain.exponentialRampToValueAtTime(.038,now+delay+.035);
        gain.gain.exponentialRampToValueAtTime(.0001,now+delay+.22);
        osc.connect(filter);filter.connect(gain);gain.connect(context.destination);
        osc.start(now+delay);osc.stop(now+delay+.24);
      });
      window.setTimeout(function(){context.close().catch(function(){})},900);
    }catch(_err){}
  }
  crowHit.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();
    if(exiting)return;
    root.classList.remove('hi187-crow-awake');
    void effects.offsetWidth;
    root.classList.add('hi187-crow-awake');
    if(!reduced)crowCall();
    if(crowReset)window.clearTimeout(crowReset);
    crowReset=window.setTimeout(function(){root.classList.remove('hi187-crow-awake')},1750);
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
