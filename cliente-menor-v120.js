/* HYPE V120 — Sinalização de menor antes de pagar: aprovação manual primeiro */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 function update(){
   const choice=$('clientAgeDeclaration');
   if(!choice)return;
   const minor=choice.value==='menor';
   const warning=$('hypeMinorPurchaseWarning'),link=$('hypeMinorParentLink');
   if(warning)warning.hidden=!minor;
   if(link){
      let eventId=0;
      try{if(typeof HYPE!=='undefined')eventId=Number(HYPE.selectedEventId||HYPE.event?.id||0)}catch(_){}
      link.href='./menores.html'+(eventId>0?'?evento='+encodeURIComponent(String(eventId)):'');
   }
   const submit=$('ticketForm')?.querySelector('button[type="submit"]');
   if(submit){
     // Menores só podem ser tratados pela equipe após análise.
     submit.disabled=minor;
     submit.title=minor?'Autorização e avaliação do ADM antes do pagamento':'';
     if(minor)submit.textContent='AGUARDE AUTORIZAÇÃO • NÃO PAGUE AINDA';
     else if(submit.textContent==='AGUARDE AUTORIZAÇÃO • NÃO PAGUE AINDA')submit.textContent='CRIAR PEDIDO E ABRIR WHATSAPP';
   }
 }
 function init(){
   $('clientAgeDeclaration')?.addEventListener('change',update);
   $('clientCpf')?.addEventListener('input',update);
   $('ticketType')?.addEventListener('change',update);
   update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
 else init();
})();
