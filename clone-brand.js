/* Clone ROGUE: identidade visual + ícone próprio, sem alterar HYPE. */
(()=>{"use strict";
 const brand="Rogue", upper="ROGUE";
 const logo="https://rogue-vendas.vercel.app/assets/rogue-logo.webp",favicon="/favicon-rogue-v2.svg?v=20261109b4";
 const translate=s=>String(s).replace(/\bHYPE\b/g,upper).replace(/\bHype\b/g,brand);
 // Favicon deve ser instalado cedo, antes do carregamento de conteúdo.
 function setFavicon(){
   for(const old of document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]'))old.remove();
   const l=document.createElement('link');l.rel='icon';l.type='image/svg+xml';l.href=favicon;document.head.appendChild(l);
 }
 setFavicon();
 let busy=false;
 function paint(){if(busy||!document.body)return;busy=true;
  try{
   const title=translate(document.title);if(title!==document.title)document.title=title;
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
   while((node=walker.nextNode())){
     if(node.parentElement?.closest('script,style,textarea,code,pre'))continue;
     const next=translate(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next;
   }
   for(const img of document.querySelectorAll('img')){
     const s=img.getAttribute('src')||'';
     if(/(?:logo-hype|hype-logo|rogue-clone-logo)/i.test(s))img.setAttribute('src',logo);
     const alt=img.getAttribute('alt')||'';if(/hype/i.test(alt))img.setAttribute('alt',translate(alt));
     if(!img.classList.contains('brand-logo')&&!img.classList.contains('v95-brand-logo'))continue;
     if(img.dataset.cloneLogoInstalled==='1')continue;
     img.dataset.cloneLogoInstalled='1';
     const el=document.createElement('div');el.className='clone-brand-fallback';el.setAttribute('role','img');el.setAttribute('aria-label',brand+' Lounge');
     el.style.cssText='display:none;color:#fff;text-align:center;font-weight:900;font-size:clamp(36px,6vw,75px);letter-spacing:.13em;line-height:1.1;padding:12px 2px;';
     el.textContent=upper;
     img.insertAdjacentElement('afterend',el);
     const fail=()=>{img.style.display='none';el.style.display='block'};
     const ok=()=>{img.style.display='';el.style.display='none'};
     img.addEventListener('error',fail);img.addEventListener('load',ok);
     if(img.complete) {if(img.naturalWidth===0)fail();else ok();}
   }
  }finally{busy=false;}
 }
 function start(){paint();new MutationObserver(()=>{if(!busy)paint()}).observe(document.body,{childList:true,characterData:true,subtree:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
