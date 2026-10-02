// Local UI integration with a mocked import response and sync server.
import {strict as assert} from 'node:assert';
import {mkdir,readFile} from 'node:fs/promises';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failed=false;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage(),errors=[],records=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/auth/session',route=>route.fulfill({json:{configured:true,user:{id:'test-content',email:'test@example.test',name:'Test'}}}));
 await page.route('**/api/data',route=>route.fulfill({json:{records}}));
 await page.route('**/api/data/*/*',async route=>{
  const {data,editId,deleted}=route.request().postDataJSON(),kind=route.request().url().split('/').at(-2),previous=records.findIndex(r=>r.id===data.id),revision=(previous<0?0:records[previous].revision)+1;
  const row={kind,id:data.id,data,deleted,revision,editId};if(previous<0)records.push(row);else records[previous]=row;
  await route.fulfill({json:{revision}});
 });
 await page.route('**/api/config',route=>route.fulfill({json:{ai:true,demoImport:false}}));
 const recipe={id:'import-content',title:'ささみのしそチーズ焼き',category:'主菜',servings:2,minutes:15,ingredients:[{name:'鶏ささ身',quantity:'4',unit:'本'},{name:'醤油',quantity:'1と1/2',unit:'大さじ',group:'A'},{name:'みりん',quantity:'1と1/2',unit:'大さじ',group:'A'},{name:'酒',quantity:'1と1/2',unit:'大さじ',group:'B'}],steps:['Aを混ぜる。','Bを加えて焼く。'],memo:'',sourceUrl:'https://www.kikkoman.co.jp/homecook/test',favorite:false,createdAt:new Date().toISOString(),photo:''};
 const photo='data:image/webp;base64,'+(await readFile('public/recipe-photos/chicken.webp')).toString('base64');
 await page.route('**/api/import',route=>route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',result:{recipe,photo,issues:[]}})+'\n'}));
 await page.goto('http://127.0.0.1:8787');await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'URLから取り込む',exact:true}).click();
 await page.getByRole('textbox',{name:'レシピのURL',exact:true}).fill(recipe.sourceUrl);await page.getByRole('button',{name:'読み取る',exact:true}).click();
 await page.getByRole('heading',{name:'取り込み内容を確認',exact:true}).waitFor();
 const preview=page.locator('.recipe-photo-select img');await preview.evaluate(img=>img.decode());
 const savedPhoto=await preview.getAttribute('src');assert.match(savedPhoto,/^data:image\/jpeg;base64,/);assert.ok(Buffer.from(savedPhoto.split(',')[1],'base64').length<=256000);
 assert.equal(await page.getByRole('textbox',{name:'材料2',exact:true}).inputValue(),'醤油');assert.equal(await page.getByRole('textbox',{name:'グループ2',exact:true}).inputValue(),'A');
 await page.getByRole('textbox',{name:'グループ4',exact:true}).fill('仕上げ');
 for(const width of [320,390]){await page.setViewportSize({width,height:844});const dimensions=await page.locator('.recipe-form').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,overflow:[...el.querySelectorAll('*')].filter(v=>v.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(v=>({tag:v.tagName,cls:v.className,width:v.getBoundingClientRect().width,right:v.getBoundingClientRect().right}))}));assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify({viewport:width,...dimensions}));}
 await page.getByRole('button',{name:'確認して保存',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelectorAll('.recipe-row').length===1);
 await page.reload();await page.locator('.recipe-open').first().click();await page.locator('.ingredient-group').first().waitFor();
 assert.deepEqual(await page.locator('.ingredient-group').allTextContents(),['A','仕上げ']);assert.equal(await page.locator('.recipe-hero img').getAttribute('src'),savedPhoto);
 await page.getByRole('button',{name:'人数を増やす',exact:true}).click();
 assert.match((await page.locator('.ingredient-row').nth(1).innerText()).replace(/\s/g,''),/大さじ2と1\/4/);
 await page.locator('.ingredient-row').nth(1).locator('input').check();await page.getByRole('button',{name:'買い物に追加（1）',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.ingredient-row input:checked'));
 await page.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByRole('button',{name:'買い物',exact:true}).click();await page.locator('.shopping-row').waitFor();
 assert.match(await page.locator('.shopping-list').innerText(),/醤油/);assert.doesNotMatch(await page.locator('.shopping-list').innerText(),/A|キッコーマン/);
 assert.equal(records.find(r=>r.kind==='recipe').data.ingredients[3].group,'仕上げ');assert.equal(records.find(r=>r.kind==='recipe').data.photo,savedPhoto);
 await page.getByRole('button',{name:'レシピ',exact:true}).click();await page.locator('.recipe-open').first().click();await page.locator('.recipe-hero img').evaluate(img=>img.decode());
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/import-content-mobile.png',animations:'disabled'});
 assert.deepEqual(errors,[]);console.log('PASS: imported photo compression, group edit/save/reload, mobile layout, servings and shopping names');
}catch(error){failed=true;console.error(error);}finally{await browser.close();process.exit(failed?1:0);}
