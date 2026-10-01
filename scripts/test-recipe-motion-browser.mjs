// Run after npm run bundle:worker. Covers intermediate animation frames too.
import {strict as assert} from 'node:assert';
import {mkdir} from 'node:fs/promises';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('test-results',{recursive:true});
let failed=false;
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:8787');await page.getByRole('button',{name:'この端末で使う',exact:true}).click();await page.getByRole('button',{name:'サンプルを見てみる',exact:true}).click();await page.locator('.recipe-row').nth(2).waitFor();
 assert.equal(await page.locator('.recipe-row .recipe-category>svg').count(),3);
 await page.locator('.recipe-photo img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 // Pause the reveal: the photo and the glass must have exactly the same clip.
 await page.locator('.recipe-open').first().evaluate(button=>button.click());await page.locator('.recipe-detail-panel').waitFor();
 for(const time of [40,160,280]){
  const clips=await page.evaluate(time=>{const nodes=[document.querySelector('.card-panel-glass'),document.querySelector('.card-panel')];for(const animation of document.getAnimations()){animation.pause();animation.currentTime=time;}return nodes.map(node=>getComputedStyle(node).clipPath);},time);
  assert.notEqual(clips[0],'none');assert.equal(clips[0],clips[1],`Image and panel share the reveal boundary at ${time}ms`);
  if(time===160)await page.screenshot({path:'test-results/recipe-opening-midpoint.png'});
 }
 await page.evaluate(()=>document.getAnimations().forEach(animation=>{if(animation.playState==='paused')animation.play();}));await page.waitForTimeout(650);
 assert.equal(await page.locator('.card-panel-header h2').innerText(),'豚のしょうが焼き');assert.equal(await page.locator('.recipe-hero h3').count(),0,'No duplicate recipe title');assert.ok(!(await page.getByRole('dialog').innerText()).includes('人分'),'Servings are shown only in the dock');assert.equal(await page.locator('.recipe-hero .recipe-category>svg').count(),1);
 await page.screenshot({path:'test-results/recipe-title-and-category.png'});
 const nav=page.getByRole('navigation',{name:'操作',exact:true}),plus=nav.getByRole('button',{name:'人数を増やす',exact:true}),minus=nav.getByRole('button',{name:'人数を減らす',exact:true});
 await page.locator('.ingredient-row').first().evaluate(el=>{const scroll=el.closest('.card-panel');scroll.scrollTop+=el.getBoundingClientRect().top-scroll.querySelector('.card-panel-header').getBoundingClientRect().bottom-24;});
 const quantities=page.locator('.quantity-ticker-accessible');
 await plus.click();await page.waitForFunction(()=>document.querySelector('.quantity-ticker')?.dataset.settled==='false');assert.equal(await quantities.first().innerText(),'300');assert.equal(await quantities.nth(4).innerText(),'1と1/2');assert.equal(await page.locator('.quantity-ticker').nth(4).locator('[data-place=denominator-0]').evaluate(el=>parseFloat(el.style.top)),-2.2,'A new fraction never starts with a zero denominator');
 const spoon=await page.locator('.ingredient-quantity').nth(4).evaluate(el=>[...el.children].map(child=>child.className));assert.equal(spoon[1],'quantity-ticker','Spoon unit precedes its number');
 await page.screenshot({path:'test-results/quantity-reels.png'});
 await plus.click();await plus.click();await minus.click();await page.waitForFunction(()=>[...document.querySelectorAll('.quantity-ticker')].every(el=>el.dataset.settled==='true'));assert.equal(await quantities.first().innerText(),'400','Rapid changes settle on the latest quantity');
 await page.emulateMedia({reducedMotion:'reduce'});await minus.click();assert.equal(await page.locator('.quantity-ticker').first().getAttribute('data-settled'),'true');assert.equal(await quantities.first().innerText(),'300');await page.emulateMedia({reducedMotion:'no-preference'});
 await nav.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.waitForTimeout(650);
 // Switching tabs must not fade the persistent three-icon navigation.
 await page.getByRole('button',{name:'設定',exact:true}).evaluate(button=>button.click());await page.waitForTimeout(40);
 const transition=await page.locator('.thumb-dock-content:not([data-outgoing])').evaluate(el=>({animations:el.getAnimations().length,opacity:getComputedStyle(el).opacity,filter:getComputedStyle(el).filter}));
 assert.equal(transition.animations,0);assert.equal(transition.opacity,'1');assert.equal(transition.filter,'none','Browse tabs remain sharp throughout the morph');
 await page.waitForTimeout(650);
 await page.getByRole('button',{name:'レシピ',exact:true}).click();await page.waitForTimeout(650);await page.getByRole('button',{name:'レシピの検索・絞り込み',exact:true}).click();await page.waitForTimeout(650);assert.equal(await page.locator('.filter-categories button>svg').count(),7);await nav.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.waitForTimeout(650);
 await page.getByRole('button',{name:'レシピを追加',exact:true}).click();await page.getByRole('menu').waitFor();await page.waitForTimeout(420);
 assert.equal(await page.locator('.fuse-add-veil').evaluate(el=>getComputedStyle(el).backdropFilter),'blur(6px)');
 assert.equal(await page.locator('.floating-nav-host').evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+30,r.y+28)?.className;}),'fuse-add-veil','The blur veil covers the dock too');
 await page.screenshot({path:'test-results/add-menu-blurred-dock.png'});await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'detached'});assert.equal(await page.locator('.floating-nav-host').evaluate(el=>el.inert),false);
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'レシピを追加',exact:true}).click();assert.equal(await page.locator('.fuse-add-veil').evaluate(el=>getComputedStyle(el).backdropFilter),'blur(6px)');await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'detached'});
 assert.deepEqual(errors,[]);console.log('PASS: recipe title/category, synchronized photo reveal, animated fractions/rapid changes/reduced motion, stable browse tabs and whole-background menu blur.');
}catch(error){failed=true;console.error(error);for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:'test-results/recipe-motion-failure.png'}).catch(()=>{});}finally{await browser.close();process.exit(failed?1:0);}
