const CACHE='spese-iphone-v19';
const ASSETS=['./','./index.html','./manifest.webmanifest','./styles.css','./v3.css','./v4.css','./v4.js','./v5.css','./v5.js','./v6.css','./v6.js','./v7.css','./v7.js','./v7-account-fix.js','./v8-account-summary.js','./v9-budget-summary.css','./v9-budget-summary.js','./v10-category-budget-total.js','./v11-edit-recurring.js','./v12-month-end-recurring.js','./v13-widget.css','./v13-widget.js','./v14-balances.css','./v14-balances.js','./v15-ledger.css','./v15-ledger.js','./v16-minimal.css','./spese-semplici-widget.js','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request))));

