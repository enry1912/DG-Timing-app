const CACHE_NAME = 'dg-timing-v39';
const ASSETS = ['./', './index.html', './privacy.html', './styles.css', './app.js', './js/profileStore.js', './js/audioEngine.js', './js/csv.js', './manifest.webmanifest', './icons/icon.svg', './videos/2025%20USDGC%20%20MPO%20FINALF9%20%20Barela%20H3.mp4', './assets/disc-golf-background.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => clients.claim())));
self.addEventListener('fetch', event => event.respondWith(fetch(event.request).then(response => {
  if (event.request.method === 'GET' && response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
  return response;
}).catch(() => caches.match(event.request))));
