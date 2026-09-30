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
 await page.goto('http://127.0.0.1:8787');await page.getByRole('button',{name:'この端末で使う',exact:true}).click();
 const dock=page.getByRole('navigation',{name:'メインメニュー'});
 const dockBounds=await dock.boundingBox();assert.ok(dockBounds.width>=140&&dockBounds.width<=150,`Compact dock: ${dockBounds.width}`);assert.equal(dockBounds.height,56);
 await page.locator('.dock-add').click();await page.getByRole('menu').waitFor();await page.waitForTimeout(420);
 assert.equal(await page.locator('main.shell').evaluate(el=>el.inert),true);
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
 await page.locator('.recipe-open').first().click();await page.getByRole('button',{name:'人数を増やす',exact:true}).click();await page.getByRole('button',{name:'人数を増やす',exact:true}).click();assert.equal((await page.locator('.ingredient-row strong').innerText()).trim(),'4 個');
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:'閉じる',exact:true}).count(),0);
 assert.equal(await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'削除',exact:true}).count(),0);
 const edit=page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'編集',exact:true});assert.equal(await edit.innerText(),'');
 await page.waitForTimeout(650);await page.screenshot({path:'test-results/detail-actions.png',fullPage:true});
 await page.locator('.ingredient-row input').check();await page.getByRole('button',{name:'買い物に追加（1）',exact:true}).click();await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.getByRole('navigation',{name:'メインメニュー'}).getByRole('button',{name:'買い物',exact:true}).click();assert.equal(await page.locator('.shopping-row strong').innerText(),'卵');assert.equal(await page.locator('.shopping-row p').innerText(),'4 個');await page.getByRole('checkbox',{name:'卵を購入済みにする'}).click();
 await page.getByRole('navigation',{name:'メインメニュー'}).getByRole('button',{name:'設定',exact:true}).click();assert.equal((await dock.boundingBox()).width,dockBounds.width,'Settings keeps the navigation width');
 assert.equal(await page.getByRole('button',{name:'買い物を追加',exact:true}).count(),0);
 await page.waitForTimeout(650);await page.screenshot({path:'test-results/settings-light.png',fullPage:true});
 await page.getByRole('button',{name:'ダーク',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-brand-theme'),'dark');
 await page.waitForTimeout(650);await page.screenshot({path:'test-results/settings-dark.png',fullPage:true});
 await page.getByRole('button',{name:'ライト',exact:true}).click();await page.getByRole('navigation',{name:'メインメニュー'}).getByRole('button',{name:'レシピ',exact:true}).click();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.getByRole('heading',{name:'保存テストの卵焼き'}).waitFor();await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'保存テストの卵焼き'}).waitFor();await context.setOffline(false);
 for(const width of [360,390,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');await page.screenshot({path:`test-results/recipes-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:390,height:844});
 await page.locator('.recipe-open').first().click();await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'編集',exact:true}).click();await page.getByLabel('レシピ名',{exact:true}).waitFor();
 const remove=page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'削除',exact:true});await remove.waitFor();await page.waitForTimeout(650);
 assert.equal(await remove.evaluate(el=>getComputedStyle(el).color),'rgb(180, 35, 24)');
 const deleteBounds=await remove.boundingBox();const saveBounds=await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'保存',exact:true}).boundingBox();assert.ok(deleteBounds.x>saveBounds.x+saveBounds.width);
 await page.screenshot({path:'test-results/edit-actions.png',fullPage:true});
 page.once('dialog',dialog=>dialog.dismiss());await remove.click();assert.equal(await page.getByLabel('レシピ名',{exact:true}).inputValue(),'保存テストの卵焼き');
 page.once('dialog',dialog=>dialog.accept());await remove.click();await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(await page.locator('.recipe-row').count(),0);await page.reload();assert.equal(await page.locator('.recipe-row').count(),0);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'URLから取り込む'}).click();await page.getByLabel('レシピのURL').waitFor();
 await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(await page.locator('main.shell').evaluate(el=>el.inert),false);
 assert.deepEqual(errors,[]);console.log('PASS: create, reload persistence, serving scale, shopping, theme, offline PWA and widths 360/390/1280.');
}catch(error){failed=true;console.error(error);}finally{await browser.close();process.exit(failed?1:0);}
