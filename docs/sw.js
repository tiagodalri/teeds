const CACHE='teeds-a9194ad5f0b6';
const SHELL=["./","./index.html","./manifest.webmanifest","./pwa-teeds/icon-192.png","./pwa-teeds/icon-512.png","./assets/MonitoramentoPanel.js?v=a9194ad5f0b6","./assets/teeds.css?v=a9194ad5f0b6","./assets/teeds.js?v=a9194ad5f0b6"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request;const u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin||r.cache==='no-store'||u.searchParams.has('vivo'))return;
if(r.mode==='navigate'){const raiz=u.pathname===new URL('./',self.location).pathname;e.respondWith(fetch(r).then(x=>{if(x.ok&&raiz)caches.open(CACHE).then(c=>c.put('./index.html',x.clone()));return x}).catch(()=>caches.match('./index.html')));return}
if(/\/assets\/.+\.(?:js|css)$/.test(u.pathname)&&u.searchParams.has('v')){e.respondWith(caches.match(r).then(h=>h||fetch(r).then(x=>{if(x.ok)caches.open(CACHE).then(c=>c.put(r,x.clone()));return x})));return}
if(r.destination==='image'||r.destination==='font'){e.respondWith(caches.match(r).then(h=>{const n=fetch(r).then(x=>{if(x.ok)caches.open(CACHE).then(c=>c.put(r,x.clone()));return x}).catch(()=>h);return h||n}));return}
e.respondWith(fetch(r).then(x=>{if(x.ok&&!/\.json$/.test(u.pathname))caches.open(CACHE).then(c=>c.put(r,x.clone()));return x}).catch(()=>caches.match(r)))});
