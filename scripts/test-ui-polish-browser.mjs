// Regression coverage for stable navigation and layout while values change.
import {strict as assert} from 'node:assert';
import {mkdir} from 'node:fs/promises';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('test-results',{recursive:true});let failed=false;
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8787');await page.getByRole('button',{name:'この端末で使う',exact:true}).click();await page.getByRole('button',{name:'サンプルを見てみる',exact:true}).click();await page.locator('.recipe-row').nth(2).waitFor();
 assert.ok(!(await page.locator('.recipe-list').innerText()).includes('人分'));
 await page.locator('.recipe-open').first().click();await page.waitForTimeout(650);
 const panel=page.getByRole('dialog'),nav=page.getByRole('navigation',{name:'操作',exact:true});
 assert.equal(await page.locator('.card-panel-header .recipe-favorite').evaluate(el=>getComputedStyle(el,'::before').display),'none');
 const spoon=page.locator('.ingredient-row').nth(4);await spoon.evaluate(el=>{const scroll=el.closest('.card-panel');scroll.scrollTop+=el.getBoundingClientRect().top-scroll.querySelector('.card-panel-header').getBoundingClientRect().bottom-24;});
 const ticker=spoon.locator('.quantity-ticker'),unit=spoon.locator('.ingredient-quantity>span').first(),before=await unit.boundingBox();
 const plus=nav.getByRole('button',{name:'人数を増やす',exact:true}),minus=nav.getByRole('button',{name:'人数を減らす',exact:true});
 await plus.evaluate(el=>el.click());
 const widths=await ticker.evaluate(el=>{const a=el.getAnimations().find(a=>a.effect.getKeyframes().some(f=>f.width));if(!a)return null;a.pause();const out=[];for(const time of [0,150,450,900]){a.currentTime=time;out.push({width:el.getBoundingClientRect().width,unit:el.previousElementSibling.getBoundingClientRect().x});}a.finish();return out;});
 assert.ok(widths,'Mixed fractions animate their layout width');assert.ok(Math.abs(widths[0].unit-before.x)<1,'The spoon label starts at its previous position');assert.ok(widths[0].width<widths[1].width&&widths[1].width<widths[2].width&&widths[2].width<widths[3].width);assert.ok(widths[0].unit>widths[1].unit&&widths[1].unit>widths[3].unit);
 await page.waitForTimeout(1050);assert.equal(await ticker.locator('.quantity-ticker-accessible').innerText(),'1と1/2');
 await minus.evaluate(el=>el.click());await page.waitForTimeout(100);await plus.evaluate(el=>el.click());await page.waitForTimeout(1100);assert.equal(await ticker.locator('.quantity-ticker-accessible').innerText(),'1と1/2');
 await page.emulateMedia({reducedMotion:'reduce'});await minus.click();assert.equal(await ticker.evaluate(el=>el.getAnimations().length),0);await page.emulateMedia({reducedMotion:'no-preference'});
 const checkboxes=page.locator('.ingredient-row input');await checkboxes.nth(4).check();await checkboxes.nth(5).check();
 assert.equal(await page.locator('.context-count-value').innerText(),'2');assert.equal(await page.locator('.context-count-value').evaluate(el=>getComputedStyle(el).animationName),'selection-count-pop');assert.equal(await page.locator('.thumb-dock-content:not([data-outgoing])').evaluate(el=>el.getAnimations().length),0,'Changing the selected count does not fade the whole dock');
 await nav.getByRole('button',{name:'買い物に追加（2）',exact:true}).click();await page.locator('.uchino-toast').waitFor();await page.waitForTimeout(400);
 const toast=await page.locator('.uchino-toast').boundingBox(),dock=await nav.boundingBox();assert.ok(toast.y>500&&toast.y+toast.height<dock.y,'Toast sits just above the bottom navigation');assert.ok((await page.locator('.uchino-toast').evaluate(el=>getComputedStyle(el).backdropFilter)).includes('blur(24px)'));
 await page.screenshot({path:'test-results/bottom-toast-and-quantity.png'});
 await nav.getByRole('button',{name:'戻る',exact:true}).click();await panel.waitFor({state:'detached'});await page.waitForTimeout(650);
 await page.getByRole('button',{name:'レシピの検索・絞り込み',exact:true}).click();await page.waitForTimeout(650);
 const reset=nav.getByRole('button',{name:'条件をリセット',exact:true});assert.equal(await nav.locator('.context-island').last().getAttribute('class'),'context-island context-reset');
 const search=page.getByRole('searchbox',{name:'レシピを検索'});assert.equal(await search.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await search.evaluate(el=>getComputedStyle(el).backdropFilter),'none');assert.ok((await page.locator('.recipe-search').evaluate(el=>getComputedStyle(el).backgroundColor)).includes('0.28'));
 const toggle=page.getByRole('button',{name:'お気に入りのみ',exact:true});
 for(const theme of ['light','dark']){await page.locator('html').evaluate((el,theme)=>el.dataset.brandTheme=theme,theme);for(let i=0;i<2;i++){await toggle.click();await page.waitForTimeout(250);assert.equal(await toggle.locator('.filter-toggle').evaluate(el=>getComputedStyle(el,'::after').backgroundColor),theme==='light'?'rgb(23, 23, 23)':'rgb(255, 255, 255)');}await page.screenshot({path:`test-results/search-controls-${theme}.png`});}
 await page.locator('html').evaluate(el=>el.dataset.brandTheme='light');await search.fill('豚');await search.blur();await reset.click();assert.equal(await search.inputValue(),'');
 await nav.getByRole('button',{name:'戻る',exact:true}).click();await panel.waitFor({state:'detached'});await page.waitForTimeout(650);
 await page.getByRole('button',{name:'買い物',exact:true}).evaluate(el=>el.click());
 for(const delay of [30,100,200]){await page.waitForTimeout(delay);const style=await page.locator('.thumb-dock-content:not([data-outgoing])').evaluate(el=>({opacity:getComputedStyle(el).opacity,filter:getComputedStyle(el).filter,animations:el.getAnimations().length}));assert.deepEqual(style,{opacity:'1',filter:'none',animations:0});}
 await page.waitForTimeout(500);
 const entries=page.locator('main .shopping-entry');assert.ok(await entries.count()>=2);
 // Both ordinary and final-item deletion must retain the row for its exit animation.
 while(await entries.count()){
  const entry=entries.first(),height=(await entry.boundingBox()).height;
  await entry.getByRole('button',{name:/を削除$/}).evaluate(el=>el.click());
  await page.waitForFunction(()=>!!document.querySelector('main .shopping-entry[inert]'));
  const leaving=page.locator('main .shopping-entry[inert]');await page.waitForTimeout(60);const midway=await leaving.evaluate(el=>({height:el.getBoundingClientRect().height,opacity:Number(getComputedStyle(el).opacity)}));
  assert.ok(midway.height>0&&midway.height<height&&midway.opacity<1,'Deleted item collapses and fades before removal');
  await leaving.waitFor({state:'detached'});
 }
 assert.equal(await page.getByRole('heading',{name:'買うものをまとめよう'}).count(),1);
 assert.deepEqual(errors,[]);console.log('PASS: hidden card servings, plain header heart, theme toggle, right-side reset, transparent search, stable tabs, smooth fraction width, animated count, bottom toast and deletion including the last row.');
}catch(e){failed=true;console.error(e);for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:'test-results/ui-polish-failure.png'}).catch(()=>{});}finally{await browser.close();process.exit(failed?1:0);}
