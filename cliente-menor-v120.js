/* HYPE V125 — Opção de menor compatível com iPhone: formulário aberto na mesma aba. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 function update(){
   const choice=$('clientAgeDeclaration');
   const check=$('clientIsMinor');
   if(!choice && !check)return;
   const minor=check ? check.checked : choice.value==='menor';
   const warning=$('hypeMinorPurchaseWarning'),link=$('hypeMinorParentLink');
   if(warning)warning.hidden=!minor;
   if(link){
      // iPhone/WhatsApp/Instagram: não abrir pop-up ou nova aba (WebViews podem fechar).
      // A autorização é geral e não depende do evento selecionado.
      link.href='./menores.html?v=20261024-iphone-fotos-v156';
      link.target='_self';
      link.removeAttribute('rel');
   }
   const submit=$('ticketForm')?.querySelector('button[type="submit"]');
   if(submit){
     // Mantém o texto original do botão em cada checkout (PIX ou manual).
     if(!submit.dataset.hypeOriginalLabel) submit.dataset.hypeOriginalLabel=submit.textContent.trim();
     submit.disabled=minor;
     submit.title=minor?'Autorização e análise do ADM necessárias antes do pagamento':'';
     if(minor)submit.textContent='AGUARDE AUTORIZAÇÃO • NÃO PAGUE AINDA';
     else if(submit.textContent==='AGUARDE AUTORIZAÇÃO • NÃO PAGUE AINDA')submit.textContent=submit.dataset.hypeOriginalLabel;
   }
 }
 function init(){
   $('clientAgeDeclaration')?.addEventListener('change',update);
   $('clientIsMinor')?.addEventListener('change',()=>{
     update();
     // Deixe a pessoa tocar no link manualmente. Não usar window.open no iPhone.
   });
   $('clientCpf')?.addEventListener('input',update);
   $('ticketType')?.addEventListener('change',update);
   update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
 else init();
})();
