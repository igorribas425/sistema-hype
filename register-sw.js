(function(){
  if(!('serviceWorker' in navigator)||!location.protocol.startsWith('http'))return;

  // V65: atualiza o Service Worker sem recarregar a página automaticamente.
  // O reload por controllerchange podia criar um loop na Portaria em alguns celulares.
  window.addEventListener('load',async()=>{
    try{
      const registration=await navigator.serviceWorker.register('./sw.js?v=20261002-v64',{updateViaCache:'none'});
      try{await registration.update();}catch(_){}
    }catch(err){
      console.warn('[HYPE V65] Service Worker não registrado:',err);
    }
  });
})();