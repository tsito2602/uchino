// Browser + actual Worker/D1 code; R2 itself uses a deterministic in-memory bucket.
import {strict as assert} from 'node:assert';
import {readFile,mkdir} from 'node:fs/promises';
import {r2Backend} from '../tests/r2-fixture.mjs';
import {photoFixture} from '../tests/photo-fixture.mjs';
import {newRecipe} from '../src/domain.ts';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const backend=await r2Backend();let failed=false;
try{
 const original={...newRecipe(),id:'legacy-photos',title:'既存の写真付きレシピ',ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['切る','休ませる','焼く'],photo:photoFixture(12000),stepPhotos:[photoFixture(8000),'',photoFixture(9000)]};backend.seed(original);
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],puts=[];
 page.on('pageerror',error=>errors.push(error.message));
 const closeAfterSave=async()=>{await page.locator('.recipe-editor-panel').waitFor({state:'detached'});if(await page.locator('.recipe-detail-panel').count()){await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});}};
 let offline=false,holdPut=false,releasePut,markHeld;
 const apiRoute=async route=>{
  if(offline){await route.abort('internetdisconnected');return;}
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='PUT'&&path.startsWith('/api/data/')){
   puts.push(request.postDataJSON());
   if(holdPut){holdPut=false;await new Promise(resolve=>{releasePut=resolve;markHeld?.();});}
  }
  const response=await backend.request(path,{method:request.method(),...(request.postData()?{body:request.postData()}:{}),headers:request.method()==='GET'?{}:{'Content-Type':'application/json'}});
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 };
 await context.route('**/api/**',apiRoute);
 await page.goto('http://127.0.0.1:8787');await page.getByRole('heading',{name:original.title,exact:true}).waitFor();
 await page.waitForFunction(()=>new Promise(resolve=>{const r=indexedDB.open('uchino',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('records').objectStore('records').get('user-user-a:recipe:legacy-photos');q.onsuccess=()=>{resolve(q.result?.pending===false&&q.result?.data.photo.startsWith('/api/photos/'));db.close();};};}));
 assert.equal(backend.record(original.id).revision,2);assert.equal(backend.objects.size,3);assert.ok(!JSON.stringify(backend.record(original.id).data).includes('base64'));
 await page.waitForFunction(()=>document.querySelector('.recipe-photo img')?.naturalWidth>0);
 await page.locator('.recipe-open').first().click();await page.waitForFunction(()=>[...document.querySelectorAll('.recipe-step-photo')].length===2&&[...document.querySelectorAll('.recipe-step-photo')].every(img=>img.naturalWidth>0));
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/r2-recipe-detail.png',animations:'disabled'});
 // Export must still be a complete offline backup, with original photo bytes.
 await page.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.getByRole('button',{name:'設定',exact:true}).click();const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'データを書き出す',exact:true}).click();
 const download=await downloadEvent,backup=JSON.parse(await readFile(await download.path(),'utf8'));const exported=backup.records.find(row=>row.data.id===original.id).data;assert.equal(exported.photo,original.photo);assert.deepEqual(exported.stepPhotos,original.stepPhotos);
 // A fresh device downloads the R2 images and retains them locally.
 const second=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await second.route('**/api/**',apiRoute);const another=await second.newPage();await another.goto('http://127.0.0.1:8787');await another.getByRole('heading',{name:original.title,exact:true}).waitFor();await another.waitForFunction(()=>document.querySelector('.recipe-photo img')?.naturalWidth>0);await another.locator('.recipe-open').first().click();await another.waitForFunction(()=>[...document.querySelectorAll('.recipe-step-photo')].length===2&&[...document.querySelectorAll('.recipe-step-photo')].every(img=>img.naturalWidth>0));assert.ok(backend.calls.get>=3);await second.close();
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 offline=true;await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:original.title,exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.recipe-photo img')?.naturalWidth>0);
 await page.locator('.recipe-open').first().click();await page.waitForFunction(()=>[...document.querySelectorAll('.recipe-step-photo')].length===2&&[...document.querySelectorAll('.recipe-step-photo')].every(img=>img.naturalWidth>0));
 await page.getByRole('button',{name:'編集',exact:true}).click();await page.getByRole('textbox',{name:'レシピ名',exact:true}).fill('オフラインで編集');await page.getByRole('textbox',{name:'レシピ名',exact:true}).blur();await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'保存',exact:true}).click();await closeAfterSave();
 offline=false;await context.setOffline(false);await page.getByRole('button',{name:'設定',exact:true}).click();await page.getByRole('button',{name:'今すぐ同期',exact:true}).click();await page.getByText('同期しました',{exact:true}).waitFor();assert.equal(backend.record(original.id).data.title,'オフラインで編集');assert.equal(backend.calls.put,3);assert.ok(!JSON.stringify(puts.at(-1)).includes('base64'));
 // A new cover that fails R2 persistence remains on the device, then retries.
 await page.getByRole('button',{name:'レシピ',exact:true}).click();await page.locator('.recipe-open').first().click();await page.getByRole('button',{name:'編集',exact:true}).click();
 await page.getByLabel('料理の写真を選択',{exact:true}).setInputFiles('public/recipe-photos/chicken.webp');await page.waitForFunction(()=>document.querySelector('.recipe-photo-select img')?.getAttribute('src')?.startsWith('data:image/jpeg;base64,'));
 const newPhoto=await page.locator('.recipe-photo-select img').first().getAttribute('src');backend.setFailWrites(true);await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'保存',exact:true}).click();await closeAfterSave();await page.getByRole('button',{name:'設定',exact:true}).click();await page.locator('.notice').filter({hasText:'写真の保存先'}).waitFor();assert.notEqual(backend.record(original.id).data.photo,newPhoto);
 backend.setFailWrites(false);await page.getByRole('button',{name:'今すぐ同期',exact:true}).click();await page.getByText('同期しました',{exact:true}).waitFor();assert.equal(backend.objects.size,4);
 // A late upload acknowledgment must never replace a newer local edit.
 await page.getByRole('button',{name:'レシピ',exact:true}).click();holdPut=true;const held=new Promise(resolve=>{markHeld=resolve;});await page.locator('.recipe-favorite').first().click();await held;await page.locator('.recipe-open').first().click();await page.getByRole('button',{name:'編集',exact:true}).click();await page.getByRole('textbox',{name:'レシピ名',exact:true}).fill('通信中の新しい編集');await page.getByRole('textbox',{name:'レシピ名',exact:true}).blur();await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'保存',exact:true}).click();await closeAfterSave();releasePut();await page.getByRole('button',{name:'設定',exact:true}).click();await page.getByRole('button',{name:'今すぐ同期',exact:true}).click();await page.getByText('同期しました',{exact:true}).waitFor();assert.equal(backend.record(original.id).data.title,'通信中の新しい編集');
 assert.deepEqual(errors,[]);console.log('PASS: existing-cloud migration, private R2 references, exact local copies, offline cover/step images and edits, self-contained export, small metadata sync, failed upload retention and retry');
}catch(error){failed=true;console.error(error);for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:'test-results/r2-failure.png'}).catch(()=>{});}finally{await browser.close();backend.database.close();process.exit(failed?1:0);}
