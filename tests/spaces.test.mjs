import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {r2Backend} from './r2-fixture.mjs';
import {newRecipe} from '../src/domain.ts';
import {photoFixture} from './photo-fixture.mjs';
const recipe=()=>({...newRecipe(),title:'共有するレシピ',ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['切る','焼く'],photo:photoFixture(3000),stepPhotos:['',photoFixture(2000)]});
async function call(b,path,user='user-a',method='GET',data){return b.request(path,{method,...(data?{body:JSON.stringify(data)}:{})},user);}
async function home(b,user='user-a'){const response=await call(b,'/api/spaces',user);assert.equal(response.status,200);return (await response.json()).spaces.find(s=>s.owner_id===user&&s.is_home);}
async function issue(b,id){const response=await call(b,`/api/spaces/${id}/invites`,'user-a','POST',{});assert.equal(response.status,201);return response.json();}
async function join(b,id,code,user='user-b'){return call(b,'/api/spaces/join',user,'POST',{code,space_id:id});}
const put=(b,space,data,user='user-a',revision=0,kind='recipe')=>call(b,`/api/data/${kind}/${data.id}?space=${space}`,user,'PUT',{data,revision,deleted:false,editId:crypto.randomUUID()});

test('legacy data and R2 paths become an invit-able home without copies or revision reset',async()=>{
 const b=await r2Backend();try{
  const saved=await b.put(recipe());const canonical=(await saved.json()).data,first=b.record(canonical.id),count=b.objects.size;
  const space=await home(b);assert.equal(space.name,'うちのレシピ');assert.equal(space.member_count,1);
  assert.equal(b.record(canonical.id).revision,first.revision);assert.equal(b.objects.size,count);
  const explicit=await (await call(b,`/api/data?space=${space.id}`)).json();assert.deepEqual(explicit.records[0].data,canonical);
  assert.equal((await call(b,canonical.photo,'user-b')).status,404);
  assert.equal((await call(b,`/api/data?space=${space.id}`,'user-b')).status,403);
  const invite=await issue(b,space.id);assert.match(invite.code,/^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/);
  assert.ok(invite.expires_at>Date.now()+47*3600*1000);
  const stored=b.database.prepare('SELECT * FROM recipe_space_invites').get();assert.equal(stored.code_hash.length,64);assert.ok(!JSON.stringify(stored).includes(invite.code));
  const preview=await call(b,'/api/spaces/invite-preview','user-b','POST',{code:invite.code.toLowerCase().replaceAll('-',' ')});assert.equal(preview.status,200);assert.equal((await preview.json()).name,'うちのレシピ');
  assert.equal((await join(b,'wrong-space',invite.code)).status,400);
  assert.equal((await join(b,space.id,invite.code)).status,200);
  assert.equal((await join(b,space.id,invite.code)).status,200,'Same user may retry safely');
  assert.equal((await join(b,space.id,invite.code,'user-c')).status,404,'An invite can only admit one person');
  assert.equal((await home(b)).member_count,2);
  const photo=await call(b,canonical.photo,'user-b');assert.equal(photo.status,200);assert.equal(photo.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await photo.arrayBuffer()),Buffer.from(canonical.photo.startsWith('data:')?'':recipe().photo.slice(23),'base64'));
  const records=(await (await call(b,`/api/data?space=${space.id}`,'user-b')).json()).records;assert.deepEqual(records[0].data,canonical);
  const edit={...canonical,title:'メンバーの編集'};assert.equal((await put(b,space.id,edit,'user-b',1)).status,200);assert.equal(b.record(edit.id).data.title,edit.title);assert.equal(b.objects.size,count);
  assert.equal((await put(b,space.id,{...canonical,title:'古い編集'},'user-a',1)).status,409);
  const shopping={id:'shopping-shared',name:'卵',quantity:'1パック',done:false,createdAt:new Date().toISOString()};assert.equal((await put(b,space.id,shopping,'user-b',0,'shopping')).status,200);
  const ownB=(await (await call(b,'/api/data','user-b')).json()).records;assert.equal(ownB.length,0,'Joining does not replace or mix the recipient home');
  assert.equal((await call(b,`/api/spaces/${space.id}/invites`,'user-b','POST',{})).status,403);
  assert.equal((await call(b,`/api/spaces/${space.id}/name`,'user-b','PUT',{name:'変更'})).status,403);
  const unspent=await issue(b,space.id);
  assert.equal((await call(b,`/api/spaces/${space.id}/members/user-b`,'user-a','DELETE',{})).status,200);
  assert.equal((await call(b,canonical.photo,'user-b')).status,404);
  assert.equal((await call(b,`/api/data?space=${space.id}`,'user-b')).status,403);
  assert.equal((await put(b,space.id,edit,'user-b',2)).status,403);
  assert.equal((await join(b,space.id,invite.code)).status,404);assert.equal((await join(b,space.id,unspent.code,'user-c')).status,404);
  assert.equal((await call(b,`/api/spaces/${space.id}/space`,'user-a','DELETE',{})).status,403,'Home cannot be deleted');
 }finally{b.database.close();}
});

