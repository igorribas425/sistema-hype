(function(){
  if(!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('./sw.js?v=20260901-v17-3',{updateViaCache:'none'});
      try{await reg.update()}catch(_){}
    }catch(err){console.warn('[HYPE] Service Worker não registrado:',err)}
  });
})();
