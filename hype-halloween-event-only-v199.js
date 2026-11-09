/* MALIBU — retira a troca automática de logotipo herdada do Halloween Hype.
   Este script opera APENAS no clone, não no site original. */
(function(){'use strict';
  var logo="malibu-logo.svg",alt="Malibu Lounge";
  function apply(){
    if(!document.body)return;
    document.body.classList.remove('hh196-halloween');
    document.body.setAttribute('data-hh-event-theme','normal');
    var img=document.querySelector('.brand-logo-wrap.page-brand img.brand-logo');
    if(!img)return;
    if(img.getAttribute('src')!==logo)img.setAttribute('src',logo);
    if(img.getAttribute('alt')!==alt)img.setAttribute('alt',alt);
    if(!img.dataset.cloneLogoWatched){
      img.dataset.cloneLogoWatched='1';
      new MutationObserver(apply).observe(img,{attributes:true,attributeFilter:['src','alt']});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();
