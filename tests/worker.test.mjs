import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {SignJWT} from 'jose';
import app from '../dist/worker.mjs';
import {newRecipe} from '../src/domain.ts';
import {photoFixture} from './photo-fixture.mjs';
import {videoUrl,playerHtml,geminiResponse} from './youtube-fixture.mjs';
const env={APP_ENV:'staging',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',SESSION_SECRET:'test-key-more-than-thirty-two-characters',ALLOWED_EMAILS:'a@example.test,b@example.test'};
async function cookie(id='user-a',email='a@example.test'){
 const value=await new SignJWT({sub:id,email,name:id,purpose:'session'}).setProtectedHeader({alg:'HS256'}).setIssuer('uchino').setAudience('https://example.test').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(env.SESSION_SECRET));
 return `__Host-uchino_session=${value}`;
}
const database=new DatabaseSync(':memory:');database.exec(await readFile('migrations/0001_init.sql','utf8'));
function d1(database){return {prepare(sql){let values=[];const stmt={bind(...args){values=args;return stmt;},async first(){return database.prepare(sql).get(...values)??null;},async all(){return {results:database.prepare(sql).all(...values)};},execute(){const result=database.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};},async run(){return stmt.execute();}};return stmt;},async batch(statements){database.exec('BEGIN');try{const result=statements.map(s=>s.execute());database.exec('COMMIT');return result;}catch(error){database.exec('ROLLBACK');throw error;}}};}
const DB=d1(database);
const auth=await cookie();
function request(path,options={},bindings={...env,DB}){return app.fetch(new Request(`https://example.test${path}`,options),bindings);}
async function createBook(auth,bindings={...env,DB}){return request('/api/spaces',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Cookie:auth},body:JSON.stringify({name:'うちのレシピ',initial:true})},bindings);}
await createBook(auth);await createBook(await cookie('user-b','b@example.test'));
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
 const data={...recipe,id:'photo-recipe',photo:photoFixture(120000),ingredients:[{name:'醤油',quantity:'1',unit:'大さじ',group:'A'}]};
 assert.equal((await put(data,0,'photo-create')).status,200,'A photo larger than the old 100KB request limit saves');
 const mine=await (await request('/api/data',{headers:{Cookie:auth}})).json();
 assert.equal(mine.records.find(row=>row.id===data.id).data.photo,data.photo);
 assert.deepEqual(mine.records.find(row=>row.id===data.id).data.ingredients,data.ingredients);
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
 const bindings={...env,AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{async run(){return {status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({recipe:{...recipe,issues:[{field:'servings',reason:'数字がかすれています。'},{field:'ingredients.99.quantity',reason:'does not exist'},{field:'__proto__',reason:'invalid'}]},error:null})}]}]};}}};
 const response=await request('/api/import',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Accept:'application/x-ndjson',Cookie:auth},body:JSON.stringify({text:'卵 2個 焼く'})},bindings);
 assert.match(response.headers.get('content-type'),/application\/x-ndjson/);
 const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
 assert.deepEqual(events.filter(e=>e.type==='phase').map(e=>e.phase),['reading','sorting','checking']);
 const result=events.at(-1).result;assert.equal(result.recipe.title,recipe.title);assert.deepEqual(result.issues,[{field:'servings',reason:'数字がかすれています。'}]);
 const failed=await request('/api/import',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Accept:'application/x-ndjson',Cookie:auth},body:JSON.stringify({text:'test'})});
 assert.equal((await failed.text()).trim().split('\n').map(JSON.parse).at(-1).type,'error');
});

test('AI failure diagnostics reach the client and logs without upstream text or saved data',async t=>{
 const secret='private recipe and provider credentials',logs=[];
 t.mock.method(console,'error',value=>logs.push(value));
 const before=database.prepare('SELECT count(*) AS count FROM user_data').get().count;
 const bindings={...env,DB,AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{async run(){return Response.json({errors:[{code:2005,message:secret}]},{status:400});}}};
 for(const accept of ['application/x-ndjson','application/json']){
  const result=await request('/api/import',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Accept:accept,Cookie:auth},body:JSON.stringify({text:secret})},bindings);
  const text=await result.text();assert.ok(!text.includes(secret));
  const failure=accept==='application/x-ndjson'?text.trim().split('\n').map(JSON.parse).at(-1):JSON.parse(text);
  assert.deepEqual(failure.diagnostics,{code:'invalid_request',stage:'response',httpStatus:400,providerCode:'2005'});
 }
 assert.equal(logs.length,2);assert.ok(logs.every(line=>JSON.parse(line).event==='recipe_import_failed'&&!line.includes(secret)));
 assert.equal(database.prepare('SELECT count(*) AS count FROM user_data').get().count,before);
});

test('sync initializes a new database without migrations and retains existing user data',async()=>{
 const fresh=new DatabaseSync(':memory:'),bindings={...env,DB:d1(fresh)};
 try{
  assert.equal((await request('/api/data',{},bindings)).status,401);
  assert.equal(fresh.prepare("SELECT name FROM sqlite_master WHERE name='user_data'").get(),undefined,'Unauthenticated requests do not initialize storage');
  const first=await request('/api/data',{headers:{Cookie:auth}},bindings);
  assert.equal(first.status,409);assert.equal((await first.json()).code,'recipebook_required');
  assert.equal((await createBook(auth,bindings)).status,201);
  assert.deepEqual(await (await request('/api/data',{headers:{Cookie:auth}},bindings)).json(),{records:[]});
  const data={...recipe,id:'fresh-recipe'};
  const saved=await request(`/api/data/recipe/${data.id}`,{method:'PUT',headers:{Origin:'https://example.test','Content-Type':'application/json',Cookie:auth},body:JSON.stringify({data,revision:0,deleted:false,editId:'fresh-edit'})},bindings);
  assert.equal(saved.status,200);
  // A new binding simulates a new Worker isolate initializing the same DB.
  const result=await (await request('/api/data',{headers:{Cookie:auth}},{...env,DB:d1(fresh)})).json();
  assert.equal(result.records.length,1);assert.deepEqual(result.records[0].data,data);assert.equal(result.records[0].revision,1);
 }finally{fresh.close();}
});

