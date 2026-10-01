(function(){
  if(!('serviceWorker' in navigator)||!location.protocol.startsWith('http'))return;
  window.addEventListener('load',async()=>{
    try{const reg=await navigator.serviceWorker.register('./sw.js?v=20261001-v45',{updateViaCache:'none'});try{await reg.update();}catch(_){} }
    catch(err){console.warn('[HYPE V20] Service Worker não registrado:',err);}
  });
})();
