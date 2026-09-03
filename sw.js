const CACHE='hype-v20-offline';
const CORE=[
  './',
  './cliente.html',
  './index.html',
  './admin.html',
  './portaria.html',
  './leitor.html',
  './app.js?v=20260902-v20',
  './promoter-global-v16-8.js?v=20260902-v20-global',
  './v19-admin.js?v=20260902-v20',
  './v20-admin.js?v=20260902-v20',
  './v18-client.js?v=20260902-v20',
  './portaria-v18.js?v=20260902-v20',
  './portaria-v20.js?v=20260902-v20',
  './leitor-v20.js?v=20260902-v20',
  './hype-qrcode.js?v=20260902-v20',
  './supabase-config.js?v=20260902-v20',
  './logo-hype.png',
  './favicon.png'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    for(const url of CORE){
      try{const response=await fetch(url,{cache:'reload'});if(response.ok)await cache.put(new Request(url),response.clone());}catch(_){ }
    }
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('hype-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{const fresh=await fetch(req);if(fresh.ok)await cache.put(req,fresh.clone());return fresh;}
      catch(_){
        const direct=await cache.match(req);if(direct)return direct;
        const file=url.pathname.split('/').pop()||'index.html';
        return (await cache.match(`./${file}`))||(await cache.match('./portaria.html'))||Response.error();
      }
    })());return;
  }
  if(url.origin===self.location.origin){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);const cached=await cache.match(req);
      if(cached){fetch(req).then(r=>{if(r.ok)cache.put(req,r.clone())}).catch(()=>{});return cached;}
      try{const fresh=await fetch(req);if(fresh.ok)await cache.put(req,fresh.clone());return fresh;}catch(_){return Response.error();}
    })());return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);const cached=await cache.match(req);if(cached)return cached;
    try{const fresh=await fetch(req);if(fresh.ok)await cache.put(req,fresh.clone());return fresh;}catch(_){return Response.error();}
  })());
});
