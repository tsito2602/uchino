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
 const recipe={id:'import-content',title:'ささみのしそチーズ焼き',category:'主菜',servings:2,minutes:15,ingredients:[{name:'鶏ささ身',quantity:'4',unit:'本'},{name:'醤油',quantity:'1と1/2',unit:'大さじ',group:'A'},{name:'みりん',quantity:'1と1/2',unit:'大さじ',group:'A'},{name:'酒',quantity:'1と1/2',unit:'大さじ',group:'B'}],steps:['Aを混ぜる。','しばらく休ませる。','Bを加えて焼く。','盛りつける。'],memo:'',sourceUrl:'https://www.kikkoman.co.jp/homecook/test',favorite:false,createdAt:new Date().toISOString(),photo:''};
 const photoPath=process.env.RECIPE_PHOTO_FIXTURE||'public/recipe-photos/chicken.webp';
 const photo='data:image/'+(/\.jpe?g$/i.test(photoPath)?'jpeg':'webp')+';base64,'+(await readFile(photoPath)).toString('base64');
 const stepOne='data:image/webp;base64,'+(await readFile('public/recipe-photos/ginger.webp')).toString('base64');
 const stepThree='data:image/webp;base64,'+(await readFile('public/recipe-photos/salad.webp')).toString('base64');
 await page.route('**/api/import',route=>route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',result:{recipe,photo,stepPhotos:[{index:0,photo:stepOne},{index:2,photo:stepThree},{index:3,photo}],issues:[]}})+'\n'}));
 await page.goto('http://127.0.0.1:8787');await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'URLから取り込む',exact:true}).click();
 await page.getByRole('textbox',{name:'レシピのURL',exact:true}).fill(recipe.sourceUrl);await page.getByRole('button',{name:'読み取る',exact:true}).click();
 await page.getByRole('heading',{name:'取り込み内容を確認',exact:true}).waitFor();
 const preview=page.locator('.recipe-photo-select img').first();await preview.evaluate(img=>img.decode());
 const sourceRatio=await page.evaluate(src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth/img.naturalHeight);img.onerror=reject;img.src=src;}),photo);
 async function checkWholePhoto(locator){const sizes=await locator.evaluate(async img=>{await img.decode();const box=img.getBoundingClientRect();return {width:box.width,height:box.height,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight};});assert.ok(Math.abs(sizes.naturalWidth/sizes.naturalHeight-sourceRatio)<.01,'Compression preserves the source aspect ratio');assert.ok(Math.abs(sizes.width/sizes.height-sourceRatio)<.01,'The whole image keeps its aspect ratio on screen');}
 await checkWholePhoto(preview);
 const savedPhoto=await preview.getAttribute('src');assert.match(savedPhoto,/^data:image\/jpeg;base64,/);assert.ok(Buffer.from(savedPhoto.split(',')[1],'base64').length<=256000);
 const cards=page.locator('.editor-step-card');assert.equal(await cards.count(),4);assert.equal(await cards.nth(1).locator('img').count(),0);
 const importedStepPhotos=[];for(const card of [cards.nth(0),cards.nth(2),cards.nth(3)]){const img=card.locator('img');await img.evaluate(el=>el.decode());const src=await img.getAttribute('src');assert.match(src,/^data:image\/jpeg;base64,/);assert.ok(Buffer.from(src.split(',')[1],'base64').length<=80000);importedStepPhotos.push(src);}
 assert.equal(await page.getByRole('textbox',{name:'材料2',exact:true}).inputValue(),'醤油');assert.equal(await page.getByRole('textbox',{name:'グループ2',exact:true}).inputValue(),'A');
 await page.getByRole('textbox',{name:'グループ4',exact:true}).fill('仕上げ');
 for(const width of [320,390]){await page.setViewportSize({width,height:844});const dimensions=await page.locator('.recipe-form').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,overflow:[...el.querySelectorAll('*')].filter(v=>v.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(v=>({tag:v.tagName,cls:v.className,width:v.getBoundingClientRect().width,right:v.getBoundingClientRect().right}))}));assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify({viewport:width,...dimensions}));}
 await mkdir('test-results',{recursive:true});await page.setViewportSize({width:390,height:844});
 await page.locator('.editor-ingredient-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/editor-import-ingredients.png',animations:'disabled'});
 await page.locator('.editor-step-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/editor-import-steps.png',animations:'disabled'});
 await page.getByRole('button',{name:'手順2を削除',exact:true}).click();assert.equal(await cards.count(),3);assert.deepEqual(await cards.locator('img').evaluateAll(images=>images.map(i=>i.src)),importedStepPhotos);
 await page.getByRole('button',{name:'確認して保存',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelectorAll('.recipe-row').length===1);
 await page.reload();await page.locator('.recipe-open').first().waitFor();
 const cardPhoto=await page.locator('.recipe-open').first().evaluate(el=>{const img=el.querySelector('img'),card=el.getBoundingClientRect(),photo=img.getBoundingClientRect();return {width:card.width,height:card.height,photoWidth:photo.width,photoHeight:photo.height,fit:getComputedStyle(img).objectFit};});
 assert.equal(cardPhoto.fit,'cover');assert.ok(Math.abs(cardPhoto.width-cardPhoto.photoWidth)<1&&Math.abs(cardPhoto.height-cardPhoto.photoHeight)<1,'List image fills the entire card');
 await page.locator('.recipe-open').first().click();await page.locator('.ingredient-group').first().waitFor();
 const detailPhoto=await page.locator('.recipe-hero img').evaluate(async img=>{await img.decode();const box=img.getBoundingClientRect();return {width:box.width,height:box.height,fit:getComputedStyle(img).objectFit,naturalRatio:img.naturalWidth/img.naturalHeight};});
 assert.equal(detailPhoto.fit,'cover');assert.ok(Math.abs(detailPhoto.width-detailPhoto.height)<1,'Detail image is square');assert.ok(Math.abs(detailPhoto.naturalRatio-sourceRatio)<.01,'Display crop preserves the stored photo');
 await page.locator('.recipe-hero').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/recipe-photo-square.png',animations:'disabled'});
 assert.deepEqual(await page.locator('.ingredient-group').allTextContents(),['A','仕上げ']);assert.equal(await page.locator('.recipe-hero img').getAttribute('src'),savedPhoto);
 assert.deepEqual(await page.locator('.recipe-step-photo').evaluateAll(images=>images.map(i=>i.src)),importedStepPhotos);
 await page.getByRole('button',{name:'編集',exact:true}).click();await page.getByRole('heading',{name:'レシピを編集',exact:true}).waitFor();
 assert.equal(await page.locator('.editor-step-card').count(),3);
 await page.getByRole('button',{name:'手順1を削除',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'手順1',exact:true}).inputValue(),'Bを加えて焼く。');
 assert.equal(await page.locator('.editor-step-card').first().locator('img').getAttribute('src'),importedStepPhotos[1]);
 await page.getByRole('button',{name:'手順1の写真を削除',exact:true}).click();assert.equal(await page.locator('.editor-step-card').first().locator('img').count(),0);
 await page.getByLabel('手順1の写真を選択',{exact:true}).setInputFiles('public/recipe-photos/ginger.webp');await page.locator('.editor-step-card').first().locator('img').waitFor();
 const replacement=await page.locator('.editor-step-card').first().locator('img').getAttribute('src');assert.match(replacement,/^data:image\/jpeg;base64,/);
 await page.getByRole('button',{name:'手順を追加',exact:true}).click();await page.getByRole('textbox',{name:'手順3',exact:true}).fill('最後に味を調える。');
 assert.equal(await page.locator('.editor-step-card').last().locator('img').count(),0);
 await page.evaluate(()=>{document.activeElement?.blur();document.documentElement.dataset.brandTheme='dark';});await page.waitForTimeout(300);await page.locator('.editor-step-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/editor-detail-dark.png',animations:'disabled'});
 await page.locator('.context-primary').getByRole('button',{name:'保存',exact:true}).click();await page.locator('#recipe-form').waitFor({state:'detached'});
 await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('.recipe-step-photo')].map(i=>i.src))===JSON.stringify(expected),[replacement,importedStepPhotos[2]]);
 await page.reload();await page.locator('.recipe-open').first().click();await page.locator('.recipe-step-photo').first().waitFor();
 await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('.recipe-step-photo')].map(i=>i.src))===JSON.stringify(expected),[replacement,importedStepPhotos[2]]);
 assert.deepEqual(records.find(r=>r.kind==='recipe').data.stepPhotos,[replacement,importedStepPhotos[2],'']);
 await page.getByRole('button',{name:'人数を増やす',exact:true}).click();
 assert.match((await page.locator('.ingredient-row').nth(1).innerText()).replace(/\s/g,''),/大さじ2と1\/4/);
 await page.locator('.ingredient-row').nth(1).locator('input').check();await page.getByRole('button',{name:'買い物に追加（1）',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.ingredient-row input:checked'));
 await page.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByRole('button',{name:'買い物',exact:true}).click();await page.locator('.shopping-row').waitFor();
 assert.match(await page.locator('.shopping-list').innerText(),/醤油/);assert.doesNotMatch(await page.locator('.shopping-list').innerText(),/A|キッコーマン/);
 assert.equal(records.find(r=>r.kind==='recipe').data.ingredients[3].group,'仕上げ');assert.equal(records.find(r=>r.kind==='recipe').data.photo,savedPhoto);
 await page.getByRole('button',{name:'レシピ',exact:true}).click();await page.locator('.recipe-open').first().click();await page.locator('.recipe-hero img').evaluate(img=>img.decode());
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/import-content-mobile.png',animations:'disabled'});
 assert.deepEqual(errors,[]);console.log('PASS: imported cover and step photo compression, empty slots, both editors, deletion realignment, photo replacement, save/sync/reload, 320/390px layout, groups and shopping');
}catch(error){failed=true;console.error(error);}finally{await browser.close();process.exit(failed?1:0);}
