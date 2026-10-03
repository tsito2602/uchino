// Real extraction/review/save code; account, public metadata and Gemini are mocked.
import {strict as assert} from 'node:assert';
import {readFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {videoId,videoUrl,description,videoRecipe,playerHtml,watchHtml,storyboardSpec,geminiResponse} from '../tests/youtube-fixture.mjs';
import './preview.mjs';
const built=await build({entryPoints:['worker/import.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {importUrl}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const thumbnail=await readFile('public/recipe-photos/ginger.webp'),fetchOriginal=globalThis.fetch;
let metadataUnavailable=false,imageUnavailable=false,sheet;
globalThis.fetch=async url=>String(url)===videoUrl?(metadataUnavailable?new Response(null,{status:403}):new Response(watchHtml()+playerHtml(description,videoId,storyboardSpec),{headers:{'content-type':'text/html'}})):String(url).includes('/sb/')?(imageUnavailable?new Response(null,{status:403}):new Response(sheet,{headers:{'content-type':'image/png'}})):String(url).startsWith('https://i.ytimg.com/')?new Response(thumbnail,{headers:{'content-type':'image/webp'}}):Promise.reject(new Error('Unexpected outbound URL'));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
let failed=false;
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),errors=[],records=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  const originalFetch=window.fetch;let paused=false;
  window.fetch=async(...args)=>{
   if(args[0]!=='/api/import'||paused)return originalFetch(...args);
   paused=true;const pending=originalFetch(...args),encoder=new TextEncoder();
   return new Response(new ReadableStream({start(controller){
    controller.enqueue(encoder.encode(JSON.stringify({type:'phase',phase:'video'})+'\n'));
    window.resumeVideoImport=async()=>{const response=await pending;controller.enqueue(new Uint8Array(await response.arrayBuffer()));controller.close();};
   }}),{headers:{'content-type':'application/x-ndjson'}});
  };
 });
 // Distinct cells reveal off-by-one/cross-sheet crops after real JPEG encoding.
 sheet=Buffer.from((await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;const ctx=canvas.getContext('2d');for(let i=0;i<9;i++){ctx.fillStyle=i===3?'#ff0000':i===5?'#0000ff':'#00ff00';ctx.fillRect((i%3)*320,Math.floor(i/3)*180,320,180);}return canvas.toDataURL('image/png');})).split(',')[1],'base64');
 await page.route('**/api/auth/session',r=>r.fulfill({json:{configured:true,user:{id:'test-youtube',email:'test@example.test',name:'Test'}}}));
 await page.route('**/api/config',r=>r.fulfill({json:{ai:true,demoImport:false}}));
 await page.route('**/api/data',r=>r.fulfill({json:{records}}));
 await page.route('**/api/data/*/*',async r=>{const {data,editId,deleted}=r.request().postDataJSON(),kind=r.request().url().split('/').at(-2),revision=1;records.push({kind,id:data.id,data,editId,deleted,revision});await r.fulfill({json:{revision}});});
 let routeError,aiCalls=0;const phases=[];
 await page.route('**/api/import',async r=>{
  try{
   const input=r.request().postDataJSON();assert.equal(input.url,`https://youtu.be/${videoId}?si=shared`);
   const result=await importUrl(input.url,{onPhase:phase=>phases.push(phase)},{AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{run:async()=>assert.fail('Unexpected model proxy'),gateway(id){assert.equal(id,'uchino');return {run:async request=>{
    aiCalls++;assert.equal(request.provider,'google-ai-studio');assert.equal(request.endpoint,'v1beta/models/gemini-3.8-flash:generateContent');assert.equal(request.query.contents[0].parts[0].fileData.fileUri,videoUrl);if(!metadataUnavailable)assert.ok(request.query.contents[0].parts[1].text.includes(description));return Response.json(geminiResponse({...videoRecipe,stepPhotoSeconds:[17,68]}));
   }};}}});
   await r.fulfill({contentType:'application/x-ndjson',body:phases.map(phase=>JSON.stringify({type:'phase',phase})).join('\n')+'\n\n'+JSON.stringify({type:'result',result})+'\n'});
  }catch(error){routeError=error;await r.fulfill({status:500,json:{error:'test failed'}});}
 });
 await page.goto('http://127.0.0.1:8787');await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'URLから取り込む',exact:true}).click();
 await page.getByRole('textbox',{name:'レシピのURL',exact:true}).fill(`https://youtu.be/${videoId}?si=shared`);
 assert.ok((await page.locator('.import-form').innerText()).includes('YouTubeの公開動画'));
 await page.getByRole('button',{name:'読み取る',exact:true}).click();await page.getByText('動画の音声・映像を読み取っています',{exact:true}).waitFor();assert.equal(await page.getByText('動画の音声・映像を読み取っています',{exact:true}).count(),1);await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/youtube-progress-single-status.png',animations:'disabled'});await page.evaluate(()=>window.resumeVideoImport());await page.getByRole('heading',{name:'取り込み内容を確認',exact:true}).waitFor();
 assert.equal(await page.locator('.import-error-details').count(),0);assert.equal(await page.getByText('概要欄を取得できなかったため、動画から読み取りました。概要欄に分量がある場合は照合してください。',{exact:true}).count(),0);assert.equal(routeError,undefined);assert.equal(aiCalls,1);assert.deepEqual(phases,['video','sorting','checking','photos']);
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
 const saved=records.find(r=>r.kind==='recipe').data;assert.equal(saved.stepPhotos.length,2);assert.ok(saved.stepPhotos.every(photo=>photo.startsWith('data:image/jpeg;base64,')));
 const pixels=await page.evaluate(async photos=>{const result=[];for(const photo of photos){const img=new Image();img.src=photo;await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);result.push({width:c.width,height:c.height,pixel:[...ctx.getImageData(10,10,1,1).data]});}return result;},saved.stepPhotos);assert.deepEqual(pixels.map(p=>[p.width,p.height]),[[320,180],[320,180]]);assert.ok(pixels[0].pixel[0]>240&&pixels[0].pixel[2]<15);assert.ok(pixels[1].pixel[2]>240&&pixels[1].pixel[0]<15);