test('storage setup failures remain retryable and missing binding is distinguishable',async t=>{
 const logs=[];t.mock.method(console,'error',value=>logs.push(value));
 const fresh=new DatabaseSync(':memory:'),working=d1(fresh);let fails=true;
 const binding={prepare(sql){if(fails)return {async run(){throw new Error('private database diagnostic');}};return working.prepare(sql);}};
 try{
  const failed=await request('/api/data',{headers:{Cookie:auth}},{...env,DB:binding});
  assert.equal(failed.status,503);assert.equal((await failed.json()).code,'storage_unavailable');
  fails=false;assert.equal((await request('/api/data',{headers:{Cookie:auth}},{...env,DB:binding})).status,409);
  const missing=await request('/api/data',{headers:{Cookie:auth}},env);assert.equal(missing.status,503);assert.equal((await missing.json()).code,'storage_unconfigured');
  assert.ok(logs.length);assert.ok(!logs.join('').includes('private database diagnostic'));
 }finally{fresh.close();}
});

test('numbered step photos survive sync and can be removed independently of the cover',async()=>{
 const data={...recipe,id:'step-photo-recipe',photo:photoFixture(120000),steps:['切る','休ませる','焼く'],stepPhotos:[photoFixture(50000),'',photoFixture(60000)]};
 assert.equal((await put(data,0,'step-photo-create')).status,200);
 const records=(await (await request('/api/data',{headers:{Cookie:auth}})).json()).records;
 assert.deepEqual(records.find(row=>row.id===data.id).data.stepPhotos,data.stepPhotos);
 assert.equal((await put({...data,stepPhotos:['','',data.stepPhotos[2]]},1,'step-photo-remove')).status,200);
 const saved=(await (await request('/api/data',{headers:{Cookie:auth}})).json()).records.find(row=>row.id===data.id).data;
 assert.equal(saved.photo,data.photo);assert.deepEqual(saved.stepPhotos,['','',data.stepPhotos[2]]);
 assert.equal((await put({...data,stepPhotos:[data.stepPhotos[2]]},2,'step-photo-mismatch')).status,400);
});

test('authenticated YouTube NDJSON import preserves phases and timestamps, and saves only on explicit sync',async t=>{
 t.mock.method(globalThis,'fetch',async url=>String(url)===videoUrl?new Response(playerHtml(),{headers:{'content-type':'text/html'}}):new Response(null,{status:404}));
 let calls=0;
 const bindings={...env,DB,AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{run:async()=>assert.fail('Unexpected model proxy'),gateway(id){assert.equal(id,'uchino');return {run:async request=>{calls++;assert.equal(request.provider,'google-ai-studio');assert.equal(request.endpoint,'v1beta/models/gemini-3.8-flash:generateContent');assert.equal(request.query.contents[0].parts[0].fileData.fileUri,videoUrl);return Response.json(geminiResponse());}};}}};
 const options={method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify({url:videoUrl})};
 assert.equal((await request('/api/import',options,bindings)).status,401);assert.equal(calls,0);
 const before=database.prepare('SELECT count(*) AS count FROM user_data').get().count;
 const response=await request('/api/import',{...options,headers:{...options.headers,Cookie:auth}},bindings);
 assert.equal(response.status,200);const events=(await response.text()).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
 assert.deepEqual(events.filter(event=>event.type==='phase').map(event=>event.phase),['reading','video','sorting','checking','photos']);
 const result=events.at(-1).result;assert.equal(result.source.kind,'video');assert.equal(result.recipe.ingredients[3].quantity,'');assert.deepEqual(result.recipe.stepVideoSeconds,[12,65]);
 assert.equal(database.prepare('SELECT count(*) AS count FROM user_data').get().count,before);
 assert.equal((await put(result.recipe,0,'youtube-save')).status,200);
 const records=(await (await request('/api/data',{headers:{Cookie:auth}})).json()).records;
 assert.deepEqual(records.find(row=>row.id===result.recipe.id).data.stepVideoSeconds,[12,65]);
});
test('active sessions roll forward instead of expiring daily',async()=>{
 const sign=iat=>new SignJWT({sub:'user-a',email:'a@example.test',name:'user-a',purpose:'session'}).setProtectedHeader({alg:'HS256'}).setIssuer('uchino').setAudience('https://example.test').setIssuedAt(iat).setExpirationTime(iat+86400).sign(new TextEncoder().encode(env.SESSION_SECRET));
 const now=Math.floor(Date.now()/1000);
 const fresh=await request('/api/auth/session',{headers:{Cookie:`__Host-uchino_session=${await sign(now)}`}});
 assert.equal(fresh.headers.get('Set-Cookie'),null);
 const old=await request('/api/auth/session',{headers:{Cookie:`__Host-uchino_session=${await sign(now-7200)}`}});
 assert.ok((await old.json()).user);
 assert.match(old.headers.get('Set-Cookie')||'',/__Host-uchino_session=.*Max-Age=2592000/);
});
