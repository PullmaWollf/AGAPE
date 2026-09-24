// ─── Célula Ágape — Service Worker v5 ───
// Só cuida de push e clique na notificação. Toda a rede vai direto ao Supabase/API
// (sem cache) para os dados nunca ficarem desatualizados.
const VERSAO = 'agape-v6';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request)); });

// O navegador já decifra o payload (RFC 8291) antes de disparar este evento.
self.addEventListener('push', (e) => {
  let data = { title: 'Célula Ágape', body: 'Nova notificação', url: '/' };
  try { data = { ...data, ...e.data.json() }; } catch (err) { /* payload vazio ou ilegível: usa o padrão */ }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      // Sem badge colorido: o Android pode renderizar PNGs fotográficos como quadrado preto.
      // O ícone principal continua sendo usado pela notificação e pelo app instalado.
      vibrate: [300, 100, 300],
      tag: data.tag || 'agape-push',
      renotify: true,
      data: { url: data.url || '/' },
      actions: [
        { action: 'open', title: 'Abrir' },
        { action: 'dismiss', title: 'Fechar' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => c.url.startsWith(self.location.origin));
      if (win) { win.focus(); win.navigate(url); }
      else clients.openWindow(url);
    })
  );
});

// Se a assinatura expirar (o navegador troca as chaves sozinho às vezes), avisa
// alguma aba aberta para recadastrar o aparelho no próximo primeiro-plano.
self.addEventListener('pushsubscriptionchange', () => {
  self.clients.matchAll({ type: 'window' }).then((list) => {
    list.forEach((c) => c.postMessage({ type: 'push-resubscribe' }));
  });
});
