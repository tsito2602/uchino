// Run after npm run bundle:worker. Uses the same Work cloud browser overrides as test-browser.mjs.
import {strict as assert} from 'node:assert';
import {mkdir} from 'node:fs/promises';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('test-results',{recursive:true});
let failed=false;
try{
 const errors=[],context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:8787');await page.getByRole('button',{name:'この端末で使う',exact:true}).click();
 await page.getByRole('button',{name:'サンプルを見てみる',exact:true}).click();await page.locator('.recipe-row').nth(2).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('.recipe-photo img')].every(image=>image.naturalWidth>0));
 await page.locator('.uchino-toast').waitFor({state:'detached'});
 for(const width of [320,360,390,1280]){
  await page.setViewportSize({width,height:844});
  const cards=await page.locator('.recipe-row').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
  assert.ok(Math.abs(cards[0].y-cards[1].y)<1&&cards[1].x>cards[0].x&&cards[2].y>cards[0].y,'Exactly two columns');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.screenshot({path:`test-results/photo-grid-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('html').evaluate(node=>node.setAttribute('data-brand-theme','dark'));
 await page.screenshot({path:'test-results/photo-grid-dark.png',fullPage:true});
 await page.locator('.recipe-open').first().click();await page.locator('.recipe-hero').waitFor();await page.waitForTimeout(600);
 assert.equal(await page.locator('.recipe-hero img').getAttribute('src'),'/recipe-photos/ginger.webp');
 await page.screenshot({path:'test-results/photo-detail-dark.png'});
 await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'編集',exact:true}).click();
 const photoInput=page.getByLabel('料理の写真を選択',{exact:true});await photoInput.waitFor({state:'attached'});
 await page.screenshot({path:'test-results/photo-editor.png'});
 await photoInput.setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
 await page.getByRole('alert').filter({hasText:'JPEG・PNG'}).waitFor();
 assert.equal(await page.locator('.recipe-photo-select img').getAttribute('src'),'/recipe-photos/ginger.webp','Bad file keeps current photo');
 // Keep conversion in flight while changing another field to catch stale draft overwrites.
 await page.evaluate(()=>{const encode=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,...args){return encode.call(this,blob=>setTimeout(()=>callback(blob),700),...args);};});
 await photoInput.setInputFiles('public/recipe-photos/chicken.webp');
 await page.getByLabel('レシピ名',{exact:true}).fill('写真を登録したレシピ');
 assert.equal(await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'保存',exact:true}).isDisabled(),true);
 await page.waitForFunction(()=>document.querySelector('.recipe-photo-select img')?.getAttribute('src')?.startsWith('data:image/jpeg;base64,'));
 assert.equal(await page.getByLabel('レシピ名',{exact:true}).inputValue(),'写真を登録したレシピ','Photo completion preserves recent text edits');
 const photo=await page.locator('.recipe-photo-select img').getAttribute('src');
 assert.ok(Buffer.from(photo.split(',')[1],'base64').length<=256000);
 // Clear keyboard focus so the dock action is available on mobile layouts.
 await page.getByLabel('レシピ名',{exact:true}).blur();
 await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.reload();await page.getByRole('heading',{name:'写真を登録したレシピ',exact:true}).waitFor();
 assert.equal(await page.locator('.recipe-row').first().locator('img').getAttribute('src'),photo);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.locator('.recipe-row').nth(2).waitFor();
 await context.setOffline(true);await page.reload();await page.locator('.recipe-row').nth(2).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('.recipe-photo img')].every(image=>image.naturalWidth>0));
 assert.equal(await page.locator('.recipe-photo img').count(),3,'Uploaded and demo photos display offline');
 await context.setOffline(false);
 await page.locator('.recipe-open').first().click();await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'編集',exact:true}).click();
 await page.getByRole('button',{name:'写真を削除',exact:true}).click();
 await page.getByRole('navigation',{name:'操作'}).getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.reload();await page.locator('.recipe-row').nth(2).waitFor();assert.equal(await page.locator('.recipe-row').first().locator('img').count(),0,'Removal persists');
 await page.locator('.recipe-favorite').first().click();await page.waitForFunction(()=>document.querySelector('.recipe-favorite')?.getAttribute('aria-pressed')==='true');assert.equal(await page.getByRole('dialog').count(),0,'Favorite does not open the card');
 assert.deepEqual(errors,[]);console.log('PASS: two columns at 320/360/390/1280, demo photos, detail, invalid upload, conversion race, upload persistence, offline images, deletion, favorite.');
}catch(error){failed=true;console.error(error);}finally{await browser.close();process.exit(failed?1:0);}
