/* Marca do clone; modifica apenas texto visível, sem mudar os IDs JS da Hype. */
(()=>{"use strict";
const name="Rogue",upper="ROGUE",logo="assets/rogue-clone-logo.webp";
function change(s){return String(s).replace(/\bHYPE\b/g,upper).replace(/\bHype\b/g,name).replace(/Hype Lounge/gi,name+" Lounge")}
function visit(root){if(!root)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){if(["SCRIPT","STYLE","TEXTAREA","CODE"].includes(n.parentNode?.nodeName))continue;let v=change(n.nodeValue);if(n.nodeValue!==v)n.nodeValue=v}}
function paint(){document.title=change(document.title);visit(document.body);for(const el of document.querySelectorAll("[title],[placeholder],[alt]")){for(const a of ["title","placeholder","alt"]){const old=el.getAttribute(a);if(old){const newer=change(old);if(old!==newer)el.setAttribute(a,newer)}}}for(const img of document.querySelectorAll("img[src*='hype-logo']"))img.src=logo}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{paint();new MutationObserver(paint).observe(document.body,{childList:true,characterData:true,subtree:true})});else{paint();new MutationObserver(paint).observe(document.body,{childList:true,characterData:true,subtree:true})}
})();
