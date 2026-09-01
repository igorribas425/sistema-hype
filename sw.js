const CACHE='hype-v17-3-offline';
const CORE=[
  './',
  './portaria.html',
  './admin.html',
  './cliente.html',
  './app.js?v=20260901-v17-3',
  './v17-extra.js?v=20260901-v17-3',
  './v17-extra.css?v=20260901-v17-3',
  './register-sw.js?v=20260901-v17-3',
  './supabase-config.js',
  './apple-touch-icon.png'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    for(const url of CORE){
      try{
        const response=await fetch(url,{cache:'reload'});
        if(response.ok)await cache.put(new Request(url),response.clone());
      }catch(_){/* um item não pode impedir o restante do pacote */}
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
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);

  // Navegação: rede primeiro, Portaria salva como contingência.
  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const fresh=await fetch(req);
        if(fresh.ok)await cache.put(req,fresh.clone());
        return fresh;
      }catch(_){
        return (await cache.match(req)) || (await cache.match('./portaria.html')) || Response.error();
      }
    })());
    return;
  }

  // Arquivos do próprio site: cache primeiro no offline, atualiza quando possível.
  if(url.origin===self.location.origin){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const cached=await cache.match(req);
      if(cached){
        fetch(req).then(r=>{if(r.ok)cache.put(req,r.clone())}).catch(()=>{});
        return cached;
      }
      try{
        const fresh=await fetch(req);
        if(fresh.ok)await cache.put(req,fresh.clone());
        return fresh;
      }catch(_){return Response.error()}
    })());
    return;
  }

  // CDN (Supabase): usa uma cópia cacheada se ela já tiver sido carregada online.
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(req);
    if(cached)return cached;
    try{
      const fresh=await fetch(req);
      if(fresh.ok)await cache.put(req,fresh.clone());
      return fresh;
    }catch(_){return Response.error()}
  })());
});
