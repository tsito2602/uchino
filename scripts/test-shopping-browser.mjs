// Shopping entry/finish flow, using the actual IndexedDB storage and shared panel.
import {strict as assert} from 'node:assert';
import {mkdir} from 'node:fs/promises';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('test-results',{recursive:true});let failed=false;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{const vv=new EventTarget();Object.assign(vv,{height:844,offsetTop:0,scale:1});window.testViewport=vv;Object.defineProperty(window,'visualViewport',{value:vv});});
 const keyboard=async height=>{await page.evaluate(height=>{window.testViewport.height=height;window.testViewport.dispatchEvent(new Event('resize'));},height);await page.waitForTimeout(100);};
 await page.goto('http://127.0.0.1:8787');await page.getByRole('button',{name:'この端末で使う',exact:true}).click();await page.getByRole('button',{name:'買い物',exact:true}).click();
 const finish=page.getByRole('button',{name:'この買い物を終了する',exact:true});
 assert.equal(await finish.count(),0);
 const navWidths=new Map();for(const width of [320,360,390]){await page.setViewportSize({width,height:844});navWidths.set(width,(await page.getByRole('navigation',{name:'メインメニュー'}).boundingBox()).width);}
 await page.locator('.dock-add').click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(650);
 const panel=page.getByRole('dialog'),input=page.getByLabel('買うもの',{exact:true}),items=panel.locator('.shopping-row');
 assert.equal(await panel.locator('input').count(),1);assert.equal(await input.evaluate(el=>document.activeElement===el),false,'Opening does not focus the field');
 assert.equal(await page.getByRole('button',{name:'追加',exact:true}).count(),0,'No unfocused Add button');
 const fullPanel=await panel.boundingBox();
 await input.tap();await keyboard(470);await input.fill('牛乳 1本');await page.getByRole('button',{name:'追加',exact:true}).waitFor();
 const dockBefore=await page.locator('.floating-nav-host').boundingBox();assert.equal(470-dockBefore.y-dockBefore.height,8);
 await page.evaluate(()=>{const list=document.querySelector('.shopping-entry-panel .shopping-list');window.shoppingArrivals=[];new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement&&node.matches('.shopping-entry'))window.shoppingArrivals.push({height:node.style.height,opacity:node.style.opacity});}).observe(list,{childList:true});});
 await input.press('Enter');await page.waitForFunction(()=>document.querySelector('#shopping-form input').value==='');await items.first().waitFor();
 assert.equal(await items.first().locator('strong').innerText(),'牛乳 1本');assert.equal(await input.evaluate(el=>document.activeElement===el),true);
 assert.ok((await page.evaluate(()=>window.shoppingArrivals)).some(value=>value.height==='0px'||value.opacity==='0'),'Even the first addition animates into the existing list');
 await input.fill('卵 1パック');await page.getByRole('button',{name:'追加',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#shopping-form input').value==='');await page.waitForTimeout(350);
 assert.deepEqual(await items.locator('strong').allTextContents(),['卵 1パック','牛乳 1本']);assert.equal(await input.evaluate(el=>document.activeElement===el),true,'Touch Add preserves keyboard focus');
 assert.deepEqual(await panel.boundingBox(),fullPanel);assert.deepEqual(await page.locator('.floating-nav-host').boundingBox(),dockBefore);
 const formBounds=await panel.locator('form').boundingBox(),first=await items.first().boundingBox();assert.ok(first.y>=formBounds.y+formBounds.height&&first.y<formBounds.y+formBounds.height+100,'Added rows sit directly below the form');
 for(const selector of ['.floating-viewport','.floating-nav-host','.card-panel-backdrop'])assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('html').evaluate(el=>el.setAttribute('data-brand-theme','dark'));
 await page.screenshot({path:'test-results/shopping-entry-keyboard.png',animations:'disabled'});
 await page.getByRole('button',{name:'キーボードを閉じる',exact:true}).click();await keyboard(844);
 assert.equal(await page.getByRole('button',{name:'追加',exact:true}).count(),0,'Dismiss keyboard hides the submit action');
 await page.screenshot({path:'test-results/shopping-entry-dark.png',animations:'disabled'});
 await page.getByRole('button',{name:'戻る',exact:true}).click();await panel.waitFor({state:'detached'});
 await finish.waitFor();
 for(const width of [320,360,390]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(100);
  const nav=await page.getByRole('navigation',{name:'メインメニュー'}).boundingBox(),end=await finish.boundingBox(),add=await page.locator('.dock-add').boundingBox();
  assert.ok(nav.x+nav.width<=end.x&&end.x+end.width<=add.x,'Finish sits between the three tabs and plus');assert.ok(add.x+add.width<=width);
  assert.equal(await finish.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Finish label fits the capsule');
  assert.ok(Math.abs(nav.width-navWidths.get(width))<1,'Adding Finish keeps the existing compact nav width');
  if(width===320)await page.screenshot({path:'test-results/shopping-dock-narrow.png',animations:'disabled'});
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/shopping-dock-dark.png',animations:'disabled'});
 const mainItems=page.locator('main .shopping-row');
 const names=await mainItems.locator('strong').allTextContents();await page.getByRole('checkbox',{name:'卵 1パックを購入済みにする',exact:true}).click();
 await page.getByRole('checkbox',{name:'卵 1パックを未購入に戻す',exact:true}).waitFor();assert.deepEqual(await mainItems.locator('strong').allTextContents(),names,'Checking never reorders items');
 await finish.click();await page.getByRole('button',{name:'未購入を残して終了',exact:true}).waitFor();
 await page.screenshot({path:'test-results/shopping-finish-dark.png',animations:'disabled'});
 await page.getByRole('button',{name:'未購入を残して終了',exact:true}).click();await panel.waitFor({state:'detached'});
 assert.deepEqual(await mainItems.locator('strong').allTextContents(),['牛乳 1本']);
 await page.getByRole('button',{name:'元に戻す',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('main .shopping-row').length===2);
 assert.equal(await page.getByRole('checkbox',{name:'卵 1パックを未購入に戻す',exact:true}).getAttribute('aria-checked'),'true');
 await finish.click();
 // Fail midway through the batch and prove the first deletion was rolled back.
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;let count=0;IDBObjectStore.prototype.put=function(value,...args){if(value.kind==='shopping'&&value.deleted&&++count===2){IDBObjectStore.prototype.put=put;throw new Error('テスト：一括保存に失敗しました');}return put.call(this,value,...args);};});
 await page.getByRole('button',{name:'すべて消して終了',exact:true}).click();await page.getByRole('alert').filter({hasText:'一括保存に失敗'}).waitFor();
 const persisted=await page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('uchino',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,request=db.transaction('records').objectStore('records').getAll();request.onsuccess=()=>{resolve(request.result.filter(row=>row.kind==='shopping'&&!row.deleted).length);db.close();};};}));
 assert.equal(persisted,2,'A failed finish never partially clears the list');
 await page.getByRole('button',{name:'すべて消して終了',exact:true}).click();await panel.waitFor({state:'detached'});assert.equal(await mainItems.count(),0);assert.equal(await finish.count(),0);
 // Finishing a fully purchased list is one action; undo restores it.
 await page.getByRole('button',{name:'元に戻す',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('main .shopping-row').length===2);
 await page.getByRole('checkbox',{name:'牛乳 1本を購入済みにする',exact:true}).click();await page.getByRole('checkbox',{name:'牛乳 1本を未購入に戻す',exact:true}).waitFor();
 await finish.click();await page.waitForFunction(()=>document.querySelectorAll('main .shopping-row').length===0);assert.equal(await panel.count(),0);
 await page.locator('.dock-add').click();await input.fill('パン 1袋');await input.press('Enter');await page.waitForFunction(()=>document.querySelector('#shopping-form input').value==='');
 assert.deepEqual(await items.locator('strong').allTextContents(),['パン 1袋']);
 await page.evaluate(()=>document.activeElement.blur());await page.getByRole('button',{name:'戻る',exact:true}).click();await panel.waitFor({state:'detached'});
 await page.reload();await page.getByRole('button',{name:'買い物',exact:true}).click();assert.deepEqual(await mainItems.locator('strong').allTextContents(),['パン 1袋'],'The next list persists without a history screen');
 await page.locator('html').evaluate(el=>el.setAttribute('data-brand-theme','light'));await page.screenshot({path:'test-results/shopping-dock-light.png',animations:'disabled'});
 assert.deepEqual(errors,[]);console.log('PASS: one input, focus-only submit, ordered animated additions, stable keyboard dock, responsive finish, carry/undo, atomic failure/retry and fresh-list persistence');
}catch(error){failed=true;console.error(error);}finally{await browser.close();process.exit(failed?1:0);}
