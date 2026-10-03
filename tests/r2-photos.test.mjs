import test from 'node:test';
import assert from 'node:assert/strict';
import {newRecipe,validRecipePhoto} from '../src/domain.ts';
import {photoFixture} from './photo-fixture.mjs';
import {r2Backend} from './r2-fixture.mjs';
const recipe=()=>({...newRecipe(),title:'R2 recipe',ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['切る','焼く','盛る'],photo:photoFixture(12000),stepPhotos:[photoFixture(12000),'',photoFixture(8000)]});

test('cloud records store only immutable R2 references, with deduplication and retry idempotence',async()=>{
 const backend=await r2Backend();try{
  const original=recipe(),response=await backend.put(original,0,'first');assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.revision,1);assert.ok(validRecipePhoto(result.data.photo));assert.match(result.data.photo,/^\/api\/photos\/[a-f0-9]{64}\/[a-f0-9]{64}\.jpg$/);
  assert.equal(result.data.stepPhotos[0],result.data.photo);assert.equal(result.data.stepPhotos[1],'');assert.equal(backend.objects.size,2);assert.equal(backend.calls.put,2);
  assert.ok(!JSON.stringify(backend.record(original.id).data).includes('base64'));assert.deepEqual(result.data.ingredients,original.ingredients);assert.deepEqual(result.data.steps,original.steps);
  const retry=await (await backend.put(original,0,'first')).json();assert.deepEqual(retry,result);assert.equal(backend.calls.put,2);
  const image=await backend.request(result.data.photo);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');assert.equal(image.headers.get('cache-control'),'no-store');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(original.photo.split(',')[1],'base64'));
  const list=await (await backend.request('/api/data')).json();assert.equal(list.photoStorage,'r2');assert.equal(list.records[0].data.photo,result.data.photo);
  assert.equal((await backend.put({...result.data,favorite:true},1,'favorite')).status,200);assert.equal(backend.calls.put,2,'Metadata edits never reupload photos');
 }finally{backend.database.close();}
});

test('R2 photos and references are private to the authenticated account',async()=>{
 const backend=await r2Backend();try{
  const {data}=await (await backend.put(recipe())).json();
  assert.equal((await backend.request(data.photo,{},null)).status,401);assert.equal((await backend.request(data.photo,{},'user-b')).status,404);
  assert.equal((await backend.put({...data,id:'other-user'},0,'steal','user-b')).status,400);
  const missing=data.photo.replace(/[a-f0-9]{64}\.jpg$/,'0'.repeat(64)+'.jpg');
  assert.equal((await backend.put({...data,id:'missing-image',photo:missing})).status,400);
  for(const photo of [data.photo+'?other=1',data.photo.replace('/api/','https://evil.test/api/'),data.photo.replace('.jpg','.svg'),data.photo.replace('/api/photos/','/api/photos/../')])assert.equal(validRecipePhoto(photo),false);
  const forbidden=await backend.put({...data,id:'cross-origin'},0,'bad','user-a');assert.equal(forbidden.status,200);
  assert.equal((await backend.request('/api/data/recipe/new',{method:'PUT',headers:{Origin:'https://evil.test'},body:'{}'})).status,403);
 }finally{backend.database.close();}
});

test('failed migration keeps the full original record and retries resume without data loss',async()=>{
 const backend=await r2Backend();try{
  const original=recipe();backend.seed(original);backend.setFailWrites(true);
  const failure=await backend.put(original,1,'migrate');assert.equal(failure.status,503);assert.equal((await failure.json()).code,'photo_storage_unavailable');assert.deepEqual(backend.record(original.id).data,original);assert.equal(backend.record(original.id).revision,1);
  backend.setFailWrites(false);const migrated=await (await backend.put(original,1,'migrate')).json();assert.equal(migrated.revision,2);assert.ok(!JSON.stringify(backend.record(original.id).data).includes('base64'));
  const removed=await backend.put({...migrated.data,photo:'',stepPhotos:['','','']},2,'remove');assert.equal(removed.status,200);assert.equal(backend.record(original.id).data.photo,'');
 }finally{backend.database.close();}
});

test('a stale migration does not overwrite other-device edits or start unnecessary R2 writes',async()=>{
 const backend=await r2Backend();try{
  const original=recipe();backend.seed({...original,title:'Edited on another device'},2);
  const result=await backend.put(original,1,'stale-migrate');assert.equal(result.status,409);assert.equal(backend.calls.put,0);assert.equal(backend.record(original.id).data.title,'Edited on another device');
 }finally{backend.database.close();}
});