assert.deepEqual(saved.stepVideoSeconds,[12,65]);assert.equal(saved.sourceUrl,videoUrl);assert.ok(saved.photo.startsWith('data:image/jpeg;base64,'));assert.equal(saved.ingredients[3].quantity,'適量');
 await page.getByRole('link',{name:'手順2の動画を1:05から見る',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/youtube-recipe-detail.png',animations:'disabled'});
 await page.getByRole('button',{name:'編集',exact:true}).click();await page.getByRole('button',{name:'手順1を削除',exact:true}).click();
 assert.equal(await page.getByRole('link',{name:'手順1の動画を1:05から見る',exact:true}).getAttribute('href'),videoUrl+'&t=65s');
 assert.equal(await page.locator('.editor-step-card img').first().getAttribute('src'),saved.stepPhotos[1]);
 await page.getByRole('button',{name:'手順を追加',exact:true}).click();assert.equal(await page.locator('.recipe-form .recipe-video-link').count(),1);
 await page.getByRole('textbox',{name:'参照URL',exact:true}).fill('https://example.test/recipe');assert.equal(await page.locator('.recipe-form .recipe-video-link').count(),0);
 imageUnavailable=true;await page.reload();await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'URLから取り込む',exact:true}).click();
 await page.getByRole('textbox',{name:'レシピのURL',exact:true}).fill(`https://youtu.be/${videoId}?si=shared`);await page.getByRole('button',{name:'読み取る',exact:true}).click();await page.getByText('動画の音声・映像を読み取っています',{exact:true}).waitFor();await page.evaluate(()=>window.resumeVideoImport());await page.getByRole('heading',{name:'取り込み内容を確認',exact:true}).waitFor();
 assert.equal(await page.getByText('手順画像を取得できませんでした（0 / 2件）。手順の動画リンクから確認できます。',{exact:true}).count(),1);await page.getByText('手順画像の取得状況',{exact:true}).click();assert.match(await page.locator('.import-error-details pre').innerText(),/"httpStatus": 403/);await page.locator('.import-error-details').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/youtube-step-image-diagnostics.png',animations:'disabled'});
 assert.equal(routeError,undefined);assert.deepEqual(errors,[]);console.log('PASS: YouTube URL, Gemini path, description review, unknown quantity confirmation, thumbnail, paired timestamps, exact scene crops, save/sync/reload, edit/delete/add/source-change alignment');
}catch(error){failed=true;console.error(error);for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:'test-results/youtube-import-failure.png'}).catch(()=>{});}finally{globalThis.fetch=fetchOriginal;await browser.close();process.exit(failed?1:0);}
