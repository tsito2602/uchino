import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {SignJWT} from 'jose';
import app from '../dist/worker.mjs';
import {newRecipe} from '../src/domain.ts';
import {photoFixture} from './photo-fixture.mjs';
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
test('malformed import bodies are rejected before extraction',async()=>{
 for(const input of [null,[],{url:4},{url:''},{url:'https://www.kurashiru.com/',text:'mixed source'}]){
  const response=await request('/api/import',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Cookie:auth},body:JSON.stringify(input)});
  assert.equal(response.status,400);assert.equal(response.headers.get('cache-control'),'no-store');
 }
 const config=await (await request('/api/config',{}, {...env,AI:{run(){}},AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:' '})).json();assert.equal(config.ai,false);
});
test('photo records sync, remain private, reject oversized images and allow removal',async()=>{
 const data={...recipe,id:'photo-recipe',photo:photoFixture(120000)};
 assert.equal((await put(data,0,'photo-create')).status,200,'A photo larger than the old 100KB request limit saves');
 const mine=await (await request('/api/data',{headers:{Cookie:auth}})).json();
 assert.equal(mine.records.find(row=>row.id===data.id).data.photo,data.photo);
 const theirs=await (await request('/api/data',{headers:{Cookie:await cookie('user-b','b@example.test')}})).json();
 assert.ok(!theirs.records.some(row=>row.id===data.id));
 assert.equal((await put({...data,photo:photoFixture(260000)},1,'photo-too-large')).status,400);
 assert.equal((await put({...data,photo:'data:image/svg+xml;base64,PHN2Zz4='},1,'photo-svg')).status,400);
 assert.equal((await put({...data,photo:''},1,'photo-remove')).status,200);
 const after=await (await request('/api/data',{headers:{Cookie:auth}})).json();
 assert.equal(after.records.find(row=>row.id===data.id).data.photo,'');
 const asset=await request('/recipe-photos/ginger.webp');
 assert.equal(asset.headers.get('content-type'),'image/webp');assert.equal(Buffer.from(await asset.arrayBuffer()).subarray(0,4).toString(),'RIFF');
});
test('demo import is explicitly staging-only, needs no AI, and writes no data',async()=>{
 const options={method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:'{}'};
 const before=database.prepare('SELECT count(*) AS count FROM user_data').get().count;
 for(const APP_ENV of [undefined,'production','local','Staging']){
  const bindings={APP_ENV};
  assert.equal((await (await request('/api/config',{},bindings)).json()).demoImport,false);
  assert.equal((await request('/api/import/demo',options,bindings)).status,404);
 }
 assert.equal((await (await request('/api/config')).json()).demoImport,true);
 const response=await request('/api/import/demo',options,{APP_ENV:'staging'});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const result=await response.json();assert.equal(result.demo,true);assert.equal(result.recipe.ingredients.length,7);assert.equal(result.issues.length,2);assert.match(result.source.text,/バター ？/);
 assert.equal(database.prepare('SELECT count(*) AS count FROM user_data').get().count,before);
 assert.equal((await request('/api/import/demo',{...options,headers:{...options.headers,Origin:'https://elsewhere.test'}})).status,403);
});
test('live import streams real phases, preserves uncertainty, and rejects invalid model fields',async()=>{
 const bindings={...env,AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{async run(){return {status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...recipe,issues:[{field:'servings',reason:'数字がかすれています。'},{field:'ingredients.99.quantity',reason:'does not exist'},{field:'__proto__',reason:'invalid'}]})}]}]};}}};
 const response=await request('/api/import',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Accept:'application/x-ndjson',Cookie:auth},body:JSON.stringify({text:'卵 2個 焼く'})},bindings);
 assert.match(response.headers.get('content-type'),/application\/x-ndjson/);
 const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
 assert.deepEqual(events.filter(e=>e.type==='phase').map(e=>e.phase),['reading','sorting','checking']);
 const result=events.at(-1).result;assert.equal(result.recipe.title,recipe.title);assert.deepEqual(result.issues,[{field:'servings',reason:'数字がかすれています。'}]);
 const failed=await request('/api/import',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Accept:'application/x-ndjson',Cookie:auth},body:JSON.stringify({text:'test'})});
 assert.equal((await failed.text()).trim().split('\n').map(JSON.parse).at(-1).type,'error');
});
