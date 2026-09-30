import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {SignJWT} from 'jose';
import app from '../dist/worker.mjs';
import {newRecipe} from '../src/domain.ts';
const env={APP_ENV:'staging',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',SESSION_SECRET:'test-key-more-than-thirty-two-characters',ALLOWED_EMAILS:'a@example.test,b@example.test'};
async function cookie(id='user-a',email='a@example.test'){
 const value=await new SignJWT({sub:id,email,name:id,purpose:'session'}).setProtectedHeader({alg:'HS256'}).setIssuer('uchino').setAudience('https://example.test').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(env.SESSION_SECRET));
 return `__Host-uchino_session=${value}`;
}
const database=new DatabaseSync(':memory:');database.exec(await readFile('migrations/0001_init.sql','utf8'));
const DB={prepare(sql){let values=[];const stmt={bind(...args){values=args;return stmt;},async first(){return database.prepare(sql).get(...values)??null;},async all(){return {results:database.prepare(sql).all(...values)};},async run(){return database.prepare(sql).run(...values);}};return stmt;}};
const auth=await cookie();
function request(path,options={},bindings={...env,DB}){return app.fetch(new Request(`https://example.test${path}`,options),bindings);}
const recipe={...newRecipe(),title:'Test recipe',ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['焼く']};
const put=(data,revision,editId,extra={})=>request(`/api/data/recipe/${data.id}`,{method:'PUT',headers:{Origin:'https://example.test','Content-Type':'application/json',Cookie:auth,...extra},body:JSON.stringify({data,revision,deleted:false,editId})});
test('public app loads while unauthenticated data is protected',async()=>{
 assert.equal((await request('/')).status,200);assert.equal((await request('/api/health')).status,200);assert.equal((await request('/api/data')).status,401);assert.equal((await request('/api/data/recipe/id',{method:'PUT',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:'{}'})).status,401);
 const session=await (await request('/api/auth/session',{},{})).json();assert.equal(session.configured,false);assert.equal(session.user,null);
});
test('same-origin protection, tenant isolation, revisions and retry idempotence',async()=>{
 assert.equal((await put(recipe,0,'edit-one',{Origin:'https://evil.example'})).status,403);
 let result=await put(recipe,0,'edit-one');assert.equal(result.status,200);assert.equal((await result.json()).revision,1);
 result=await put(recipe,0,'edit-one');assert.equal(result.status,200);assert.equal((await result.json()).revision,1);
 assert.equal((await put({...recipe,title:'stale'},0,'edit-stale')).status,409);
 result=await put({...recipe,title:'Updated'},1,'edit-two');assert.equal(result.status,200);assert.equal((await result.json()).revision,2);
 const mine=await (await request('/api/data',{headers:{Cookie:auth}})).json();assert.equal(mine.records[0].data.title,'Updated');
 const theirs=await (await request('/api/data',{headers:{Cookie:await cookie('user-b','b@example.test')}})).json();assert.equal(theirs.records.length,0);
 assert.equal((await put({...recipe,sourceUrl:'javascript:alert(1)'},2,'edit-three')).status,400);
});
test('unconfigured import fails clearly and all API responses are non-cacheable',async()=>{
 const response=await request('/api/import',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Cookie:auth},body:JSON.stringify({text:'レシピ'})});assert.equal(response.status,422);assert.match((await response.json()).error,/準備中/);assert.equal(response.headers.get('cache-control'),'no-store');
});
