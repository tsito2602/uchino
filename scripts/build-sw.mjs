import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const assets=await readdir('dist/assets');
const photos=(await readdir('dist/recipe-photos')).map(v=>`/recipe-photos/${v}`);
const hash=createHash('sha256').update(await readFile('dist/index.html'));
for(const photo of photos)hash.update(await readFile(`dist${photo}`));
const version=hash.digest('hex').slice(0,12);
const urls=['/','/index.html','/icon.svg','/logo.svg','/apple-touch-icon-v3.png','/icon-v3-192.png','/icon-v3-512.png','/manifest.webmanifest',...assets.map(v=>`/assets/${v}`),...photos];
await writeFile('dist/sw.js',`const CACHE='uchino-${version}';const FILES=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('uchino-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match('/index.html'))));return;}
 if(FILES.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
});`);
