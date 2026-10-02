// Real extraction/review/save code; account, public metadata and Gemini are mocked.
import {strict as assert} from 'node:assert';
import {readFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {videoId,videoUrl,description,playerHtml,geminiResponse} from '../tests/youtube-fixture.mjs';
import './preview.mjs';
const built=await build({entryPoints:['worker/import.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {importUrl}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const thumbnail=await readFile('public/recipe-photos/ginger.webp'),fetchOriginal=globalThis.fetch;
globalThis.fetch=async url=>String(url)===videoUrl?new Response(playerHtml(),{headers:{'content-type':'text/html'}}):String(url).startsWith('https://i.ytimg.com/')?new Response(thumbnail,{headers:{'content-type':'image/webp'}}):Promise.reject(new Error('Unexpected outbound URL'));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
let failed=false;
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),errors=[],records=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/auth/session',r=>r.fulfill({json:{configured:true,user:{id:'test-youtube',email:'test@example.test',name:'Test'}}}));
 await page.route('**/api/config',r=>r.fulfill({json:{ai:true,demoImport:false}}));
 await page.route('**/api/data',r=>r.fulfill({json:{records}}));
 await page.route('**/api/data/*/*',async r=>{const {data,editId,deleted}=r.request().postDataJSON(),kind=r.request().url().split('/').at(-2),revision=1;records.push({kind,id:data.id,data,editId,deleted,revision});await r.fulfill({json:{revision}});});
 let routeError,aiCalls=0;const phases=[];
 await page.route('**/api/import',async r=>{
  try{
   const input=r.request().postDataJSON();assert.equal(input.url,`https://youtu.be/${videoId}?si=shared`);
   const result=await importUrl(input.url,{onPhase:phase=>phases.push(phase)},{AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{run:async()=>assert.fail('Unexpected model proxy'),gateway(id){assert.equal(id,'uchino');return {run:async request=>{
    aiCalls++;assert.equal(request.provider,'google-ai-studio');assert.equal(request.endpoint,'v1beta/models/gemini-3.8-flash:generateContent');assert.equal(request.query.contents[0].parts[0].fileData.fileUri,videoUrl);return Response.json(geminiResponse());
   }};}}});
   await r.fulfill({contentType:'application/x-ndjson',body:phases.map(phase=>JSON.stringify({type:'phase',phase})).join('\n')+'\n\n'+JSON.stringify({type:'result',result})+'\n'});
  }catch(error){routeError=error;await r.fulfill({status:500,json:{error:'test failed'}});}
 });
 await page.goto('http://127.0.0.1:8787');await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'URLから取り込む',exact:true}).click();
 await page.getByRole('textbox',{name:'レシピのURL',exact:true}).fill(`https://youtu.be/${videoId}?si=shared`);
 assert.ok((await page.locator('.import-form').innerText()).includes('YouTubeの公開動画'));
 await page.getByRole('button',{name:'読み取る',exact:true}).click();await page.getByRole('heading',{name:'取り込み内容を確認',exact:true}).waitFor();
 assert.equal(routeError,undefined);assert.equal(aiCalls,1);assert.deepEqual(phases,['video','sorting','checking']);
 assert.equal(await page.getByRole('textbox',{name:'材料3',exact:true}).inputValue(),'醤油');assert.equal(await page.getByRole('textbox',{name:'分量4',exact:true}).inputValue(),'');
 const save=page.getByRole('button',{name:'確認して保存',exact:true});assert.equal(await save.isDisabled(),true);
 await page.getByRole('button',{name:'元の動画：卵焼きの作り方',exact:true}).click();assert.equal(await page.locator('.import-source pre').innerText(),description);assert.equal(await page.getByRole('link',{name:'元の動画を開く',exact:true}).getAttribute('href'),videoUrl);
 await page.getByRole('button',{name:'元の動画：卵焼きの作り方',exact:true}).click();
 assert.equal(await page.getByRole('link',{name:'手順2の動画を1:05から見る',exact:true}).getAttribute('href'),videoUrl+'&t=65s');
 await page.getByRole('textbox',{name:'分量4',exact:true}).fill('適量');await page.getByRole('checkbox',{name:'分量4を確認した',exact:true}).check();
 await mkdir('test-results',{recursive:true});await page.locator('.editor-step-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/youtube-import-review.png',animations:'disabled'});
 await save.click();await page.getByRole('dialog').waitFor({state:'detached'});await page.locator('.recipe-open').first().waitFor();
 if(!records.some(r=>r.kind==='recipe'))await page.waitForResponse(r=>r.url().includes('/api/data/recipe/'));
 await page.reload();await page.locator('.recipe-open').first().click();await page.getByRole('link',{name:'手順2の動画を1:05から見る',exact:true}).waitFor();
 const saved=records.find(r=>r.kind==='recipe').data;assert.deepEqual(saved.stepVideoSeconds,[12,65]);assert.equal(saved.sourceUrl,videoUrl);assert.ok(saved.photo.startsWith('data:image/jpeg;base64,'));assert.equal(saved.ingredients[3].quantity,'適量');
 await page.getByRole('link',{name:'手順2の動画を1:05から見る',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/youtube-recipe-detail.png',animations:'disabled'});
 await page.getByRole('button',{name:'編集',exact:true}).click();await page.getByRole('button',{name:'手順1を削除',exact:true}).click();
 assert.equal(await page.getByRole('link',{name:'手順1の動画を1:05から見る',exact:true}).getAttribute('href'),videoUrl+'&t=65s');
 await page.getByRole('button',{name:'手順を追加',exact:true}).click();assert.equal(await page.locator('.recipe-form .recipe-video-link').count(),1);
 await page.getByRole('textbox',{name:'参照URL',exact:true}).fill('https://example.test/recipe');assert.equal(await page.locator('.recipe-form .recipe-video-link').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: YouTube URL, Gemini path, description review, unknown quantity confirmation, thumbnail, timestamps, save/sync/reload, edit/delete/add/source-change alignment');
}catch(error){failed=true;console.error(error);for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:'test-results/youtube-import-failure.png'}).catch(()=>{});}finally{globalThis.fetch=fetchOriginal;await browser.close();process.exit(failed?1:0);}
