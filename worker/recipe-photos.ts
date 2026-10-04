import type {Recipe} from '../src/domain';
import {photoHash,photoOwner,photoReference} from '../src/photo-ref';

// LEGACY_RECIPE_PHOTOS is the previous environment's bucket (production reads
// staging's photos after the data move). A photo missing here is copied over on
// first use, so the old bucket can be unbound once everything has been opened.
export type PhotoBindings={RECIPE_PHOTOS?:R2Bucket;LEGACY_RECIPE_PHOTOS?:R2Bucket};
export async function adoptLegacyPhoto(bucket:R2Bucket,legacy:R2Bucket|undefined,key:string):Promise<boolean>{
  if(!legacy)return false;
  const old=await legacy.get(key);if(!old)return false;
  return !!await bucket.put(key,await old.arrayBuffer(),{httpMetadata:{contentType:'image/jpeg'}});
}
export class PhotoStorageFailure extends Error {
  constructor(public code:'photo_reference_invalid'|'photo_storage_unavailable'|'photo_storage_unconfigured'){
    super(code==='photo_reference_invalid'?'写真を確認してください。':'写真の保存先に接続できませんでした。端末の写真は保持されています。');
  }
}
export async function storeRecipePhotos(bucket:R2Bucket|undefined,userId:string,recipe:Recipe,previous?:Recipe,legacy?:R2Bucket):Promise<Recipe>{
  const photos=[recipe.photo,...(recipe.stepPhotos||[])];
  if(!bucket){
    if(photos.some(photo=>photoReference(photo)))throw new PhotoStorageFailure('photo_storage_unconfigured');
    return recipe; // Compatibility for local development / a pre-R2 deployment.
  }
  const owner=await photoOwner(userId),existing=new Set([previous?.photo,...(previous?.stepPhotos||[])]);
  const results=new Map<string,string>(),queue=[...new Set(photos.filter((photo):photo is string=>!!photo))];
  let next=0;
  const save=async(photo:string)=>{
    const reference=photoReference(photo);
    if(reference){
      if(reference.owner!==owner)throw new PhotoStorageFailure('photo_reference_invalid');
      if(!existing.has(photo)&&!await bucket.head(reference.key)&&!await adoptLegacyPhoto(bucket,legacy,reference.key))throw new PhotoStorageFailure('photo_reference_invalid');
      results.set(photo,photo);return;
    }
    if(!photo.startsWith('data:image/jpeg;base64,')){results.set(photo,photo);return;}
    const bytes=Uint8Array.from(atob(photo.slice(23)),char=>char.charCodeAt(0)),hash=await photoHash(bytes),key=`${owner}/${hash}.jpg`;
    if(!await bucket.head(key)){
      const saved=await bucket.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
      if(!saved)throw new PhotoStorageFailure('photo_storage_unavailable');
    }
    results.set(photo,`/api/photos/${key}`);
  };
  try{
    // Stay below the Worker's simultaneous connection limit, even for 100 steps.
    await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(next<queue.length)await save(queue[next++]);}));
  }catch(error){throw error instanceof PhotoStorageFailure?error:new PhotoStorageFailure('photo_storage_unavailable');}
  return {...recipe,...(recipe.photo!==undefined?{photo:results.get(recipe.photo)??recipe.photo}:{}),...(recipe.stepPhotos?{stepPhotos:recipe.stepPhotos.map(photo=>results.get(photo)??photo)}:{})};
}
