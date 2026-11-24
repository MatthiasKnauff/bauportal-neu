// Hält die Oberfläche im Gerät vor, damit das Bauportal auch ohne Netz öffnet.
// Seiten kommen zuerst aus dem Netz (immer aktuell), nur ohne Netz aus dem Vorrat.
const VORRAT = 'bauportal-oberflaeche-1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname === '/health') return;
  const merken = (antwort, schluessel) => {
    if (antwort.ok) { const kopie = antwort.clone(); caches.open(VORRAT).then((c) => c.put(schluessel, kopie)); }
    return antwort;
  };
  if (u.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(e.request).then((t) => t || fetch(e.request).then((a) => merken(a, e.request))));
  } else {
    const schluessel = e.request.mode === 'navigate' ? '/' : e.request;
    e.respondWith(fetch(e.request).then((a) => merken(a, schluessel)).catch(() => caches.match(schluessel).then((t) => t || Response.error())));
  }
});
