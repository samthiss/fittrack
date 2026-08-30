// FitTrack service worker — push notifications only.
//
// Deliberately no offline caching: a cache here would serve a stale index.html after every
// deploy, and the app is useless without its API anyway. This file exists so iOS has something
// to deliver push messages to (a Home Screen PWA can only receive them through a service worker).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'FitTrack';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // One notification per kind replaces the previous one instead of stacking: a reminder that
      // fired this morning shouldn't still be sitting there next to tonight's.
      tag: payload.tag || 'fittrack',
      renotify: true,
      data: { url: payload.url || '/' },
    })
  );
});

// Tapping the notification focuses the app if it's already open, rather than opening a second copy.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
