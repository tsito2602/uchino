import test from 'node:test';
import assert from 'node:assert/strict';
import {r2Backend} from './r2-fixture.mjs';
import {newRecipe} from '../src/domain.ts';
import {photoFixture} from './photo-fixture.mjs';
const post=data=>({method:'POST',body:JSON.stringify(data)});
const list=async(b,user='user-a')=>(await (await b.request('/api/spaces',{},user)).json()).spaces;
const create=async(b,user='user-a',name='ふたりのレシピ')=>b.request('/api/spaces',post({name,initial:true}),user);

test('listing, previewing, data access and photo access never create a new account book',async()=>{
 const b=await r2Backend({createBooks:false});try{
  for(let i=0;i<3;i++)assert.deepEqual(await list(b),[]);
  assert.equal((await b.request('/api/spaces/invite-preview',post({code:'invalid'}))).status,400);
  const data=await b.request('/api/data');assert.equal(data.status,409);assert.equal((await data.json()).code,'recipebook_required');
  assert.equal((await b.request('/api/data/recipe/test',{method:'PUT',body:'{}'})).status,409);
  assert.equal((await b.request(`/api/photos/${'a'.repeat(64)}/${'b'.repeat(64)}.jpg`)).status,404);
  assert.equal((await create(b,'user-a',' ')).status,400);
  assert.deepEqual(await list(b),[]);
  assert.equal(b.database.prepare('SELECT count(*) n FROM recipe_spaces').get().n,0);
  assert.equal(b.database.prepare('SELECT count(*) n FROM recipe_space_members').get().n,0);
 }finally{b.database.close();}
});
test('explicit initial creation is retryable, retains the entered name and supports legacy local sync',async()=>{
 const b=await r2Backend({createBooks:false});try{
  const first=await create(b);assert.equal(first.status,201);const space=(await first.json()).space;
  assert.equal(space.name,'ふたりのレシピ');assert.equal(space.is_home,true);
  const retry=await create(b);assert.equal(retry.status,200);assert.equal((await retry.json()).space.id,space.id);
  assert.equal((await list(b)).length,1);
  const recipe={...newRecipe(),id:'local-before-books',title:'端末のレシピ',ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['焼く'],photo:photoFixture(5000)};
  assert.equal((await b.put(recipe)).status,200);assert.equal(b.record(recipe.id).revision,1);
  assert.equal((await list(b))[0].id,space.id);assert.equal(b.objects.size,1);
 }finally{b.database.close();}
});
test('invite-only member has only the invited book, and leaving or removal returns to no books',async()=>{
 const b=await r2Backend({createBooks:false});try{
  const space=(await (await create(b)).json()).space;
  const issue=async()=>(await (await b.request(`/api/spaces/${space.id}/invites`,post({}))).json()).code;
  const code=await issue();
  const preview=await b.request('/api/spaces/invite-preview',post({code}),'user-b');assert.equal(preview.status,200);assert.deepEqual(await list(b,'user-b'),[]);
  assert.equal((await b.request(`/api/data?space=${space.id}`,{},'user-b')).status,403);
  assert.equal((await b.request('/api/spaces/join',post({code,space_id:space.id}),'user-b')).status,200);
  assert.deepEqual((await list(b,'user-b')).map(s=>s.id),[space.id]);
  assert.equal(b.database.prepare('SELECT count(*) n FROM recipe_spaces WHERE owner_id=?').get('user-b').n,0);
  assert.equal((await b.request(`/api/data?space=${space.id}`,{},'user-b')).status,200);
  // A legacy client's unscoped write must never be routed into the invited book.
  assert.equal((await b.request('/api/data',{},'user-b')).status,409);
  assert.equal((await b.request(`/api/spaces/${space.id}/members/user-b`,{method:'DELETE',body:'{}'},'user-b')).status,200);
  assert.deepEqual(await list(b,'user-b'),[]);
  const second=await issue();await b.request('/api/spaces/join',post({code:second,space_id:space.id}),'user-b');
  await b.request(`/api/spaces/${space.id}/members/user-b`,{method:'DELETE',body:'{}'});
  assert.deepEqual(await list(b,'user-b'),[]);assert.equal((await create(b,'user-b','新しいレシピ帳')).status,201);
 }finally{b.database.close();}
});
test('legacy cloud data migrate once without changing recipe revisions or inline photos',async()=>{
 const b=await r2Backend({createBooks:false});try{
  const recipe={...newRecipe(),id:'legacy-book',title:'既存レシピ',ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['焼く'],photo:photoFixture(5000)};
  b.seed(recipe,7);const space=(await list(b))[0];assert.equal(space.name,'うちのレシピ');assert.equal((await list(b)).length,1);
  assert.deepEqual(b.record(recipe.id).data,recipe);assert.equal(b.record(recipe.id).revision,7);
  assert.equal(b.objects.size,0);assert.equal((await b.request('/api/data')).status,200);
  assert.deepEqual(await list(b,'user-b'),[]);
 }finally{b.database.close();}
});
