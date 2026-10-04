// Local integration: a failed cloud read recovers without clearing local data.
import {strict as assert} from 'node:assert';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
let failed=false;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage(),errors=[];let status=503;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/auth/session',route=>route.fulfill({json:{configured:true,user:{id:'sync-test',email:'test@example.test',name:'Test'}}}));
 await page.route('**/api/data',route=>route.fulfill({status,json:status===200?{records:[]}:{code:'storage_unavailable'}}));
 await page.goto('http://127.0.0.1:8787');await page.locator('.notice').waitFor();assert.match(await page.locator('.notice').innerText(),/保存先に接続できません/);
 await page.evaluate(()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('uchino',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put({key:'user-sync-test:recipe:saved',kind:'recipe',id:'saved',revision:1,pending:false,deleted:false,editId:'saved-edit',data:{id:'saved',title:'保存済みのレシピ',category:'主菜',servings:2,minutes:null,ingredients:[{name:'卵',quantity:'1',unit:'個'}],steps:['焼く'],memo:'',sourceUrl:'',favorite:false,createdAt:new Date().toISOString()}});tx.oncomplete=()=>{db.close();window.dispatchEvent(new Event('uchino:data'));resolve();};tx.onerror=()=>reject(tx.error);};
 }));
 await page.getByRole('button',{name:'設定',exact:true}).click();status=200;
 await page.getByRole('button',{name:'今すぐ同期',exact:true}).click();await page.locator('.notice').waitFor({state:'detached'});await page.getByText('同期しました',{exact:true}).waitFor();
 await page.getByRole('button',{name:'レシピ',exact:true}).click();await page.getByRole('heading',{name:'保存済みのレシピ',exact:true}).waitFor();
 await page.getByRole('button',{name:'設定',exact:true}).click();status=401;await page.getByRole('button',{name:'今すぐ同期',exact:true}).click();await page.locator('.notice').waitFor();assert.match(await page.locator('.notice').innerText(),/再ログイン/);
 status=200;await page.getByRole('button',{name:'今すぐ同期',exact:true}).click();await page.locator('.notice').waitFor({state:'detached'});
 await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,value:false}));await page.getByRole('button',{name:'今すぐ同期',exact:true}).click();await page.locator('.notice').waitFor();assert.match(await page.locator('.notice').innerText(),/オフライン/);
 assert.deepEqual(errors,[]);console.log('PASS: manual sync clears stale errors, local recipes survive, expired sessions and offline state are explained');
}catch(error){failed=true;console.error(error);}finally{await browser.close();process.exit(failed?1:0);}
