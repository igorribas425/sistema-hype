// HYPE V66 - Emergency Service Worker cleanup.
// Removes the old cached worker that caused reload loops on Portaria.
self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>String(k).startsWith('hype-')).map(k=>caches.delete(k)));
    }catch(_){}
    try{await self.registration.unregister();}catch(_){}
    try{await self.clients.claim();}catch(_){}
  })());
});
self.addEventListener('fetch', event => {
  // Network only while V66 stabilizes Portaria.
});
