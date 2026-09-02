(function(){
  if(!('serviceWorker' in navigator)||!location.protocol.startsWith('http'))return;
  window.addEventListener('load',async()=>{
    try{const reg=await navigator.serviceWorker.register('./sw.js?v=20260902-v18',{updateViaCache:'none'});try{await reg.update();}catch(_){}}
    catch(err){console.warn('[HYPE V18] Service Worker não registrado:',err);}
  });
})();
