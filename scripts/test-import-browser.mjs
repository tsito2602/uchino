// End-to-end import checks: real staging endpoint, review/save, cancellation,
// streamed success/error, production UI gating, and shared keyboard geometry.
import {strict as assert} from 'node:assert';
import {mkdir} from 'node:fs/promises';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('test-results',{recursive:true});
let failed=false;
try {
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{const vv=new EventTarget();Object.assign(vv,{height:innerHeight,offsetTop:0,scale:1});window.testViewport=vv;Object.defineProperty(window,'visualViewport',{value:vv});});
 await page.goto('http://127.0.0.1:8787');await page.evaluate(()=>localStorage.setItem('uchino-device-mode','true'));await page.reload();
 await page.getByRole('button',{name:'サンプルを見てみる',exact:true}).click();await page.locator('.recipe-row').nth(2).waitFor();
 const openImport=async()=>{await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'URLから取り込む',exact:true}).click();await page.getByRole('dialog').waitFor();};
 await openImport();await page.getByRole('button',{name:'デモで試す',exact:true}).click();
 await page.screenshot({path:'test-results/import-setup.png'});
 await page.getByRole('button',{name:'デモで読み取る',exact:true}).click();
 await page.locator('.soft-orbit-glow canvas').first().waitFor();
 assert.equal(await page.locator('.soft-orbit-glow canvas').count(),3);
 assert.equal(await page.locator('.import-border-beam').count(),1);
 assert.equal(await page.locator('.import-processing-label canvas').count(),1);
 for(const selector of ['.floating-viewport','.floating-nav-host','.card-panel-backdrop'])assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 await page.locator('.import-sorted-entry').first().waitFor();
 assert.ok(await page.locator('.import-sorted-entry').count()>0);
 // Cancellation stays in setup and prevents late transition to review.
 await page.getByRole('button',{name:'戻る',exact:true}).click();
 await page.getByRole('button',{name:'デモで読み取る',exact:true}).waitFor();
 assert.equal(await page.locator('.soft-orbit-glow').count(),0);
 assert.equal(await page.locator('.recipe-import-review').count(),0);
 await page.emulateMedia({reducedMotion:'reduce'});
 const began=Date.now();await page.getByRole('button',{name:'デモで読み取る',exact:true}).click();
 await page.getByRole('heading',{name:'取り込み内容を確認',exact:true}).waitFor();assert.ok(Date.now()-began<4000,'Reduced motion skips demo timing');
 assert.equal(await page.locator('.recipe-row').count(),3,'No automatic save');
 assert.equal(await page.getByRole('button',{name:'サンプルとして保存',exact:true}).isDisabled(),true);
 assert.equal(await page.locator('.import-issue').count(),2);
 await page.locator('html').evaluate(el=>el.setAttribute('data-brand-theme','dark'));
 await page.screenshot({path:'test-results/import-review-dark.png',animations:'disabled'});
 const original=page.getByRole('button',{name:/元のレシピ：/});assert.equal(await original.getAttribute('aria-expanded'),'false');await original.click();assert.equal(await original.getAttribute('aria-expanded'),'true');await original.click();
 const panelBefore=await page.getByRole('dialog').boundingBox();
 await page.getByRole('button',{name:'分量6を編集',exact:true}).click();await page.getByRole('textbox',{name:'分量6',exact:true}).fill('10');
 await page.evaluate(()=>{window.testViewport.height=470;window.testViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(120);
 const panelAfter=await page.getByRole('dialog').boundingBox(),dock=await page.locator('.floating-nav-host').boundingBox();
 assert.equal(panelAfter.height,panelBefore.height,'Review keeps the full panel when keyboard opens');assert.equal(844-dock.y-dock.height,8,'Review keeps the dock at the screen bottom when the keyboard opens');
 const focused=await page.getByRole('textbox',{name:'分量6',exact:true}).boundingBox();assert.ok(focused.y+focused.height<dock.y,'Focused field stays visible');
 await page.screenshot({path:'test-results/import-review-keyboard.png'});
 await page.evaluate(()=>{document.activeElement.blur();window.testViewport.height=844;window.testViewport.dispatchEvent(new Event('resize'));});
 await page.getByRole('textbox',{name:'単位6',exact:true}).fill('g');
 await page.getByRole('checkbox',{name:'人数を確認した',exact:true}).check();await page.getByRole('checkbox',{name:'分量6を確認した',exact:true}).check();
 await page.getByRole('button',{name:'サンプルとして保存',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(await page.locator('.recipe-row').count(),4);await page.locator('.recipe-open').first().click();assert.match(await page.locator('.ingredient-list').innerText(),/10 g/);
 await page.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 // Production configuration removes the demo affordance.
 await page.route('**/api/config',route=>route.fulfill({json:{ai:false,demoImport:false}}));await page.reload();await openImport();
 assert.equal(await page.getByRole('button',{name:'デモで試す',exact:true}).count(),0);
 // A separate signed-in session exercises real-import UI and the streaming protocol.
 const liveContext=await browser.newContext({viewport:{width:1200,height:900},reducedMotion:'reduce',serviceWorkers:'block'}),live=await liveContext.newPage();live.on('pageerror',error=>errors.push(error.message));
 await live.route('**/api/auth/session',route=>route.fulfill({json:{configured:true,user:{id:'test',email:'test@example.test',name:'Test'}}}));
 await live.route('**/api/data',route=>route.fulfill({json:{records:[]}}));await live.route('**/api/config',route=>route.fulfill({json:{ai:true,demoImport:false}}));
 await live.goto('http://127.0.0.1:8787');await live.locator('.dock-add').click();await live.getByRole('menuitem',{name:'本文から取り込む',exact:true}).click();
 const text='卵のソテー\n卵 2個\nフライパンで焼く';await live.getByRole('textbox',{name:'レシピの本文',exact:true}).fill(text);
 await live.route('**/api/import',route=>route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'error',error:'テストの読み取りエラー'})+'\n'}));
 await live.getByRole('button',{name:'読み取る',exact:true}).click();await live.getByRole('alert').waitFor();assert.equal(await live.getByRole('textbox',{name:'レシピの本文',exact:true}).inputValue(),text,'Retry preserves input');
 await live.unroute('**/api/import');
 const recipe={id:'import-test',title:'卵のソテー',category:'主菜',servings:2,minutes:5,ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['フライパンで焼く'],memo:'',sourceUrl:'',favorite:false,createdAt:new Date().toISOString()};
 await live.route('**/api/import',route=>route.fulfill({contentType:'application/x-ndjson',body:[{type:'phase',phase:'reading'},{type:'phase',phase:'sorting'},{type:'phase',phase:'checking'},{type:'result',result:{recipe,issues:[]}}].map(event=>JSON.stringify(event)).join('\n')+'\n'}));
 await live.getByRole('button',{name:'読み取る',exact:true}).click();await live.getByRole('heading',{name:'取り込み内容を確認',exact:true}).waitFor();
 await live.getByRole('button',{name:/元のレシピ：/}).click();assert.equal(await live.locator('.import-source pre').innerText(),text);assert.equal(await live.getByRole('button',{name:'確認して保存',exact:true}).isEnabled(),true);
 await live.screenshot({path:'test-results/import-review-desktop.png'});
 await live.getByRole('button',{name:'戻る',exact:true}).click();await live.getByRole('dialog').waitFor({state:'detached'});
 await live.locator('.dock-add').click();await live.getByRole('menuitem',{name:'画像から取り込む',exact:true}).click();
 await live.getByLabel('レシピ画像を選択',{exact:true}).setInputFiles('public/icon-192.png');
 await live.getByRole('button',{name:'読み取る',exact:true}).click();await live.getByRole('heading',{name:'取り込み内容を確認',exact:true}).waitFor();
 await live.getByRole('button',{name:/元の画像：/}).click();
 assert.match(await live.locator('.import-source img').getAttribute('src'),/^data:image\/png;base64,/,'Original uploaded image is retained through review');
 assert.deepEqual(errors,[]);console.log('PASS: demo animation/cancel/retry/review/save, production gate, source evidence, streaming errors and keyboard geometry');
} catch(error){failed=true;console.error(error);} finally {await browser.close();process.exit(failed?1:0);}
