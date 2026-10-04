// Run after npm run bundle:worker.
import {strict as assert} from 'node:assert';
import {mkdir} from 'node:fs/promises';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('test-results',{recursive:true});let failed=false;
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:8787');await page.evaluate(()=>localStorage.setItem('uchino-device-mode','true'));await page.reload();await page.getByRole('button',{name:'サンプルを見てみる',exact:true}).click();await page.locator('.recipe-row').nth(2).waitFor();
 await page.locator('.recipe-open').first().click();await page.waitForTimeout(650);
 const header=page.locator('.card-panel-header'),favorite=header.locator('.recipe-favorite'),nav=page.getByRole('navigation',{name:'操作',exact:true});
 assert.equal(await favorite.count(),1);const f=await favorite.boundingBox(),h=await header.boundingBox();assert.ok(Math.abs(h.x+h.width-f.x-f.width-12)<1&&f.width>=44&&f.height>=44,'Favorite stays at the header right edge with a full touch target');
 await favorite.tap();await page.waitForFunction(()=>document.querySelector('.card-panel-header .recipe-favorite')?.getAttribute('aria-pressed')==='true');assert.equal(await page.locator('.recipe-row .recipe-favorite').first().getAttribute('aria-pressed'),'true','Header favorite updates the list');
 await page.locator('.recipe-hero img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));await page.waitForTimeout(650);await page.screenshot({path:'test-results/header-favorite-light.png'});
 const row=page.locator('.ingredient-row').first(),checkbox=row.locator('input');await checkbox.check();assert.equal(await row.locator('.glass-checkbox').evaluate(el=>getComputedStyle(el).animationName),'check-bounce');assert.equal(await row.locator('.glass-checkbox-mark path').evaluate(el=>getComputedStyle(el).animationName),'check-draw');
 await page.waitForTimeout(500);assert.equal(await row.locator('.glass-checkbox-mark path').evaluate(el=>getComputedStyle(el).strokeDashoffset),'0px');await checkbox.focus();await page.keyboard.press('Space');assert.equal(await checkbox.isChecked(),false,'Native keyboard checkbox behavior is retained');
 const glass=async locator=>locator.evaluate(el=>{const style=getComputedStyle(el);return {background:style.backgroundColor,blur:style.backdropFilter,filter:style.filter};});
 for(const theme of ['light','dark']){
  await page.locator('html').evaluate((el,theme)=>{el.dataset.brandTheme=theme;el.style.colorScheme=theme;},theme);await page.waitForTimeout(200);
  for(const locator of [checkbox,page.locator('.recipe-steps li>span').first()]){const style=await glass(locator);assert.ok(style.blur.includes('blur(10px)'));assert.ok(style.background.includes('/ 0.52')||style.background.includes(', 0.52'),style.background);assert.equal(style.filter,'none','Text and check marks stay sharp');}
  if(theme==='dark')await page.waitForTimeout(650);if(theme==='dark')await page.screenshot({path:'test-results/header-favorite-dark.png'});
 }
 await page.locator('html').evaluate(el=>{el.dataset.brandTheme='light';el.style.colorScheme='light';});await nav.getByRole('button',{name:'編集',exact:true}).click();await page.getByLabel('レシピ名',{exact:true}).waitFor();await page.waitForTimeout(650);
 for(const locator of [page.getByLabel('レシピ名',{exact:true}),page.getByRole('combobox',{name:/^カテゴリ/}),page.getByLabel('分量1',{exact:true}),page.getByLabel('手順1',{exact:true}),page.locator('.step-edit>span').first()]){const style=await glass(locator);assert.ok(style.blur.includes('blur(10px)'));assert.equal(style.filter,'none');}
 await page.screenshot({path:'test-results/glass-recipe-form.png'});
 await nav.getByRole('button',{name:'戻る',exact:true}).click();await page.locator('.recipe-editor-panel').waitFor({state:'detached'});await page.waitForTimeout(650);await nav.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.waitForTimeout(650);await page.getByRole('button',{name:'レシピの検索・絞り込み',exact:true}).click();await page.waitForTimeout(650);
 assert.equal(await page.locator('.card-panel-header .lucide-search').count(),1);assert.equal(await page.getByRole('dialog').getByRole('button',{name:'条件をリセット',exact:true}).count(),0);
 const reset=nav.getByRole('button',{name:'条件をリセット',exact:true});assert.equal(await reset.isDisabled(),true);
 const rice=page.getByRole('group',{name:'カテゴリ',exact:true}).getByRole('button',{name:'主食',exact:true});assert.equal(await rice.locator('.recipe-rice-icon').count(),1);await rice.click();
 await page.getByRole('searchbox',{name:'レシピを検索'}).fill('ご飯');await page.getByRole('searchbox',{name:'レシピを検索'}).blur();const toggle=page.getByRole('button',{name:'お気に入りのみ',exact:true});await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'true');assert.ok((await toggle.locator('.filter-toggle').evaluate(el=>getComputedStyle(el,'::after').transitionTimingFunction)).includes('1.56'),'Toggle thumb has a spring-like easing');
 await page.waitForTimeout(650);await page.screenshot({path:'test-results/glass-filters.png'});
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});await page.waitForTimeout(100);const boxes=await nav.locator('.context-island').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));assert.equal(boxes.length,3);assert.ok(boxes.every((b,i)=>!i||b.x>=boxes[i-1].right)&&boxes.at(-1).right<=width,'Reset fits beside the result action at every width');}
 await reset.click();assert.equal(await reset.isDisabled(),true);assert.equal(await page.getByRole('searchbox',{name:'レシピを検索'}).inputValue(),'');assert.equal(await toggle.getAttribute('aria-pressed'),'false');assert.equal(await rice.getAttribute('aria-pressed'),'false');
 await page.emulateMedia({reducedMotion:'reduce'});await toggle.click();assert.equal(await toggle.locator('.filter-toggle').evaluate(el=>getComputedStyle(el,'::after').transitionDuration),'0s');assert.deepEqual(errors,[]);
 console.log('PASS: header favorite sync, animated accessible checkbox, translucent controls in both themes, rice/search icons, dock reset and animated filter toggle at 320–1280px.');
}catch(error){failed=true;console.error(error);for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:'test-results/panel-controls-failure.png'}).catch(()=>{});}finally{await browser.close();process.exit(failed?1:0);}
