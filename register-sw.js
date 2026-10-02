// HYPE V66
// Service Worker temporarily disabled to prevent reload loops in Portaria.
(function(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations()
    .then(list=>Promise.all(list.map(reg=>reg.unregister())))
    .catch(()=>{});
  if('caches' in window){
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>String(k).startsWith('hype-')).map(k=>caches.delete(k))))
      .catch(()=>{});
  }
})();