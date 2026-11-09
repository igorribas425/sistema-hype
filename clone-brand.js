/* MALIBU: identidade do clone. Identificadores de função da HYPE preservados. */
(()=>{"use strict";
const brand="Malibu",upper="MALIBU",logo="malibu-logo.svg";
const format=s=>String(s).replace(/\bHYPE\b/g,upper).replace(/\bHype\b/g,brand).replace(/\bhype\b/g,brand);
let busy=false;
function paint(){if(busy||!document.body)return;busy=true;try{
 document.title=format(document.title);
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){if(node.parentElement?.closest("script,style,textarea,code,pre"))continue;const v=format(node.nodeValue);if(v!==node.nodeValue)node.nodeValue=v;}
 for(const img of document.querySelectorAll("img")){if(/(?:logo-hype|hype-logo)/i.test(img.getAttribute("src")||""))img.setAttribute("src",logo);const alt=img.getAttribute("alt");if(alt&&/hype/i.test(alt))img.setAttribute("alt",format(alt));}
 for(const el of document.querySelectorAll("[title],[placeholder]")){for(const a of ["title","placeholder"]){const v=el.getAttribute(a);if(v&&/hype/i.test(v))el.setAttribute(a,format(v));}}
 }finally{busy=false}}
function start(){paint();new MutationObserver(()=>{if(!busy)paint()}).observe(document.body,{childList:true,characterData:true,subtree:true})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
