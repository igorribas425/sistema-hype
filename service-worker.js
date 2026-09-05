/* HYPE V42.1 — Service Worker para notificação push real do Chat HYPE */
const HYPE_CHAT_URL = './admin.html?v=421';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  const title = data.title || 'Chat HYPE';
  const body = data.body || 'Nova mensagem no chat da equipe.';
  const url = data.url || HYPE_CHAT_URL;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: 'hype-chat-v421',
      renotify: true,
      silent: false,
      vibrate: [120, 70, 120],
      icon: './apple-touch-icon.png',
      badge: './apple-touch-icon.png',
      data: { url }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || HYPE_CHAT_URL, self.location.href).href;
  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if ('focus' in client) {
        await client.focus();
        try { client.postMessage({ type: 'HYPE_OPEN_CHAT' }); } catch (_) {}
        return;
      }
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});
