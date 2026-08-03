const CACHE='spese-iphone-v6';
const ASSETS=['./','./index.html','./manifest.webmanifest','./styles.css','./v3.css','./v4.css','./v4.js','./v5.css','./v5.js','./v6.css','./v6.js','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request))));
