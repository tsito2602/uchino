import {MAX_PHOTO_BYTES,type Recipe} from './domain';
import {photoHash,photoReference} from './photo-ref';

let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('uchino-photos',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('photos',{keyPath:'url'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>{database=undefined;reject(new Error('写真を端末に保存できませんでした。空き容量を確認してください。'));};
});}
async function cached(url:string):Promise<Blob|undefined>{
  const database=await db();return new Promise((resolve,reject)=>{
    const request=database.transaction('photos').objectStore('photos').get(url);
    request.onsuccess=()=>resolve(request.result?.blob);request.onerror=()=>reject(request.error);
  });
}
async function writePhotos(photos:{url:string;blob:Blob}[]){
  if(!photos.length)return;
  const database=await db();return new Promise<void>((resolve,reject)=>{
    const tx=database.transaction('photos','readwrite');
    tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(new Error('写真を端末に保存できませんでした。空き容量を確認してください。'));
    for(const photo of photos)tx.objectStore('photos').put(photo);
  });
}
const values=(recipe:Recipe)=>[recipe.photo||'',...(recipe.stepPhotos||[])];
export const hasEmbeddedPhotos=(recipe:Recipe)=>values(recipe).some(photo=>photo.startsWith('data:image/jpeg;base64,'));

// Keep the original bytes locally BEFORE replacing the record's inline photos.
// A failed IDB write leaves that record pending, so a retry cannot lose a photo.
export async function cacheUploadedPhotos(before:Recipe,after:Recipe){
  const old=values(before),photos:{url:string;blob:Blob}[]=[];
  for(const [index,url] of values(after).entries()){
    const reference=photoReference(url),source=old[index];
    if(!reference||!source?.startsWith('data:image/jpeg;base64,'))continue;
    const bytes=Uint8Array.from(atob(source.slice(23)),char=>char.charCodeAt(0));
    if(await photoHash(bytes)!==reference.hash)throw new Error('保存した写真を確認できませんでした。端末の写真は保持されています。');
    photos.push({url,blob:new Blob([bytes],{type:'image/jpeg'})});
  }
  await writePhotos(photos);
}
const loading=new Map<string,Promise<Blob>>();
export function loadRecipePhoto(url:string):Promise<Blob>{
  const existing=loading.get(url);if(existing)return existing;
  const task=(async()=>{
    const reference=photoReference(url);if(!reference)throw new Error('写真の参照先を確認してください。');
    const saved=await cached(url);if(saved)return saved;
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='image/jpeg'||Number(response.headers.get('content-length'))>MAX_PHOTO_BYTES){await response.body?.cancel();throw new Error('写真を取得できませんでした。');}
    const blob=await response.blob();if(blob.size>MAX_PHOTO_BYTES)throw new Error('写真が大きすぎます。');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    if(bytes.length<5||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217||await photoHash(bytes)!==reference.hash)throw new Error('写真を確認できませんでした。');
    await writePhotos([{url,blob}]);return blob;
  })().finally(()=>loading.delete(url));loading.set(url,task);return task;
}
export async function cacheRemotePhotos(recipes:Recipe[]){
  const urls=[...new Set(recipes.flatMap(values).filter(url=>photoReference(url)))];let next=0,failed=false;
  await Promise.all(Array.from({length:Math.min(4,urls.length)},async()=>{while(next<urls.length){try{await loadRecipePhoto(urls[next++]);}catch{failed=true;}}}));
  if(failed)throw new Error('一部の写真を端末に保存できませんでした。通信と空き容量を確認して「今すぐ同期」をお試しください。');
}
