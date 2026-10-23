/* HYPE V46: notificação Web Push para chat e chamados urgentes ADM. */
const HYPE_ADMIN_URL='./admin.html#chamados';

self.addEventListener('install',event=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?event.data.json():{}}catch(_){data={};}
 const urgent=data.type==='admin_call';
 const title=String(data.title||(urgent?'🆘 HYPE — PORTARIA CHAMANDO!':'Chat HYPE'));
 const body=String(data.body||(urgent?'A portaria precisa do ADM.':'Nova mensagem no chat da equipe.'));
 const url=urgent?HYPE_ADMIN_URL:(data.url||'./admin.html');
 const tag=urgent?String(data.tag||'hype-admin-call'): 'hype-chat-v421';
 event.waitUntil(self.registration.showNotification(title,{
   body,
   tag,
   renotify:true,
   requireInteraction:urgent,
   silent:false,
   vibrate:urgent?[370,130,370,150,550]:[180,80,180],
   icon:'./apple-touch-icon.png',
   badge:'./apple-touch-icon.png',
   data:{url,kind:urgent?'admin_call':'chat'},
   timestamp:Date.now()
 }));
});

self.addEventListener('notificationclick',event=>{
 const notification=event.notification;
 const kind=notification?.data?.kind;
 notification.close();
 const destination=new URL(notification?.data?.url||HYPE_ADMIN_URL,self.location.href);
 event.waitUntil((async()=>{
   const list=await clients.matchAll({type:'window',includeUncontrolled:true});
   for(const client of list){
     try{
       const u=new URL(client.url);
       if(u.origin===destination.origin&&u.pathname.endsWith('/admin.html')){
         if('focus'in client)await client.focus();
         try{client.postMessage({type:kind==='admin_call'?'HYPE_OPEN_CALLS':'HYPE_OPEN_CHAT'});}catch(_){}
         return;
       }
     }catch(_){}
   }
   if(clients.openWindow)await clients.openWindow(destination.href);
 })());
});