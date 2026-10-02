// UI integration using saved recipe records and a mocked account/sync API; no AI calls.
import {strict as assert} from 'node:assert';
import {mkdir} from 'node:fs/promises';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
let failed=false;
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const recipe={id:'amount-check',title:'野菜と豚肉の炒め物',category:'主菜',servings:2,minutes:15,ingredients:[{name:'玉ねぎ',quantity:'100',unit:'g'},{name:'にんじん',quantity:'50',unit:'g'},{name:'ごぼう',quantity:'80',unit:'g'},{name:'キャベツ',quantity:'100',unit:'g'},{name:'醤油',quantity:'30',unit:'ml',group:'A'},{name:'酒',quantity:'20',unit:'ml',group:'A'},{name:'だし',quantity:'600',unit:'ml'},{name:'豚肉',quantity:'200',unit:'g'}],steps:['野菜を切る。','豚肉と野菜を炒め、Aを加える。'],memo:'',sourceUrl:'',favorite:false,createdAt:new Date().toISOString(),photo:'/recipe-photos/ginger.webp'};
 const records=[{kind:'recipe',id:recipe.id,data:recipe,revision:1,editId:'fixture',deleted:false}];
 await page.route('**/api/auth/session',r=>r.fulfill({json:{configured:true,user:{id:'test-amounts',email:'test@example.test',name:'Test'}}}));
 await page.route('**/api/config',r=>r.fulfill({json:{ai:true,demoImport:false}}));
 await page.route('**/api/data',r=>r.fulfill({json:{records}}));
 await page.route('**/api/data/*/*',async r=>{const {data,editId,deleted}=r.request().postDataJSON(),kind=r.request().url().split('/').at(-2),revision=1;records.push({kind,id:data.id,data,editId,deleted,revision});await r.fulfill({json:{revision}});});
 await page.goto('http://127.0.0.1:8787');await page.locator('.recipe-open').first().click();await page.locator('.ingredient-row').first().waitFor();
 const rows=page.locator('.ingredient-row');
 const amount=async i=>rows.nth(i).locator('.ingredient-quantity').evaluate(el=>{const copy=el.cloneNode(true);copy.querySelectorAll('[aria-hidden=true]').forEach(n=>n.remove());return copy.textContent.replace(/\s/g,'');});
 for(const [i,text] of [[0,'約1/2個（100g）'],[1,'約1/3本（50g）'],[2,'約1/2本（80g）'],[3,'約2枚（100g）'],[4,'大さじ2（30ml）'],[5,'大さじ1＋小さじ1（20ml）'],[6,'600ml'],[7,'200g']])assert.equal(await amount(i),text);
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  const overflow=await rows.evaluateAll(nodes=>nodes.flatMap(row=>{const box=row.getBoundingClientRect();return [...row.querySelectorAll('.ingredient-quantity,.ingredient-quantity-part')].filter(el=>el.getBoundingClientRect().right>box.right+1||el.getBoundingClientRect().left<box.left-1).map(el=>el.className);}));
  assert.deepEqual(overflow,[],`Amounts fit at ${width}px`);
  const heights=await rows.evaluateAll(nodes=>nodes.map(row=>row.getBoundingClientRect().height));
  assert.ok(Math.max(...heights)-Math.min(...heights)<1,`Inline reference amounts keep row heights equal at ${width}px: ${heights}`);
 }
 await page.setViewportSize({width:390,height:844});await mkdir('test-results',{recursive:true});
 async function showRow(i){await rows.nth(i).evaluate(el=>{const panel=el.closest('.card-panel');panel.scrollTop+=el.getBoundingClientRect().top-panel.querySelector('.card-panel-header').getBoundingClientRect().bottom-20;});}
 await showRow(0);await page.screenshot({path:'test-results/amount-vegetables-light.png',animations:'disabled'});
 await page.locator('html').evaluate(el=>{el.dataset.brandTheme='dark';el.style.colorScheme='dark';});await showRow(3);await page.screenshot({path:'test-results/amount-spoons-dark.png',animations:'disabled'});
 await page.getByRole('button',{name:'人数を増やす',exact:true}).click();
 assert.equal(await amount(0),'約3/4個（150g）');assert.equal(await amount(1),'約1/2本（75g）');assert.equal(await amount(4),'大さじ3（45ml）');assert.equal(await amount(5),'大さじ2（30ml）');
 await page.getByRole('button',{name:'人数を減らす',exact:true}).click();assert.equal(await amount(0),'約1/2個（100g）');
 await page.getByRole('button',{name:'人数を増やす',exact:true}).click();
 for(const index of [0,4,5])await rows.nth(index).locator('input').check();
 await page.getByRole('button',{name:'買い物に追加（3）',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.ingredient-row input:checked'));
 await page.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByRole('button',{name:'買い物',exact:true}).click();await page.locator('.shopping-row').nth(2).waitFor();
 while(records.filter(r=>r.kind==='shopping').length<3)await page.waitForResponse(r=>r.url().includes('/api/data/shopping/'));
 const shopping=Object.fromEntries(records.filter(r=>r.kind==='shopping').map(r=>[r.data.name,r.data.quantity]));
 assert.deepEqual(shopping,{'玉ねぎ':'約3/4 個（150 g）','醤油':'大さじ3（45 ml）','酒':'大さじ2（30 ml）'});
 await page.getByRole('button',{name:'レシピ',exact:true}).click();await page.locator('.recipe-open').first().click();await page.getByRole('button',{name:'編集',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'分量1',exact:true}).inputValue(),'100');assert.equal(await page.getByRole('textbox',{name:'単位1',exact:true}).inputValue(),'g');
 assert.equal(await page.getByRole('textbox',{name:'分量5',exact:true}).inputValue(),'30');assert.equal(await page.getByRole('textbox',{name:'単位5',exact:true}).inputValue(),'ml');
 assert.equal(records.filter(r=>r.kind==='recipe').length,1,'Viewing and shopping conversions never rewrite the recipe');assert.deepEqual(errors,[]);
 console.log('PASS: existing recipes, estimated pieces/leaves, exact mixed spoons, source amounts, serving changes, 320/390px layout, both themes, shopping, original editable data');
}catch(error){failed=true;console.error(error);}finally{await browser.close();process.exit(failed?1:0);}
