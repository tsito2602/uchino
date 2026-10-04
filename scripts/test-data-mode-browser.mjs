// Run after npm run bundle:worker; same browser overrides as test-photos-browser.mjs.
import {strict as assert} from 'node:assert';
import {mkdir} from 'node:fs/promises';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
await mkdir('test-results',{recursive:true});
const recipe=(id,title)=>({id,title,category:'主菜',servings:2,minutes:10,ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['焼く。'],memo:'',sourceUrl:'',favorite:false,createdAt:'2026-10-01T00:00:00Z',photo:''});
const row=(scope,kind,data,pending=false)=>({key:`${scope}:${kind}:${data.id}`,kind,id:data.id,data,revision:0,deleted:false,pending,editId:crypto.randomUUID()});
const readRows=page=>page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('uchino',1);open.onsuccess=()=>{const db=open.result;const request=db.transaction('records').objectStore('records').getAll();request.onsuccess=()=>{db.close();resolve(request.result);};request.onerror=()=>reject(request.error);};}));
async function seed(page,records,preferences={}){
 await page.evaluate(({records,preferences})=>new Promise((resolve,reject)=>{for(const [key,value] of Object.entries(preferences))localStorage.setItem(key,value);const open=indexedDB.open('uchino',1);open.onupgradeneeded=()=>open.result.createObjectStore('records',{keyPath:'key'});open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite');for(const record of records)tx.objectStore('records').put(record);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),{records,preferences});
}
const tab=(page,name)=>page.getByRole('navigation',{name:'メインメニュー'}).getByRole('button',{name:name==='買い物メモ'?'買い物':name,exact:true}).click();
async function mode(page,name){await tab(page,'設定');await page.getByRole('group',{name:'表示するデータ',exact:true}).getByRole('button',{name,exact:true}).click();await page.waitForFunction(name=>document.querySelector('.data-mode-control button[aria-pressed="true"]')?.textContent===name,name);}
async function addShopping(page,name){await tab(page,'買い物メモ');await page.locator('.dock-add').click();const input=page.locator('#shopping-form input');await input.fill(name);await input.press('Enter');await page.waitForFunction(()=>document.querySelector('#shopping-form input')?.value==='');await input.blur();await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});}
let failed=false;
try{
 const errors=[],context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:8787');await page.evaluate(()=>localStorage.setItem('uchino-device-mode','true'));await page.reload();
 await page.getByRole('heading',{name:'レシピを保存しよう',exact:true}).waitFor();
 await mode(page,'デモデータ');await tab(page,'レシピ');await page.locator('.recipe-row').nth(2).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('.recipe-photo img')].every(image=>image.naturalWidth>0));
 assert.equal(await page.locator('.data-mode-badge').innerText(),'デモ');
 for(const width of [320,360,390,1280]){
  await page.setViewportSize({width,height:844});
  const cards=await page.locator('.recipe-row').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
  assert.ok(Math.abs(cards[0].y-cards[1].y)<1&&cards[1].x>cards[0].x&&cards[2].y>cards[0].y,'Exactly two columns');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/data-mode-recipes.png',fullPage:true});
 await page.locator('.recipe-favorite').first().click();await page.waitForFunction(()=>document.querySelector('.recipe-favorite')?.getAttribute('aria-pressed')==='true');
 await addShopping(page,'デモの卵');
 await mode(page,'実データ');await tab(page,'買い物メモ');await page.getByRole('heading',{name:'買うものをまとめよう',exact:true}).waitFor();
 await addShopping(page,'実データの牛乳');
 await tab(page,'レシピ');await page.getByRole('heading',{name:'レシピを保存しよう',exact:true}).waitFor();
 await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'手入力で追加',exact:true}).click();
 await page.getByLabel('レシピ名',{exact:true}).fill('うちの卵焼き');await page.getByLabel('材料1',{exact:true}).fill('卵');await page.getByLabel('手順1',{exact:true}).fill('焼く。');await page.getByLabel('手順1',{exact:true}).blur();
 await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await mode(page,'デモデータ');
 await page.screenshot({path:'test-results/data-mode-settings.png',fullPage:true});
 await page.getByRole('button',{name:'ダーク',exact:true}).click();await page.screenshot({path:'test-results/data-mode-settings-dark.png',fullPage:true,animations:'disabled'});
 await tab(page,'レシピ');await page.locator('.recipe-row').nth(2).waitFor();assert.equal(await page.locator('.recipe-row').count(),3);
 await page.reload();await page.locator('.recipe-row').nth(2).waitFor();assert.equal(await page.locator('.recipe-favorite').first().getAttribute('aria-pressed'),'true','Demo edits survive switching/reloading');
 await tab(page,'買い物メモ');await page.getByText('デモの卵',{exact:true}).waitFor();assert.equal(await page.getByText('実データの牛乳',{exact:true}).count(),0);
 await mode(page,'実データ');await tab(page,'レシピ');await page.getByRole('heading',{name:'うちの卵焼き',exact:true}).waitFor();assert.equal(await page.locator('.recipe-row').count(),1);
 await tab(page,'買い物メモ');await page.getByText('実データの牛乳',{exact:true}).waitFor();assert.equal(await page.getByText('デモの卵',{exact:true}).count(),0);
 const stored=await readRows(page);assert.ok(stored.filter(row=>row.key.startsWith('demo-')).every(row=>!row.pending));assert.equal(stored.filter(row=>row.key.startsWith('guest:recipe:')&&!row.deleted).length,1);
 await mode(page,'デモデータ');
 // Legacy samples move atomically while user-created recipes stay real.
 const legacyContext=await browser.newContext({serviceWorkers:'block'}),legacyPage=await legacyContext.newPage();legacyPage.on('pageerror',error=>errors.push(error.message));await legacyPage.goto('http://127.0.0.1:8787');await legacyPage.locator('.login').waitFor();
 const editedSample={...recipe('sample-ginger','編集したしょうが焼き'),memo:'自分の分量に編集済み'};
 await seed(legacyPage,[row('guest','recipe',editedSample),row('guest','recipe',recipe('my-recipe','自分のレシピ'))],{'uchino-device-mode':'true','test-migration-failure':'true'});
 await legacyPage.addInitScript(()=>{const remove=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(key){if(key==='guest:recipe:sample-ginger'&&localStorage.getItem('test-migration-failure')){localStorage.removeItem('test-migration-failure');throw new Error('テスト：移動先の保存後に失敗');}return remove.call(this,key);};});
 await legacyPage.reload();await legacyPage.getByRole('button',{name:'再試行',exact:true}).waitFor();
 const afterFailure=await readRows(legacyPage);assert.ok(afterFailure.some(row=>row.key==='guest:recipe:sample-ginger'));assert.ok(!afterFailure.some(row=>row.key==='demo-guest:recipe:sample-ginger'),'Migration failure rolls back copy and removal');
 await legacyPage.getByRole('button',{name:'再試行',exact:true}).click();await legacyPage.getByRole('heading',{name:'自分のレシピ',exact:true}).waitFor();assert.equal(await legacyPage.locator('.recipe-row').count(),1);
 await mode(legacyPage,'デモデータ');await tab(legacyPage,'レシピ');await legacyPage.getByRole('heading',{name:'編集したしょうが焼き',exact:true}).waitFor();assert.equal(await legacyPage.locator('.recipe-photo img').count(),0,'Explicit photo removal survives migration');
 const migrated=await readRows(legacyPage);assert.deepEqual(migrated.find(row=>row.key==='demo-guest:recipe:sample-ginger').data,editedSample);assert.ok(!migrated.some(row=>row.key==='guest:recipe:sample-ginger'));
 // Deleting every demo does not reseed on reload or on switching away and back.
 await legacyPage.locator('.recipe-open').click();await legacyPage.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'編集',exact:true}).click();legacyPage.once('dialog',dialog=>dialog.accept());await legacyPage.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'削除',exact:true}).click();await legacyPage.getByRole('dialog').waitFor({state:'detached'});await legacyPage.reload();await legacyPage.getByRole('heading',{name:'レシピを保存しよう',exact:true}).waitFor();await mode(legacyPage,'実データ');await mode(legacyPage,'デモデータ');await tab(legacyPage,'レシピ');await legacyPage.getByRole('heading',{name:'レシピを保存しよう',exact:true}).waitFor();
 // Authenticated demos never call the data API, even while actual edits await sync.
 const accountContext=await browser.newContext({serviceWorkers:'block'}),accountPage=await accountContext.newPage();let user='one';const dataRequests=[];
 await accountPage.route('**/api/auth/session',route=>route.fulfill({json:{configured:true,user:{id:user,email:`${user}@example.test`,name:user}}}));
 await accountPage.route('**/api/data**',async route=>{dataRequests.push({method:route.request().method(),body:route.request().postDataJSON()});await route.fulfill({json:route.request().method()==='PUT'?{revision:1}:{records:[]}});});
 await accountPage.goto('http://127.0.0.1:8787');await accountPage.getByRole('heading',{name:'レシピを保存しよう',exact:true}).waitFor();
 await seed(accountPage,[row('user-one','recipe',recipe('pending-real','未同期のレシピ'),true)],{'uchino-data-mode-user-one':'demo'});dataRequests.length=0;await accountPage.reload();await accountPage.locator('.recipe-row').nth(2).waitFor();await accountPage.locator('.recipe-favorite').first().click();await mode(accountPage,'デモデータ');assert.equal(await accountPage.getByRole('button',{name:'更新を確認',exact:true}).isDisabled(),true);assert.equal(dataRequests.length,0,'Demo edits never sync');
 await mode(accountPage,'実データ');await tab(accountPage,'レシピ');await accountPage.getByRole('heading',{name:'未同期のレシピ',exact:true}).waitFor();await accountPage.waitForFunction(()=>!document.querySelector('.notice'));assert.ok(dataRequests.some(request=>request.method==='PUT'&&request.body.data.id==='pending-real'));
 assert.ok(dataRequests.filter(request=>request.method==='PUT').every(request=>request.body.data.id==='pending-real'));
 await mode(accountPage,'デモデータ');user='two';await accountPage.reload();await accountPage.getByRole('heading',{name:'レシピを保存しよう',exact:true}).waitFor();assert.equal(await accountPage.locator('.data-mode-badge').count(),0,'Mode and datasets are per account');
 assert.deepEqual(errors,[]);console.log('PASS: two-column photos, settings, theme, switching, recipes/shopping isolation, persistence, export, migration, deletion, authenticated demo isolation, pending protection, account separation.');
}catch(error){failed=true;console.error(error);for(const [index,context] of browser.contexts().entries()){const page=context.pages()[0];if(page){await page.screenshot({path:`test-results/data-mode-failure-${index}.png`}).catch(()=>{});console.error((await page.locator('body').innerText()).slice(0,1500));}}}finally{await browser.close();process.exit(failed?1:0);}
