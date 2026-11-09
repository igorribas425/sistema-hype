/* MALIBU: identidade visual e favicon próprios, sem alterar Hype. */
(()=>{"use strict";
 const upper="MALIBU",brand="Malibu",logo="/malibu-logo.svg",icon="/favicon-malibu-v2.svg?v=20261109b4";
 const translate=s=>String(s).replace(/\bHYPE\b/g,upper).replace(/\bHype\b/g,brand);
 for(const e of document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]'))e.remove();
 const f=document.createElement("link");f.rel="icon";f.type="image/svg+xml";f.href=icon;document.head.appendChild(f);
 let working=false;
 function paint(){if(working||!document.body)return;working=true;
 try{
   document.title=translate(document.title);
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
   while((n=walker.nextNode())){if(n.parentElement?.closest("script,style,textarea,code,pre"))continue;const v=translate(n.nodeValue);if(n.nodeValue!==v)n.nodeValue=v;}
   for(const img of document.querySelectorAll("img")){
    const src=img.getAttribute("src")||"";if(/(?:logo-hype|hype-logo)/i.test(src))img.src=logo;
    const alt=img.getAttribute("alt")||"";if(/hype/i.test(alt))img.alt=translate(alt);
    if(!img.classList.contains("brand-logo")&&!img.classList.contains("v95-brand-logo"))continue;
    if(img.dataset.cloneLogoInstalled==="1")continue;
    img.dataset.cloneLogoInstalled="1";
    const fallback=document.createElement("div");fallback.className="clone-brand-fallback";fallback.style.cssText="display:none;color:#fff;text-align:center;font-size:clamp(36px,6vw,75px);font-weight:900;letter-spacing:.13em;line-height:1.1;padding:12px 2px";fallback.textContent=upper;
    img.insertAdjacentElement("afterend",fallback);
    const fail=()=>{img.style.display="none";fallback.style.display="block"};
    const ok=()=>{img.style.display="";fallback.style.display="none"};
    img.addEventListener("error",fail);img.addEventListener("load",ok);
    if(img.complete){if(img.naturalWidth===0)fail();else ok();}
   }
 }finally{working=false;}}
 function start(){paint();new MutationObserver(()=>{if(!working)paint()}).observe(document.body,{subtree:true,childList:true,characterData:true})}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