test('multiple spaces isolate photos and data, three members can join, leave and delete revoke access',async()=>{
 const b=await r2Backend();try{
  const own=await home(b);const a=await (await b.put(recipe())).json();
  const response=await call(b,'/api/spaces','user-a','POST',{name:'週末のレシピ'});assert.equal(response.status,201);const space=(await response.json()).space;
  assert.equal((await put(b,space.id,{...a.data,id:'cross-space'})).status,400,'Cannot attach another space photo by URL, even as its owner');
  const created=await put(b,space.id,recipe());assert.equal(created.status,200);const photo=(await created.json()).data.photo;assert.notEqual(photo,a.data.photo);
  for(const user of ['user-b','user-c']){const invite=await issue(b,space.id);assert.equal((await join(b,space.id,invite.code,user)).status,200);assert.equal((await call(b,photo,user)).status,200);}
  const listed=(await (await call(b,'/api/spaces')).json()).spaces;assert.equal(listed.find(s=>s.id===space.id).member_count,3);assert.equal(listed.find(s=>s.id===own.id).member_count,1);
  assert.equal((await call(b,`/api/spaces/${space.id}/members/user-c`,'user-b','DELETE',{})).status,403);
  assert.equal((await call(b,`/api/spaces/${space.id}/members/user-b`,'user-b','DELETE',{})).status,200);
  assert.equal((await call(b,photo,'user-b')).status,404);
  assert.equal((await call(b,`/api/spaces/${space.id}/space`,'user-a','DELETE',{})).status,200);
  assert.equal((await call(b,photo,'user-c')).status,404);assert.equal((await call(b,`/api/data?space=${space.id}`)).status,403);
  assert.ok(!(await (await call(b,'/api/spaces')).json()).spaces.some(s=>s.id===space.id));
  assert.equal(b.objects.size,4,'Logical deletion does not destroy shared/offline image bytes');
 }finally{b.database.close();}
});

test('invite expiry, racing consumers, throttling, CSRF and account mismatch are enforced',async()=>{
 const b=await r2Backend();try{
  const space=await home(b),expired=await issue(b,space.id);b.database.prepare('UPDATE recipe_space_invites SET expires_at=0').run();
  assert.equal((await join(b,space.id,expired.code)).status,404);
  const invite=await issue(b,space.id);const results=await Promise.all(['user-b','user-c'].map(user=>join(b,space.id,invite.code,user)));
  assert.equal(results.filter(r=>r.status===200).length,1);assert.equal((await home(b)).member_count,2);
  assert.equal((await b.request('/api/spaces',{headers:{'X-Uchino-User':'user-b'}})).status,401);
  assert.equal((await b.request('/api/data',{headers:{'X-Uchino-User':'user-b'}})).status,401);
  assert.equal((await b.request(`/api/spaces/${space.id}/invites`,{method:'POST',headers:{Origin:'https://bad.test'},body:'{}'})).status,403);
  let last;for(let i=0;i<21;i++)last=await call(b,'/api/spaces/invite-preview','user-b','POST',{code:'invalid'});assert.equal(last.status,429);
  assert.equal((await call(b,'/api/spaces',null)).status,401);
 }finally{b.database.close();}
});

test('membership revoked during R2 upload cannot commit a recipe, migrations preserve revisions',async()=>{
 const b=await r2Backend();try{
  const space=await home(b),invite=await issue(b,space.id);await join(b,space.id,invite.code);
  const originalPut=b.bucket.put;b.bucket.put=async(...args)=>{const result=await originalPut(...args);b.database.prepare('UPDATE recipe_space_members SET active=0 WHERE space_id=? AND user_id=?').run(space.id,'user-b');return result;};
  const data=recipe();assert.equal((await put(b,space.id,data,'user-b')).status,409);assert.equal(b.record(data.id),null);
  b.database.exec(await readFile('migrations/0002_spaces.sql','utf8'));assert.equal((await home(b)).id,space.id);
 }finally{b.database.close();}
});
