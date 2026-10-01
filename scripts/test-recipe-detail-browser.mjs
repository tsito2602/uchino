// Run after npm run bundle:worker; tests real touch input via Chromium CDP.
import {strict as assert} from 'node:assert';
import {mkdir} from 'node:fs/promises';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('test-results',{recursive:true});
let failed=false;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:8787');await page.getByRole('button',{name:'この端末で使う',exact:true}).click();await page.getByRole('button',{name:'サンプルを見てみる',exact:true}).click();await page.locator('.recipe-row').nth(2).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('.recipe-photo img')].every(image=>image.naturalWidth>0));
 assert.equal(await page.locator('.recipe-photo img').count(),3);await page.locator('.recipe-photo img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));await page.waitForTimeout(150);await page.screenshot({path:'test-results/recipe-sharp-cards.png'});
 assert.equal(await page.locator('.recipe-row-copy').first().evaluate(el=>getComputedStyle(el,'::before').backdropFilter),'none','Card photos stay sharp behind text');
 const favorite=page.locator('.recipe-favorite').first();if(await favorite.getAttribute('aria-pressed')!=='true')await favorite.click();await page.waitForFunction(()=>document.querySelector('.recipe-favorite')?.getAttribute('aria-pressed')==='true');assert.equal(await favorite.evaluate(el=>getComputedStyle(el).color),'rgb(230, 75, 135)','Favorite heart is pink');
 await page.locator('.recipe-open').first().click();await page.locator('.recipe-hero').waitFor();await page.waitForTimeout(650);
 assert.equal(await page.locator('.card-panel-header h2').innerText(),'豚のしょうが焼き','Recipe title is the header');
 const photo=await page.locator('.recipe-hero>.recipe-photo').boundingBox(),panel=await page.locator('.card-panel').boundingBox();assert.ok(Math.abs(photo.x-panel.x)<1&&Math.abs(photo.y-(await page.locator('.card-panel-header').boundingBox()).y-(await page.locator('.card-panel-header').boundingBox()).height)<1&&Math.abs(photo.width-panel.width)<1,'Detail photo reaches both edges directly under the title');
 assert.equal(await page.locator('.recipe-hero>.recipe-photo').evaluate(el=>getComputedStyle(el).maskImage),'none');assert.equal(await page.locator('.recipe-hero>.recipe-photo').evaluate(el=>getComputedStyle(el,'::after').backdropFilter),'none');
 await page.screenshot({path:'test-results/recipe-edge-light.png'});
 await page.locator('html').evaluate(el=>{el.setAttribute('data-brand-theme','dark');el.style.colorScheme='dark';});await page.screenshot({path:'test-results/recipe-edge-dark.png',animations:'disabled'});
 await page.locator('html').evaluate(el=>{el.setAttribute('data-brand-theme','light');el.style.colorScheme='light';});
 const nav=page.getByRole('navigation',{name:'操作',exact:true});
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:'人数を増やす',exact:true}).count(),0,'Serving controls are only in the dock');
 await nav.getByRole('button',{name:'人数を増やす',exact:true}).click();await nav.getByRole('button',{name:'人数を増やす',exact:true}).click();
 assert.equal((await nav.getByRole('group',{name:'人数を変更'}).innerText()).replace(/\s/g,''),'4人分');assert.equal((await page.locator('.quantity-ticker-accessible').first().innerText()).trim(),'400');
 for(let i=0;i<3;i++)await nav.getByRole('button',{name:'人数を減らす',exact:true}).click();assert.equal(await nav.getByRole('button',{name:'人数を減らす',exact:true}).isDisabled(),true);await nav.getByRole('button',{name:'人数を増やす',exact:true}).click();
 const rows=page.locator('.ingredient-row'),selected=()=>page.locator('.ingredient-row input:checked').count();
 async function positionList(){await rows.first().evaluate(el=>{const scroll=el.closest('.card-panel');scroll.scrollTop+=el.getBoundingClientRect().top-scroll.querySelector('.card-panel-header').getBoundingClientRect().bottom-24;});}
 const point=async index=>{const box=await rows.nth(index).boundingBox();return{x:box.x+box.width/2,y:box.y+box.height/2};};
 const cdp=await context.newCDPSession(page);
 const touch=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{...p,id:1,radiusX:4,radiusY:4}]:[]});
 async function hold(index){const p=await point(index);await touch('touchStart',p);await page.waitForTimeout(380);return p;}
 await positionList();await hold(0);await touch('touchMove',await point(2));assert.equal(await selected(),3,'Sweep toggles every crossed row, including skipped rows');
 await touch('touchMove',await point(2));await page.waitForTimeout(120);assert.equal(await selected(),3,'Remaining on a row does not repeatedly toggle it');
 await touch('touchMove',await point(1));await touch('touchMove',await point(2));assert.equal(await selected(),1,'Retracing selected rows deselects them');
 await touch('touchMove',await point(1));await touch('touchMove',await point(2));await touch('touchEnd');assert.equal(await selected(),3);
 await page.waitForTimeout(650);assert.equal(await selected(),3,'Release does not undo selection');
 assert.equal(await nav.getByRole('button',{name:'買い物に追加（3）',exact:true}).count(),1);
 for(const width of [320,360,390,1280]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(80);
  const islands=await nav.locator('.context-island').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
  assert.equal(islands.length,3);assert.ok(islands[0].x+islands[0].width<=islands[1].x&&islands[1].x+islands[1].width<=islands[2].x,'Dock islands never overlap');assert.ok(islands[2].x+islands[2].width<=width,'Dock stays in viewport');
  const controls=await nav.locator('.context-servings button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));assert.ok(controls.every(box=>box.width>=44&&box.height>=44),'Serving buttons have touch targets');
  if(width===320)await page.screenshot({path:'test-results/recipe-selection-320.png'});
 }
 await page.setViewportSize({width:390,height:844});await positionList();await hold(2);await touch('touchMove',await point(0));await touch('touchEnd');assert.equal(await selected(),0,'Starting on a selected row deselects the whole swept range');
 // A sweep through mixed states flips each row independently.
 await rows.nth(1).tap();await hold(0);await touch('touchMove',await point(2));await touch('touchEnd');assert.equal(await selected(),2);assert.equal(await rows.nth(1).locator('input').isChecked(),false,'A previously selected row is deselected even when the sweep starts on an unselected row');await rows.nth(0).tap();await rows.nth(2).tap();assert.equal(await selected(),0);
 // A new tap immediately after a sweep remains a normal checkbox toggle.
 await rows.nth(1).tap();assert.equal(await selected(),1);await rows.nth(1).tap();assert.equal(await selected(),0);
 // Swipe before the hold threshold scrolls instead of selecting.
 await positionList();const before=await page.locator('.card-panel').evaluate(el=>el.scrollTop),start=await point(3);
 await touch('touchStart',start);await touch('touchMove',{x:start.x,y:start.y-70});await touch('touchMove',{x:start.x,y:start.y-120});await touch('touchEnd');await page.waitForTimeout(400);
 assert.equal(await selected(),0);assert.ok(await page.locator('.card-panel').evaluate((el,before)=>el.scrollTop>before+20,before),'Short swipe scrolls normally');
 await positionList();await rows.first().locator('input').focus();await page.keyboard.press('Space');assert.equal(await selected(),1,'Keyboard checkbox selection is preserved');await page.keyboard.press('Space');
 // Holding at the bottom edge scrolls the panel and sweeps new rows into selection.
 await hold(0);const box=await page.locator('.card-panel').boundingBox();await touch('touchMove',{x:box.x+box.width/2,y:box.y+box.height-6});await page.waitForTimeout(700);await touch('touchEnd');
 assert.equal(await selected(),6,'Edge autoscroll reaches the remaining ingredients');
 await nav.getByRole('button',{name:'人数を増やす',exact:true}).click();await nav.getByRole('button',{name:'買い物に追加（6）',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.ingredient-row input:checked').length===0);
 await nav.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByRole('button',{name:'買い物',exact:true}).click();await page.locator('.shopping-row').nth(5).waitFor();assert.match(await page.locator('.shopping-list').innerText(),/300 g/,'Shopping quantities follow the dock serving value');
 // Wait for the shopping toast to stop covering the first row before mouse input.
 await page.locator('.uchino-toast').waitFor({state:'detached'});
 // Mouse long-press uses the same sweep, and touch cancellation leaves no stuck state.
 await page.getByRole('button',{name:'レシピ',exact:true}).click();await page.locator('.recipe-open').first().click();await page.waitForTimeout(650);await positionList();const first=await point(0),third=await point(2);await page.mouse.move(first.x,first.y);await page.mouse.down();await page.waitForTimeout(380);await page.mouse.move(third.x,third.y);await page.mouse.up();assert.equal(await selected(),3);
 await hold(0);await touch('touchCancel');assert.equal(await page.locator('.ingredient-list[data-selecting]').count(),0);await rows.nth(4).tap();assert.equal(await rows.nth(4).locator('input').isChecked(),true);
 // A long ingredient list verifies actual scrolling in both directions.
 await nav.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('uchino',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),get=store.get('demo-guest:recipe:sample-ginger');get.onsuccess=()=>{const row=get.result,id='long-sweep';store.put({...row,key:`demo-guest:recipe:${id}`,id,data:{...row.data,id,title:'たくさんの材料',ingredients:Array.from({length:30},(_,i)=>({name:`材料${i+1}`,quantity:'1',unit:'個'}))}});};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}));
 await page.reload();await page.locator('.recipe-open').filter({hasText:'たくさんの材料'}).click();await page.waitForTimeout(650);await positionList();
 const scrollStart=await page.locator('.card-panel').evaluate(el=>el.scrollTop);await hold(0);const viewport=await page.locator('.card-panel').boundingBox();await touch('touchMove',{x:viewport.x+viewport.width/2,y:viewport.y+viewport.height-6});
 await page.waitForFunction(start=>document.querySelector('.card-panel').scrollTop>start+240&&document.querySelectorAll('.ingredient-row input:checked').length>=16,scrollStart,{timeout:5000});
 const scrolled=await page.locator('.card-panel').evaluate(el=>el.scrollTop);assert.ok(scrolled>scrollStart+200,`Long-list sweep scrolls down: ${scrollStart} -> ${scrolled}`);
 const header=await page.locator('.card-panel-header').boundingBox();await touch('touchMove',{x:viewport.x+viewport.width/2,y:header.y+header.height+6});await page.waitForFunction(scrolled=>document.querySelector('.card-panel').scrollTop<scrolled-100,scrolled,{timeout:3000});await touch('touchEnd');
 assert.deepEqual(errors,[]);console.log('PASS: sharp edge-to-edge photos in both themes, recipe title header, shaded cards, pink favorites, responsive serving dock, scaled quantities, touch sweep/retrace/deselect, tap/keyboard/mouse, scroll vs hold, edge autoscroll, cancellation, shopping add.');
}catch(error){failed=true;console.error(error);for(const context of browser.contexts()){const page=context.pages()[0];if(page){await page.screenshot({path:'test-results/recipe-detail-failure.png'}).catch(()=>{});console.error((await page.locator('body').innerText()).slice(-1800));}}}finally{await browser.close();process.exit(failed?1:0);}
