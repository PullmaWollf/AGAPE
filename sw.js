// Ágape PWA — shell mínimo offline, rede como fonte de verdade.
// Nunca cacheia API, sessões, dados de usuários ou respostas do Supabase.
const CACHE = 'agape-pwa-shell-v21';
const SHELL = [
  '/offline.html', '/', '/manifest.json', '/css/agape-modern.css', '/css/agape-love.css', '/css/agape-editorial.css', '/assets/agape-hero.svg',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/js/utils.js', '/js/config.js', '/js/app.js', '/js/perfis.js', '/js/theme.js', '/js/ui-icons.js',
  '/css/chamada.css', '/js/chamada.js', '/js/frequencia.js', '/js/frequencia-calculos.js',
  '/js/admin-chamadas.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('agape-pwa-shell-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Não entrega conteúdo privativo do cache e avisa quando não há rede.
    event.respondWith(fetch(request).catch(async () =>
      (await caches.match('/offline.html')) ||
      new Response('Sem conexão. Abra novamente quando estiver online.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    ));
    return;
  }
  const staticPath = SHELL.includes(url.pathname) && url.pathname !== '/';
  if (!staticPath) return;
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
      }
      return response;
    }).catch(async () => (await caches.match(request)) || Response.error())
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Célula Ágape', body: 'Nova notificação', url: '/' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { /* payload vazio */ }
  const destino = new URL(data.url || '/', self.location.origin);
  const url = destino.origin === self.location.origin ? destino.pathname + destino.search : '/';
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    vibrate: [300, 100, 300],
    tag: data.tag || 'agape-push',
    renotify: true,
    data: { url },
    actions: [{ action: 'open', title: 'Abrir' }, { action: 'dismiss', title: 'Fechar' }],
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
    const win = list.find((client) => client.url.startsWith(self.location.origin));
    if (win) { await win.focus(); return win.navigate(url.href); }
    return self.clients.openWindow(url.href);
  }));
});
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) =>
    Promise.all(list.map((client) => client.postMessage({ type: 'push-resubscribe' })))
  ));
});
