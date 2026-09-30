// Run against a local preview after `npm run bundle:worker`.
// Set PLAYWRIGHT_MODULE and CHROMIUM_PATH when using the Work cloud runtime.
import {strict as assert} from 'node:assert';
import {mkdir} from 'node:fs/promises';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('test-results',{recursive:true});
let failed=false;
try{
 const errors=[];const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const native=window.visualViewport;const viewport=new EventTarget();Object.assign(viewport,{height:innerHeight,offsetTop:0,scale:1});native?.addEventListener('resize',()=>{viewport.height=native.height;viewport.offsetTop=native.offsetTop;viewport.dispatchEvent(new Event('resize'));});window.testViewport=viewport;Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});});
 await page.goto('http://127.0.0.1:8787');await page.getByRole('button',{name:'この端末で使う',exact:true}).click();
 // Check the cancelable gesture itself: Chromium does not reproduce iOS root panning.
 const touchMove=async(selector,dy,count=1)=>page.locator(selector).evaluate((target,{dy,count})=>{
  const touches=Array.from({length:count},(_,identifier)=>new Touch({identifier,target,clientX:150+identifier*40,clientY:220}));
  target.dispatchEvent(new TouchEvent('touchstart',{touches,targetTouches:touches,changedTouches:touches,bubbles:true,cancelable:true}));
  const moved=touches.map(t=>new Touch({identifier:t.identifier,target,clientX:t.clientX,clientY:t.clientY+dy}));
  const event=new TouchEvent('touchmove',{touches:moved,targetTouches:moved,changedTouches:moved,bubbles:true,cancelable:true});
  target.dispatchEvent(event);target.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:moved,bubbles:true}));
  return event.defaultPrevented;
 },{dy,count});
 const clearSurround=async()=>{for(const selector of ['.floating-viewport','.floating-nav-host','.card-panel-backdrop','.card-panel-scrim','.fuse-add-veil'])for(const element of await page.locator(selector).all())assert.equal(await element.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)',selector);};
 const dock=page.getByRole('navigation',{name:'メインメニュー'});
 const dockBounds=await dock.boundingBox();assert.ok(dockBounds.width>=140&&dockBounds.width<=150,`Compact dock: ${dockBounds.width}`);assert.equal(dockBounds.height,56);
 // Holding the dock previews a different tab; release commits and leaving cancels.
 assert.equal(await page.locator('.page-heading > svg').count(),1);
 const centers=await dock.locator('button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};}));
 await page.mouse.move(centers[0].x,centers[0].y);await page.mouse.down();await page.waitForTimeout(500);await page.mouse.move(centers[2].x,centers[2].y,{steps:8});
 assert.equal(await dock.evaluate(el=>el.style.getPropertyValue('--selection-tab')),'2');assert.equal(await page.locator('.page-heading').innerText(),'レシピ');
 await page.mouse.up();assert.equal(await page.locator('.page-heading').innerText(),'設定');
 await page.mouse.move(centers[2].x,centers[2].y);await page.mouse.down();await page.mouse.move(centers[0].x,centers[0].y-90);await page.mouse.up();assert.equal(await page.locator('.page-heading').innerText(),'設定');
 await dock.getByRole('button',{name:'レシピ',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.page-heading').innerText(),'レシピ');
 await page.locator('.dock-add').click();await page.getByRole('menu').waitFor();await page.waitForTimeout(420);
 assert.equal(await page.locator('main.shell').evaluate(el=>el.inert),true);await clearSurround();
 assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).position),'fixed');
 const menuIcon=await page.getByRole('menuitem').last().locator('svg').boundingBox();const plusSlot=await page.locator('.browse-dock').boundingBox();assert.ok(Math.abs(menuIcon.x+menuIcon.width/2-(plusSlot.x+plusSlot.width-28))<1,`Menu expands from plus center: ${JSON.stringify({menuIcon,plusSlot,layout:await page.evaluate(()=>({innerWidth,clientWidth:document.documentElement.clientWidth,right:document.querySelector('.fuse-add-overlay').style.cssText,overlay:document.querySelector('.fuse-add-overlay').getBoundingClientRect().toJSON()}))})}`);
 await page.screenshot({path:'test-results/add-menu.png',fullPage:true});
 await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'detached'});
 assert.equal(await page.locator('main.shell').evaluate(el=>el.inert),false);
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
 assert.equal(await page.locator('.dock-add').evaluate(el=>el===document.activeElement),true);
 await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'手入力で追加',exact:true}).click();
 assert.equal(await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'削除',exact:true}).count(),0);
 await page.getByLabel('レシピ名',{exact:true}).fill('保存テストの卵焼き');await page.getByLabel('材料1',{exact:true}).fill('卵');await page.getByLabel('分量1',{exact:true}).fill('2');await page.getByLabel('単位1',{exact:true}).fill('個');await page.getByLabel('手順1',{exact:true}).fill('卵を混ぜて焼く。');
 await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.reload();await page.getByRole('heading',{name:'保存テストの卵焼き'}).waitFor();assert.equal(await page.locator('.recipe-row').count(),1);
 await page.locator('main.shell').evaluate(el=>el.style.minHeight='1600px');await page.evaluate(()=>window.scrollTo(0,200));
 // All recipe filtering is available from the bottom dock and persists on close.
 await page.getByRole('button',{name:'レシピの検索・絞り込み',exact:true}).click();
 await clearSurround();assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).position),'fixed');
 await page.getByRole('searchbox',{name:'レシピを検索'}).fill('見つからない料理');
 assert.equal(await page.getByRole('searchbox',{name:'レシピを検索'}).evaluate(el=>getComputedStyle(el).outlineStyle),'none');
 assert.equal(await page.locator('.recipe-search').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
 await page.getByRole('button',{name:'0件を表示',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(await page.locator('.recipe-row').count(),0);
 assert.equal(await page.evaluate(()=>scrollY),200,'Closing restores the background scroll');await page.locator('main.shell').evaluate(el=>el.style.removeProperty('min-height'));await page.evaluate(()=>window.scrollTo(0,0));
 await page.getByRole('button',{name:'レシピの検索・絞り込み',exact:true}).click();await page.getByRole('button',{name:'条件をリセット',exact:true}).click();
 await page.getByRole('searchbox',{name:'レシピを検索'}).fill('卵');await page.getByRole('button',{name:'お気に入りのみ',exact:true}).click();assert.equal(await page.getByRole('button',{name:'0件を表示',exact:true}).count(),1);
 await page.getByRole('button',{name:'条件をリセット',exact:true}).click();await page.waitForTimeout(650);await page.screenshot({path:'test-results/recipe-filters.png',fullPage:true});
 const filterBounds=await page.getByRole('dialog').boundingBox();assert.ok(filterBounds.y<=20&&filterBounds.height>700&&filterBounds.y+filterBounds.height<(await page.getByRole('navigation',{name:'操作'}).boundingBox()).y,JSON.stringify(filterBounds));
 const categoryGroup=page.getByRole('group',{name:'カテゴリ',exact:true});
 await categoryGroup.getByRole('button',{name:'副菜',exact:true}).click();assert.equal(await page.getByRole('button',{name:'0件を表示',exact:true}).count(),1);
 await categoryGroup.getByRole('button',{name:'主菜',exact:true}).click();
 assert.equal(await categoryGroup.getByRole('button',{pressed:true}).count(),2);assert.equal(await page.getByRole('button',{name:'1件を表示',exact:true}).count(),1);
 await categoryGroup.getByRole('button',{name:'主菜',exact:true}).click();assert.equal(await page.getByRole('button',{name:'0件を表示',exact:true}).count(),1);
 await categoryGroup.getByRole('button',{name:'副菜',exact:true}).click();assert.equal(await categoryGroup.getByRole('button',{name:'すべて',exact:true}).getAttribute('aria-pressed'),'true');
 await categoryGroup.getByRole('button',{name:'主菜',exact:true}).click();await categoryGroup.getByRole('button',{name:'副菜',exact:true}).click();await categoryGroup.getByRole('button',{name:'すべて',exact:true}).click();assert.equal(await categoryGroup.getByRole('button',{pressed:true}).count(),1);
 await page.getByRole('button',{name:'1件を表示',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(await page.locator('.recipe-row').count(),1);
 await page.locator('.recipe-open').first().click();await page.getByRole('button',{name:'人数を増やす',exact:true}).click();await page.getByRole('button',{name:'人数を増やす',exact:true}).click();assert.equal((await page.locator('.ingredient-row strong').innerText()).trim(),'4 個');
 await clearSurround();
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:'閉じる',exact:true}).count(),0);
 assert.equal(await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'削除',exact:true}).count(),0);
 const edit=page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'編集',exact:true});assert.equal(await edit.innerText(),'');
 await page.waitForTimeout(650);await page.screenshot({path:'test-results/detail-actions.png',fullPage:true});
 await page.locator('.ingredient-row input').check();await page.getByRole('button',{name:'買い物に追加（1）',exact:true}).click();await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.getByRole('navigation',{name:'メインメニュー'}).getByRole('button',{name:'買い物',exact:true}).click();assert.equal(await page.locator('.shopping-row strong').innerText(),'卵');assert.equal(await page.locator('.shopping-row p').innerText(),'4 個');await page.getByRole('checkbox',{name:'卵を購入済みにする'}).click();
 await page.locator('.dock-add').click();await page.getByLabel('買うもの',{exact:true}).waitFor();await clearSurround();
 await page.getByLabel('買うもの',{exact:true}).focus();await page.evaluate(()=>{Object.assign(window.testViewport,{height:470,offsetTop:0});window.testViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(650);
 assert.ok(await page.locator('.card-panel').evaluate(el=>el.scrollHeight<=el.clientHeight),'Short shopping form fits');
 const shortDock=await page.locator('.floating-nav-host').boundingBox();
 for(const [label,offsetTop] of [['分量・個数',70],['買うもの',10],['分量・個数',110]]){
  await page.getByLabel(label,{exact:true}).focus();await page.evaluate(offsetTop=>{window.testViewport.offsetTop=offsetTop;window.testViewport.dispatchEvent(new Event('scroll'));window.testViewport.dispatchEvent(new Event('resize'));},offsetTop);await page.waitForTimeout(100);
  assert.equal((await page.locator('.floating-nav-host').boundingBox()).y,shortDock.y,'Shopping fields share one dock position');
  const panel=await page.getByRole('dialog').boundingBox();assert.ok(Math.abs(shortDock.y-panel.y-panel.height-16)<1,'Panel ends above the dock with a clear gap');
 }

 for(const dy of [-60,60]){assert.equal(await touchMove('.card-panel-scroll',dy),true,'Short form cannot pan the root viewport');assert.equal(await touchMove('.context-primary button',dy),true,'Dock swipe cannot pan the root viewport');}
 assert.equal(await touchMove('.card-panel-scroll',40,2),false,'Pinch gestures remain available');
 assert.equal((await page.locator('.floating-nav-host').boundingBox()).y,shortDock.y);
 await page.getByRole('button',{name:'キーボードを閉じる',exact:true}).click();await page.evaluate(()=>{Object.assign(window.testViewport,{height:844,offsetTop:0});window.testViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(100);
 await page.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.getByRole('navigation',{name:'メインメニュー'}).getByRole('button',{name:'設定',exact:true}).click();assert.equal((await dock.boundingBox()).width,dockBounds.width,'Settings keeps the navigation width');
 assert.equal(await page.getByRole('button',{name:'買い物を追加',exact:true}).count(),0);
 await page.waitForTimeout(650);await page.screenshot({path:'test-results/settings-light.png',fullPage:true});
 const appearanceStart=await page.locator('.appearance-selection').boundingBox();
 await page.getByRole('button',{name:'ダーク',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-brand-theme'),'dark');
 await page.waitForTimeout(650);assert.ok((await page.locator('.appearance-selection').boundingBox()).x>appearanceStart.x+100);await page.screenshot({path:'test-results/settings-dark.png',fullPage:true});
 await page.getByRole('button',{name:'ライト',exact:true}).click();await page.getByRole('navigation',{name:'メインメニュー'}).getByRole('button',{name:'レシピ',exact:true}).click();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.getByRole('heading',{name:'保存テストの卵焼き'}).waitFor();await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'保存テストの卵焼き'}).waitFor();await context.setOffline(false);
 for(const width of [360,390,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');await page.screenshot({path:`test-results/recipes-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:390,height:844});
 await page.locator('.recipe-open').first().click();await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'編集',exact:true}).click();await page.getByLabel('レシピ名',{exact:true}).waitFor();
 const remove=page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'削除',exact:true});await remove.waitFor();await page.waitForTimeout(650);
 assert.equal(await remove.evaluate(el=>getComputedStyle(el).color),'rgb(180, 35, 24)');
 const deleteBounds=await remove.boundingBox();const saveBounds=await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'保存',exact:true}).boundingBox();assert.ok(deleteBounds.x>saveBounds.x+saveBounds.width);
 await page.screenshot({path:'test-results/edit-actions.png',fullPage:true});
 // Simulate the separate visual viewport used by mobile software keyboards.
 assert.ok(await page.locator('.card-panel input:not([type=checkbox]),.card-panel textarea,.card-panel select').evaluateAll(els=>els.every(el=>parseFloat(getComputedStyle(el).fontSize)>=16)));
 await page.getByLabel('手順1',{exact:true}).focus();await page.evaluate(()=>{Object.assign(window.testViewport,{height:470,offsetTop:35});window.testViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(200);
 const fieldBounds=await page.getByLabel('手順1',{exact:true}).boundingBox();const panelBounds=await page.getByRole('dialog').boundingBox();
 assert.ok(panelBounds.y>=0&&panelBounds.y+panelBounds.height<=470,JSON.stringify(panelBounds));assert.ok(fieldBounds.y>=panelBounds.y+50&&fieldBounds.y+fieldBounds.height<=panelBounds.y+panelBounds.height,JSON.stringify({fieldBounds,panelBounds}));
 const keyboardDock=await page.getByRole('navigation',{name:'操作'}).boundingBox();assert.ok(keyboardDock.y+keyboardDock.height<=470,JSON.stringify(keyboardDock));
 assert.equal(await page.getByLabel('手順1',{exact:true}).inputValue(),'卵を混ぜて焼く。');await page.screenshot({path:'test-results/keyboard-editor.png'});
 await clearSurround();
 // Exercise viewport notifications with deeply placed text/number fields.
 // Changing a mock offset does not emulate Safari's native focus pan.
 for(const [label,offsetTop] of [['レシピ名',0],['人数',60],['分量1',160],['単位1',110],['手順1',220]]){
  await page.getByLabel(label,{exact:true}).focus();await page.evaluate(offsetTop=>{window.testViewport.offsetTop=offsetTop;window.testViewport.dispatchEvent(new Event('scroll'));window.testViewport.dispatchEvent(new Event('resize'));},offsetTop);await page.waitForTimeout(100);
  const dockNow=await page.locator('.floating-nav-host').boundingBox(),panelNow=await page.getByRole('dialog').boundingBox();
  assert.equal(dockNow.y,keyboardDock.y,'Every recipe field has the same dock position');
  assert.ok(Math.abs(dockNow.y-panelNow.y-panelNow.height-16)<1,'Recipe glass stops above the dock');
  const field=await page.getByLabel(label,{exact:true}).boundingBox();assert.ok(field.y>=panelNow.y+50&&field.y+field.height<=panelNow.y+panelNow.height,'Focused editor stays visible');
 }
 // Text and numeric keyboards may have different heights; the bottom gap is shared.
 await page.evaluate(()=>{window.testViewport.height=510;window.testViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(100);
 const resizedDock=await page.locator('.floating-nav-host').boundingBox();assert.equal(510-resizedDock.y-resizedDock.height,8);
 await page.evaluate(()=>{Object.assign(window.testViewport,{height:470,offsetTop:35});window.testViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(100);
 // Long forms still scroll; only gestures escaping their top/bottom are canceled.
 await page.locator('.card-panel').evaluate(el=>el.scrollTop=0);
 assert.equal(await touchMove('.card-panel-scroll',50),true,'Top boundary blocks viewport pan');
 assert.equal(await touchMove('.card-panel-scroll',-50),false,'Long form can scroll down');
 const touchSession=await context.newCDPSession(page);
 await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:350}]});
 for(let y=335;y>=200;y-=15){await touchSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y}]});await page.waitForTimeout(20);}
 await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(400);
 assert.ok(await page.locator('.card-panel').evaluate(el=>el.scrollTop>0),'Native touch scroll moves the long form');
 assert.equal((await page.locator('.floating-nav-host').boundingBox()).y,keyboardDock.y,'Native form scroll keeps the dock stationary');
 await touchSession.detach();
 await page.locator('.card-panel').evaluate(el=>el.scrollTop=el.scrollHeight);
 assert.equal(await touchMove('.card-panel-scroll',-50),true,'Bottom boundary blocks viewport pan');
 assert.equal(await touchMove('.card-panel-scroll',50),false,'Long form can scroll back up');
 // A user's scroll must not be pulled back to the editor on viewport pan.
 await page.locator('.card-panel').evaluate(el=>el.scrollTop=0);
 for(const offsetTop of [40,28,50,35]){
  await page.evaluate(offsetTop=>{window.testViewport.offsetTop=offsetTop;window.testViewport.dispatchEvent(new Event('scroll'));},offsetTop);await page.waitForTimeout(60);
  assert.equal(await page.locator('.card-panel').evaluate(el=>el.scrollTop),0,'Viewport scroll does not reveal the input again');
  const navBounds=await page.getByRole('navigation',{name:'操作'}).boundingBox();assert.ok(Math.abs(navBounds.y-keyboardDock.y)<1,'Offset notifications do not alter the dock layout');
 }
 await page.getByLabel('手順1',{exact:true}).blur();await page.waitForTimeout(60);
 assert.equal((await page.getByRole('navigation',{name:'操作'}).boundingBox()).y,keyboardDock.y,'Blur does not drop the dock before the keyboard closes');
 await page.evaluate(()=>{Object.assign(window.testViewport,{height:innerHeight,offsetTop:0});window.testViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(100);
 page.once('dialog',dialog=>dialog.dismiss());await remove.click();assert.equal(await page.getByLabel('レシピ名',{exact:true}).inputValue(),'保存テストの卵焼き');
 page.once('dialog',dialog=>dialog.accept());await remove.click();await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(await page.locator('.recipe-row').count(),0);await page.reload();assert.equal(await page.locator('.recipe-row').count(),0);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'URLから取り込む'}).click();await page.getByLabel('レシピのURL').waitFor();await clearSurround();
 await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(await page.locator('main.shell').evaluate(el=>el.inert),false);
 assert.equal(await touchMove('main.shell',50),false,'Dismissal releases the touch guard');
 assert.deepEqual(errors,[]);console.log('PASS: create, reload persistence, serving scale, shopping, theme, offline PWA and widths 360/390/1280.');
}catch(error){failed=true;console.error(error);}finally{await browser.close();process.exit(failed?1:0);}
