/* HYPE LOUNGE CLUB — Halloween da Hype | decoração da página de compra (v172).
   Mesmo cliente.html para compra direta e link individual do promoter.
   Não altera formulários, preços, QR Codes ou pagamentos. */
(function () {
  "use strict";
  if (!/\/cliente\.html$/i.test(location.pathname) && !/\/$/.test(location.pathname)) return;
  if (window.__HYPE_HALLOWEEN_V172__) return;
  window.__HYPE_HALLOWEEN_V172__ = true;

  const css = [
    '#hype-halloween-v172{position:fixed;inset:0;z-index:1001;pointer-events:none;overflow:hidden;opacity:0;visibility:hidden;transition:opacity .6s ease,visibility .6s ease;contain:layout paint;isolation:isolate}',
    '#hype-halloween-v172.hh-active{opacity:1;visibility:visible}',
    '#hype-halloween-v172 .hh-edge{position:absolute;inset:0;box-shadow:inset 0 0 100px 6px rgba(114,3,1,.19),inset 0 0 22px 1px rgba(197,17,11,.18);border:2px solid rgba(162,24,13,.23)}',
    '#hype-halloween-v172 .hh-top{position:absolute;top:0;left:0;right:0;height:112px;background:linear-gradient(180deg,rgba(35,0,0,.72),transparent);border-top:2px solid rgba(219,34,13,.48)}',
    '#hype-halloween-v172 .hh-bottom{position:absolute;bottom:0;left:0;right:0;height:90px;background:linear-gradient(0deg,rgba(48,0,0,.56),transparent);border-bottom:2px solid rgba(217,28,13,.5)}',
    '#hype-halloween-v172 .hh-corner{position:absolute;width:clamp(120px,20vw,255px);height:auto;opacity:.84;filter:drop-shadow(0 0 14px rgba(231,26,7,.53));will-change:transform}',
    '#hype-halloween-v172 .hh-corner.tl{left:-4px;top:0}',
    '#hype-halloween-v172 .hh-corner.tr{right:-4px;top:0;transform:scaleX(-1)}',
    '#hype-halloween-v172 .hh-corner.bl{left:-4px;bottom:0;transform:scaleY(-1)}',
    '#hype-halloween-v172 .hh-corner.br{right:-4px;bottom:0;transform:scale(-1)}',
    '#hype-halloween-v172 .hh-moon{position:absolute;width:88px;height:88px;border-radius:50%;top:54px;left:26px;background:radial-gradient(circle at 37% 34%,#ff9b52,#e32b0f 45%,#6a0b08 73%);box-shadow:0 0 40px 15px rgba(210,26,8,.27),inset -17px -8px 19px rgba(45,0,0,.46);opacity:.52}',
    '#hype-halloween-v172 .hh-moon.second{left:auto;right:45px;top:24px;width:54px;height:54px;opacity:.37}',
    '#hype-halloween-v172 .hh-pumpkin{position:absolute;bottom:-5px;width:clamp(70px,11vw,135px);height:auto;filter:drop-shadow(0 0 17px rgba(255,62,9,.65));opacity:.91}',
    '#hype-halloween-v172 .hh-pumpkin.left{left:4px}',
    '#hype-halloween-v172 .hh-pumpkin.right{right:4px;transform:scaleX(-1)}',
    '#hype-halloween-v172 .hh-fly{position:absolute;top:0;left:0;display:block;will-change:transform;transform:translate3d(-24vw,0,0);}',
    '#hype-halloween-v172 .hh-bat{width:var(--sz,46px);height:auto;fill:#130305;stroke:rgba(255,72,40,.6);stroke-width:.6;filter:drop-shadow(0 0 3px rgba(255,64,12,.48));opacity:.86;animation:hh-flap 1.1s ease-in-out infinite alternate}',
    '#hype-halloween-v172 .hh-bat-fly{top:var(--y,20%);animation:hh-bat-cross var(--d,16s) linear var(--delay,0s) infinite}',
    '#hype-halloween-v172 .hh-witch-fly{top:var(--y,13%);animation:hh-witch-cross var(--d,25s) linear var(--delay,0s) infinite}',
    '#hype-halloween-v172 .hh-witch{width:var(--sz,125px);height:auto;overflow:visible;fill:#090204;stroke:#752010;stroke-width:1;filter:drop-shadow(0 0 7px rgba(241,36,11,.7))}',
    '#hype-halloween-v172 .hh-ember{position:absolute;left:var(--x,50%);bottom:-20px;width:var(--s,3px);height:var(--s,3px);border-radius:50%;background:#ff5a17;box-shadow:0 0 10px #f94418;opacity:0;animation:hh-spark var(--d,13s) linear var(--delay,0s) infinite}',
    '@keyframes hh-bat-cross{0%{transform:translate3d(-22vw,5vh,0) rotate(-11deg)}42%{transform:translate3d(48vw,-2vh,0) rotate(12deg)}100%{transform:translate3d(122vw,7vh,0) rotate(-7deg)}}',
    '@keyframes hh-witch-cross{0%{transform:translate3d(-26vw,7vh,0) rotate(-8deg)}45%{transform:translate3d(49vw,-4vh,0) rotate(2deg)}100%{transform:translate3d(122vw,5vh,0) rotate(-4deg)}}',
    '@keyframes hh-flap{from{transform:scaleY(.63)}to{transform:scaleY(1.14)}}',
    '@keyframes hh-spark{0%{transform:translate3d(0,0,0);opacity:0}20%{opacity:.72}82%{opacity:.55}100%{transform:translate3d(24px,-82vh,0);opacity:0}}',
    '@media(max-width:700px){#hype-halloween-v172 .hh-corner{width:118px;opacity:.66}#hype-halloween-v172 .hh-top{height:90px}#hype-halloween-v172 .hh-bottom{height:62px}#hype-halloween-v172 .hh-moon{width:53px;height:53px;top:33px;left:19px}#hype-halloween-v172 .hh-moon.second{width:31px;height:31px;right:20px}#hype-halloween-v172 .hh-pumpkin{width:70px;opacity:.82}#hype-halloween-v172 .hh-witch-fly.second,#hype-halloween-v172 .hh-bat-fly.hide-mobile{display:none}}',
    '@media(prefers-reduced-motion:reduce){#hype-halloween-v172 *{animation:none!important;transition:none!important}#hype-halloween-v172 .hh-fly{display:none!important}#hype-halloween-v172 .hh-ember{display:none!important}}'
  ].join('\n');
  const style = document.createElement('style');
  style.id = 'hype-halloween-style-v172';
  style.textContent = css;
  document.head.appendChild(style);

  const corner = '<svg viewBox="0 0 240 270" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="hh-red"><stop stop-color="#ff3610" stop-opacity=".5"/><stop offset="1" stop-color="#ff3610" stop-opacity="0"/></radialGradient></defs><circle cx="10" cy="10" r="175" fill="url(#hh-red)"/><path d="M0 0 H240 M0 0 V270" fill="none" stroke="#d62615" stroke-width="3" opacity=".8"/><g fill="none" stroke="#bdc1c1" stroke-opacity=".62" stroke-width="1.15"><path d="M0 0 L230 230 M0 0 L160 270 M0 0 L240 114 M0 0 L240 42 M0 0 L85 270 M0 0 L29 270"/><path d="M0 35 Q40 27 53 0 M0 67 Q77 55 96 0 M0 104 Q111 73 139 0 M0 145 Q151 96 180 0 M0 195 Q178 118 220 0 M0 239 Q198 142 240 0"/></g><path d="M0 0 Q23 41 0 93 Q40 114 0 179 Q38 201 0 270" fill="none" stroke="#b92713" stroke-width="7" opacity=".43"/><path d="M0 0 Q51 6 95 0 T190 0" fill="none" stroke="#d23c15" stroke-width="6" opacity=".36"/></svg>';
  const bat = '<svg class="hh-bat" viewBox="0 0 100 53" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M50 22 Q45 4 39 17 Q20 4 1 10 Q9 18 7 34 Q18 24 23 41 Q32 34 39 45 Q43 34 50 31 Q57 34 61 45 Q68 34 77 41 Q82 24 93 34 Q91 18 99 10 Q80 4 61 17 Q55 4 50 22Z"/></svg>';
  const witch = '<svg class="hh-witch" viewBox="0 0 190 118" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="#0b0205" stroke="#8a180f" stroke-width="1.2"><path d="M3 92 Q81 77 178 96 L187 101 L3 98 Z"/><path d="M77 19 L94 0 L107 31 Q116 36 131 37 L131 43 L60 43 Q76 36 77 19Z"/><path d="M88 44 Q74 42 72 57 L86 68 Q69 91 38 97 Q63 104 91 94 L108 80 L135 100 L145 95 Q122 74 112 59 Q107 49 98 45Z"/><circle cx="99" cy="48" r="12"/><path d="M88 61 Q119 55 123 71 L137 80 L142 76 L124 58 Q108 50 88 61Z"/><path d="M86 89 Q82 109 64 115 L72 116 Q91 102 100 93Z"/><path d="M114 86 Q132 108 143 114 L150 111 Q133 91 127 80Z"/><path d="M174 91 Q168 108 154 112 M177 92 Q180 108 187 114 M171 94 Q158 106 151 108" fill="none"/></g><path d="M8 95 L185 95" stroke="#ef5822" stroke-width="2" opacity=".63"/></svg>';
  const pumpkin = '<svg viewBox="0 0 130 107" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="hh-p"><stop stop-color="#ff7832"/><stop offset=".75" stop-color="#a5220b"/><stop offset="1" stop-color="#340608"/></radialGradient></defs><path d="M64 27 Q52 9 72 2 Q59 17 78 25" fill="#2b2106" stroke="#6f3f09" stroke-width="2"/><ellipse cx="67" cy="67" rx="54" ry="39" fill="url(#hh-p)" stroke="#64150b" stroke-width="2"/><path d="M67 28 C34 38 31 95 65 106 M67 28 C99 38 100 95 66 106" stroke="#3d0909" stroke-width="2" opacity=".46" fill="none"/><path d="M27 60 L48 49 L53 66 Z M77 66 L83 49 L108 60 Z M57 75 L72 75 L64 63 Z M31 82 Q66 110 103 80 L94 89 L83 84 L74 96 L65 89 L57 97 L48 86 L39 92 Z" fill="#ffcb4e" stroke="#250402" stroke-width="2"/></svg>';

  let root = document.getElementById('hype-halloween-v172');
  if (!root) {
    root = document.createElement('div');
    root.id = 'hype-halloween-v172';
    root.setAttribute('aria-hidden','true');
    root.innerHTML = '<div class="hh-edge"></div><div class="hh-top"></div><div class="hh-bottom"></div>'
      + '<div class="hh-moon"></div><div class="hh-moon second"></div>'
      + ['tl','tr','bl','br'].map(p=>'<span class="hh-corner '+p+'">'+corner+'</span>').join('')
      + '<span class="hh-pumpkin left">'+pumpkin+'</span><span class="hh-pumpkin right">'+pumpkin+'</span>';
    const bats = [
      {y:16,s:38,d:14,delay:-2},{y:34,s:26,d:19,delay:-13},
      {y:9,s:57,d:21,delay:-16},{y:57,s:34,d:17,delay:-7},
      {y:24,s:21,d:22,delay:-10},{y:70,s:31,d:23,delay:-14},
      {y:42,s:43,d:27,delay:-22},{y:13,s:31,d:25,delay:-5}
    ];
    bats.forEach((p,i)=>{
      const el=document.createElement('span');
      el.className='hh-fly hh-bat-fly'+(i>3?' hide-mobile':'');
      el.style.cssText='--y:'+p.y+'%;--sz:'+p.s+'px;--d:'+p.d+'s;--delay:'+p.delay+'s';
      el.innerHTML=bat;
      root.appendChild(el);
    });
    [{y:13,s:115,d:27,delay:-9},{y:59,s:77,d:32,delay:-23}].forEach((p,i)=>{
      const el=document.createElement('span');
      el.className='hh-fly hh-witch-fly'+(i?' second':'');
      el.style.cssText='--y:'+p.y+'%;--sz:'+p.s+'px;--d:'+p.d+'s;--delay:'+p.delay+'s';
      el.innerHTML=witch;
      root.appendChild(el);
    });
    for(let i=0;i<10;i++){
      const el=document.createElement('span');
      el.className='hh-ember';
      el.style.cssText='--x:'+((i*37+11)%95)+'%;--s:'+(2+i%3)+'px;--d:'+(10+i%5*2)+'s;--delay:-'+(i*2.1)+'s';
      root.appendChild(el);
    }
    document.body.appendChild(root);
  }
  let isActive=false;
  function themeCheck() {
    let ev;
    try { ev=(typeof HYPE==='object'&&HYPE)?HYPE.event:null; } catch(e){ev=null;}
    const halloween = !!(ev && ev.active !== false &&
      (Number(ev.id)===25 || (/halloween/i.test(String(ev.name||'')) && String(ev.event_date||'').slice(0,10)==='2026-10-30')));
    if(halloween===isActive)return;
    isActive=halloween;
    root.classList.toggle('hh-active',halloween);
    document.documentElement.classList.toggle('hype-halloween-event-v172',halloween);
  }
  themeCheck();
  document.addEventListener('click',()=>setTimeout(themeCheck,120),true);
  window.addEventListener('pageshow',themeCheck);
  window.setInterval(themeCheck,1800);
})();