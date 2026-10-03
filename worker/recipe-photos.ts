import type {Recipe} from '../src/domain';
import {photoHash,photoOwner,photoReference} from '../src/photo-ref';

export type PhotoBindings={RECIPE_PHOTOS?:R2Bucket};
export class PhotoStorageFailure extends Error {
  constructor(public code:'photo_reference_invalid'|'photo_storage_unavailable'|'photo_storage_unconfigured'){
    super(code==='photo_reference_invalid'?'写真を確認してください。':'写真の保存先に接続できませんでした。端末の写真は保持されています。');
  }
}
export async function storeRecipePhotos(bucket:R2Bucket|undefined,userId:string,recipe:Recipe,previous?:Recipe):Promise<Recipe>{
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
      if(!existing.has(photo)&&!await bucket.head(reference.key))throw new PhotoStorageFailure('photo_reference_invalid');
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
