import test from 'node:test';
import assert from 'node:assert/strict';
import {r2Backend} from './r2-fixture.mjs';
import {photoFixture} from './photo-fixture.mjs';
import {newRecipe} from '../src/domain.ts';
const recipe=(id='legacy')=>({...newRecipe(),id,title:'家族のレシピ',photo:photoFixture(6000),ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['焼く']});
const post=(body={})=>({method:'POST',body:JSON.stringify(body)});
const send=(data,revision=0,editId=crypto.randomUUID())=>({method:'PUT',body:JSON.stringify({data,revision,editId,deleted:false})});
async function setup(){
 const b=await r2Backend();
 const home=async(user='user-a')=>(await (await b.request('/api/spaces',{},user)).json()).spaces.find(s=>s.is_home&&s.owner_id===user);
 const invite=async space=>(await (await b.request(`/api/spaces/${space.id}/invites`,post())).json());
 const join=async(space,code)=>b.request('/api/spaces/join',post({space_id:space.id,code}),'user-b');
 return {...b,home,invite,join};
}
test('home spaces inherit cloud rows and photo URLs; both members edit, outsiders cannot',async()=>{
 const b=await setup();try{
  b.seed(recipe());const a=await b.home(),other=await b.home('user-b');
  assert.equal(a.name,'うちのレシピ');assert.equal(a.member_count,1);assert.notEqual(a.id,other.id);
  assert.equal((await b.request(`/api/data?space=${a.id}`,{},'user-b')).status,403);
  const original=b.record('legacy');assert.equal(original.revision,1);
  const migrated=await (await b.put(original.data,1)).json();const photo=migrated.data.photo;
  assert.match(photo,/^\/api\/photos\//);assert.equal((await b.request(photo,{},'user-b')).status,404);
  const invitation=await b.invite(a);assert.match(invitation.code,/^[A-Z2-9]{4}(-[A-Z2-9]{4}){2}$/);
  assert.ok(Math.abs(invitation.expires_at-Date.now()-172800000)<10000);
  assert.equal((await b.request('/api/spaces/join',post({space_id:other.id,code:invitation.code}),'user-b')).status,400);
  assert.equal((await b.join(a,invitation.code.toLowerCase().replaceAll('-',' '))).status,200);
  assert.equal((await b.home()).member_count,2);
  const rows=await (await b.request(`/api/data?space=${a.id}`,{},'user-b')).json();assert.equal(rows.records[0].data.photo,photo);
  assert.equal((await b.request(photo,{},'user-b')).status,200);
  const modified={...migrated.data,title:'一緒に編集'};
  assert.equal((await b.request(`/api/data/recipe/legacy?space=${a.id}`,send(modified,2),'user-b')).status,200);
  assert.equal(b.record('legacy').data.title,'一緒に編集');
  assert.equal((await b.request(`/api/data/recipe/legacy?space=${a.id}`,send({...modified,title:'古い編集'},2))).status,409);
  assert.equal((await b.request(`/api/data/recipe/other?space=${other.id}`,send({...modified,id:'other'}),'user-b')).status,400,'cannot reference another space photo even as a member');
  assert.equal((await b.request(`/api/spaces/${a.id}/invites`,post(),'user-b')).status,403);
  assert.equal((await b.request(`/api/spaces/${a.id}/name`,{method:'PUT',body:JSON.stringify({name:'変更'})},'user-b')).status,403);
  assert.equal((await b.request(`/api/data?space=${a.id}`,{headers:{'X-Uchino-User':'user-b'}})).status,401);
  const unused=await b.invite(a);
  assert.equal((await b.request(`/api/spaces/${a.id}/members/user-b`,{method:'DELETE',body:'{}'})).status,200);
  assert.equal((await b.request(`/api/data?space=${a.id}`,{},'user-b')).status,403);
  assert.equal((await b.request(photo,{},'user-b')).status,404);
  assert.equal((await b.join(a,invitation.code)).status,404);assert.equal((await b.join(a,unused.code)).status,404);
 }finally{b.database.close();}
});
test('expiry, per-user attempt throttle, deleted spaces, and transaction rollback',async()=>{
 const b=await setup();try{
  const space=(await (await b.request('/api/spaces',post({name:'別のレシピ'}))).json()).space;
  const invite=await b.invite(space);b.database.prepare('UPDATE recipe_space_invites SET expires_at=0').run();
  assert.equal((await b.join(space,invite.code)).status,404);
  const fresh=await b.invite(space);assert.equal((await b.join(space,fresh.code)).status,200);
  assert.equal((await b.request(`/api/spaces/${space.id}/space`,{method:'DELETE',body:'{}'})).status,200);
  assert.equal((await b.request(`/api/data?space=${space.id}`,{},'user-b')).status,403);
  assert.equal((await b.request(`/api/spaces/${space.id}/details`)).status,404);
  for(let i=0;i<21;i++)await b.request('/api/spaces/invite-preview',post({code:'invalid'}),'user-b');
  assert.equal((await b.request('/api/spaces/invite-preview',post({code:'invalid'}),'user-b')).status,429);
  assert.equal((await b.request('/api/spaces',post({name:'x'.repeat(5000)}))).status,400);
 }finally{b.database.close();}
});
test('revocation while R2 is saving prevents the data mutation',async()=>{
 const b=await setup();try{
  const space=await b.home(),invite=await b.invite(space);await b.join(space,invite.code);
  const put=b.bucket.put;
  b.bucket.put=async(...args)=>{b.database.prepare('UPDATE recipe_space_members SET active=0 WHERE space_id=? AND user_id=?').run(space.id,'user-b');return put(...args);};
  assert.equal((await b.request(`/api/data/recipe/during-upload?space=${space.id}`,send(recipe('during-upload')),'user-b')).status,409);
  assert.equal(b.record('during-upload'),null);
 }finally{b.database.close();}
});
