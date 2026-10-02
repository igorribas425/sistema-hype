(function(){
  if(!('serviceWorker' in navigator)||!location.protocol.startsWith('http'))return;
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloading)return;
    reloading=true;
    location.reload();
  });
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('./sw.js?v=20261002-v64',{updateViaCache:'none'});
      try{await reg.update();}catch(_){}
    }catch(err){
      console.warn('[HYPE V64] Service Worker não registrado:',err);
    }
  });
})();