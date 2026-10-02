// Real upload bytes and application extraction/review/save code; AI and account sync are mocked.
// COOKBOOK_IMAGE can point to a private JPEG fixture. It is never copied into the repository.
import {strict as assert} from 'node:assert';
import {readFile,mkdir} from 'node:fs/promises';
import {basename} from 'node:path';
import {build} from 'esbuild';
import './preview.mjs';
const bundled=await build({entryPoints:['worker/import-ai.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {importAI}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
let failed=false;
try{
 const imagePath=process.env.COOKBOOK_IMAGE||'public/recipe-photos/chicken.webp',bytes=await readFile(imagePath);
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage(),errors=[],records=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/auth/session',route=>route.fulfill({json:{configured:true,user:{id:'test-cookbook',email:'test@example.test',name:'Test'}}}));
 await page.route('**/api/config',route=>route.fulfill({json:{ai:true,demoImport:false}}));
 await page.route('**/api/data',route=>route.fulfill({json:{records}}));
 await page.route('**/api/data/*/*',async route=>{
  const {data,editId,deleted}=route.request().postDataJSON(),kind=route.request().url().split('/').at(-2),revision=1;
  records.push({kind,id:data.id,data,deleted,revision,editId});await route.fulfill({json:{revision}});
 });
 const ingredients=[['豚バラ薄切り肉','100','g'],['大根','100','g'],['にんじん','50','g'],['ごぼう','80','g'],['こんにゃく','50','g'],['だし','600','ml'],['みそ','3','大さじ'],['みりん','1','大さじ','A'],['薄口しょうゆ','1','小さじ','A'],['しょうがのすりおろし','1/2','小さじ','A'],['ごま油','1','小さじ'],['ねぎの小口切り','1/4','本分']].map(([name,quantity,unit,group=''])=>({name,quantity,unit,group}));
 const value={title:null,category:'汁物',servings:2,minutes:null,ingredients,steps:['野菜とこんにゃくを切り、下ゆでする。','豚肉をごま油で炒め、野菜を加える。','だしで煮て、みそとAを加え、ねぎをのせる。'],stepSources:[null,null,null],memo:'',issues:[]};
 let calls=0,routeError;
 await page.route('**/api/import',async route=>{
  try{
   const input=route.request().postDataJSON();assert.deepEqual(Buffer.from(input.image.split(',')[1],'base64'),bytes);
   const result=await importAI({AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{run:async(_model,payload)=>{
    calls++;const image=payload.input[0].content.find(c=>c.type==='input_image');assert.equal(image.detail,'high');assert.equal(image.image_url,input.image);
    return {status:'completed',output_text:JSON.stringify({recipe:calls===1?null:value,error:calls===1?'読み取れませんでした':null})};
   }}},input);
   await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',result})+'\n'});
  }catch(error){routeError=error;await route.fulfill({status:500,json:{error:'test failed'}});}
 });
 await page.goto('http://127.0.0.1:8787');await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'画像から取り込む',exact:true}).click();
 await page.getByLabel('レシピ画像を選択',{exact:true}).setInputFiles(imagePath);await page.locator('.import-preview').waitFor();
 await page.getByRole('button',{name:'読み取る',exact:true}).click();await page.getByRole('heading',{name:'取り込み内容を確認',exact:true}).waitFor();
 assert.equal(routeError,undefined);assert.equal(calls,2);assert.equal(await page.getByRole('textbox',{name:'レシピ名',exact:true}).inputValue(),'名称未設定のレシピ');
 assert.equal(await page.locator('.editor-ingredient-card').count(),12);assert.equal(await page.locator('.editor-step-card').count(),3);
 assert.equal(await page.getByRole('textbox',{name:'グループ10',exact:true}).inputValue(),'A');assert.equal(await page.getByRole('textbox',{name:'分量10',exact:true}).inputValue(),'1/2');assert.equal(await page.getByRole('textbox',{name:'分量12',exact:true}).inputValue(),'1/4');
 const save=page.getByRole('button',{name:'確認して保存',exact:true});assert.equal(await save.isDisabled(),true);
 await page.getByRole('button',{name:`元の画像：${basename(imagePath)}`,exact:true}).click();
 const original=page.getByRole('img',{name:basename(imagePath),exact:true});await original.evaluate(img=>img.decode());
 assert.deepEqual(Buffer.from((await original.getAttribute('src')).split(',')[1],'base64'),bytes);
 await page.getByRole('button',{name:`元の画像：${basename(imagePath)}`,exact:true}).click();
 await page.getByRole('textbox',{name:'レシピ名',exact:true}).fill('豚汁');await page.getByRole('checkbox',{name:'レシピ名を確認した',exact:true}).check();
 await mkdir('test-results',{recursive:true});await page.locator('.import-issues').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/cookbook-review.png',animations:'disabled'});
 await save.click();await page.getByRole('dialog').waitFor({state:'detached'});await page.locator('.recipe-open').first().waitFor();
 await page.reload();await page.locator('.recipe-open').first().click();await page.locator('.ingredient-group').first().waitFor();
 assert.deepEqual(await page.locator('.ingredient-group').allTextContents(),['A','その他の材料']);
 const saved=records.find(row=>row.kind==='recipe').data;assert.equal(saved.title,'豚汁');assert.deepEqual(saved.ingredients.map(i=>({...i,group:i.group||''})),ingredients);assert.deepEqual(saved.steps,value.steps);assert.equal(saved.minutes,null);
 assert.deepEqual(errors,[]);console.log('PASS: unchanged cookbook upload, one mocked AI recheck, missing-title review, 12 ingredients with A and fractions, 3 steps, edit/save/sync/reload');
}catch(error){failed=true;console.error(error);}finally{await browser.close();process.exit(failed?1:0);}
