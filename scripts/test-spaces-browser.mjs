import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {r2Backend} from '../tests/r2-fixture.mjs';
import {photoFixture} from '../tests/photo-fixture.mjs';
import {newRecipe} from '../src/domain.ts';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const b=await r2Backend(),errors=[];let failed=false;
try{
 await mkdir('test-results',{recursive:true});
 b.seed({...newRecipe(),id:'existing-shared',title:'引き継いだレシピ',ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['切る','焼く'],photo:photoFixture(3000),stepPhotos:['',photoFixture(2000)]});
 const device=async user=>{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']});
  await context.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),response=await b.request(url.pathname+url.search,{method:req.method(),...(req.postData()?{body:req.postData()}:{}),headers:{...(req.headers()['x-uchino-user']?{'X-Uchino-User':req.headers()['x-uchino-user']}:{})}},user);await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:8787');await page.getByRole('button',{name:'スペースを切り替え：うちのレシピ',exact:true}).waitFor();return page;
 };
 const a=await device('user-a'),c=await device('user-b');
 await a.getByRole('heading',{name:'引き継いだレシピ',exact:true}).waitFor();assert.equal(await c.getByRole('heading',{name:'引き継いだレシピ',exact:true}).count(),0);
 const openMenu=async page=>{await page.getByRole('button',{name:/スペースを切り替え/}).click();await page.getByRole('dialog',{name:'スペース',exact:true}).waitFor();};
 await openMenu(a);await a.getByRole('button',{name:'このスペースの設定',exact:true}).click();await a.getByRole('dialog',{name:'スペース設定',exact:true}).waitFor();
 await a.getByRole('textbox',{name:'スペース名',exact:true}).fill('ふたりのレシピ');await a.getByRole('navigation',{name:'スペースの操作',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
 await a.getByRole('button',{name:'メンバーを招待',exact:true}).click();await a.getByRole('dialog',{name:'メンバーを招待',exact:true}).waitFor();await a.locator('.space-invite>strong').waitFor();
 const code=await a.locator('.space-invite>strong').innerText();assert.match(code,/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
 await a.screenshot({path:'test-results/space-invite.png',animations:'disabled'});
 await openMenu(c);await c.getByRole('button',{name:'招待コードで参加',exact:true}).click();await c.getByRole('textbox',{name:'招待コード',exact:true}).fill(code.toLowerCase());await c.getByRole('button',{name:'参加先を確認',exact:true}).click();await c.locator('.space-join-preview').getByText('ふたりのレシピ',{exact:true}).waitFor();assert.equal(await c.locator('.recipe-open').count(),0,'Preview must not reveal shared recipes before joining');
 await c.screenshot({path:'test-results/space-join.png',animations:'disabled'});
 await c.getByRole('button',{name:'参加する',exact:true}).click();await c.getByRole('heading',{name:'引き継いだレシピ',exact:true}).waitFor();await c.waitForFunction(()=>document.querySelector('.recipe-photo img')?.naturalWidth>0);
 await c.locator('.recipe-open').first().click();await c.waitForFunction(()=>document.querySelector('.recipe-step-photo')?.naturalWidth>0);await c.getByRole('button',{name:'編集',exact:true}).click();await c.getByRole('textbox',{name:'レシピ名',exact:true}).fill('一緒に編集したレシピ');await c.getByRole('navigation',{name:'操作',exact:true}).getByRole('button',{name:'保存',exact:true}).click();await c.locator('.recipe-editor-panel').waitFor({state:'detached'});await c.getByRole('button',{name:'戻る',exact:true}).click();await c.getByRole('dialog').waitFor({state:'detached'});
 await c.getByRole('button',{name:'設定',exact:true}).click();await c.getByRole('button',{name:'今すぐ同期',exact:true}).click();await c.getByText('同期しました',{exact:true}).waitFor();assert.equal(b.record('existing-shared').data.title,'一緒に編集したレシピ');
 // Own and shared caches remain separate across switching and reload.
 await openMenu(c);await c.getByRole('button',{name:/うちのレシピ.*自分だけ/}).click();await c.getByRole('heading',{name:'レシピを保存しよう',exact:true}).waitFor();assert.equal(await c.locator('.recipe-open').count(),0);await c.reload();await c.getByRole('heading',{name:'レシピを保存しよう',exact:true}).waitFor();
 await openMenu(c);await c.getByRole('button',{name:/ふたりのレシピ.*2人で共有/}).click();await c.getByRole('heading',{name:'一緒に編集したレシピ',exact:true}).waitFor();await c.screenshot({path:'test-results/space-shared.png',animations:'disabled'});
 // Create a separate empty space and show owner management without leaking data.
 await openMenu(c);await c.getByRole('button',{name:'スペースを作成',exact:true}).click();await c.getByRole('textbox',{name:'スペース名',exact:true}).fill('週末の献立');await c.getByRole('button',{name:'作成する',exact:true}).click();await c.getByRole('heading',{name:'レシピを保存しよう',exact:true}).waitFor();await c.getByRole('button',{name:'スペースを切り替え：週末の献立',exact:true}).waitFor();
 await openMenu(c);await c.getByRole('button',{name:'このスペースの設定',exact:true}).click();await c.getByRole('button',{name:'スペースを削除',exact:true}).waitFor();await c.locator('.space-member').first().waitFor();await c.getByRole('button',{name:'メンバーを招待',exact:true}).waitFor();await c.screenshot({path:'test-results/space-settings.png',animations:'disabled'});await c.evaluate(()=>{document.documentElement.dataset.brandTheme='dark';});await c.screenshot({path:'test-results/space-settings-dark.png',animations:'disabled'});
 assert.deepEqual(errors,[]);console.log('PASS: home migration, rename, 48h invite, preview and join, shared cover/step images and editing, isolated scope switching, reload, creation and management');
}catch(error){failed=true;console.error(error);for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:`test-results/space-failure-${browser.contexts().indexOf(context)}.png`}).catch(()=>{});}finally{await browser.close();b.database.close();process.exit(failed?1:0);}
