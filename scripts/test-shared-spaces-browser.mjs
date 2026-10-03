import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import app from '../dist/worker.mjs';
import {r2Backend} from '../tests/r2-fixture.mjs';
import {newRecipe} from '../src/domain.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin='http://127.0.0.1:8791';
const server=createServer(async(request,response)=>{const result=await app.fetch(new Request(new URL(request.url,origin),{headers:request.headers}),{APP_ENV:'staging'});response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));});
await new Promise(resolve=>server.listen(8791,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const backend=await r2Backend(),errors=[];let failed=false;
try{
 backend.seed({...newRecipe(),id:'shared-recipe',title:'みんなの卵焼き',ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['焼く']});
 const memberPage=async user=>{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>{Object.defineProperty(navigator,'share',{value:undefined});Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedInvitation=text;}}});});
  await context.route('**/api/**',async route=>{const r=route.request(),url=new URL(r.url());const response=await backend.request(url.pathname+url.search,{method:r.method(),headers:{...(r.headers()['x-uchino-user']?{'X-Uchino-User':r.headers()['x-uchino-user']}:{} )},...(r.postData()?{body:r.postData()}:{} )},user);await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);return page;
 };
 const a=await memberPage('user-a');await a.getByRole('heading',{name:'みんなの卵焼き',exact:true}).waitFor();
 await a.getByRole('button',{name:'設定',exact:true}).click();await a.getByRole('button',{name:'うちのレシピ',exact:true}).click();await a.getByRole('button',{name:'メンバーを招待',exact:true}).click();
 await a.locator('.space-invite strong').waitFor();const code=await a.locator('.space-invite strong').textContent();assert.match(code,/^[A-Z2-9]{4}(-[A-Z2-9]{4}){2}$/);
 assert.equal(await a.locator('.card-panel[aria-hidden="true"]').count(),1,'parent settings stay mounted behind invite');
 await a.getByRole('navigation',{name:'スペースの操作'}).getByRole('button',{name:'招待文をコピー',exact:true}).click();
 await a.waitForFunction(()=>window.copiedInvitation?.includes('48時間以内・1人用です。'));
 await mkdir('test-results',{recursive:true});await a.screenshot({path:'test-results/shared-invite-light.png'});
 await a.evaluate(()=>document.documentElement.dataset.brandTheme='dark');await a.setViewportSize({width:320,height:720});await a.screenshot({path:'test-results/shared-invite-dark-320.png'});
 assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await a.getByRole('navigation',{name:'スペースの操作'}).getByRole('button',{name:'戻る',exact:true}).click();await a.getByRole('dialog',{name:'メンバーを招待',exact:true}).waitFor({state:'detached'});await a.getByRole('dialog',{name:'スペース設定',exact:true}).waitFor();assert.equal(await a.locator('.card-panel[aria-hidden="true"]').count(),0);
 const b=await memberPage('user-b');await b.getByRole('button',{name:'スペースを切り替え：うちのレシピ',exact:true}).click();assert.equal(await b.getByText('自分だけ',{exact:true}).count(),0);
 await b.getByRole('button',{name:'招待コードで参加',exact:true}).click();await b.getByRole('textbox',{name:'招待コード',exact:true}).fill(code);
 await b.getByRole('button',{name:'参加先を確認',exact:true}).click();await b.locator('.space-join-preview').waitFor();assert.equal(await b.getByRole('heading',{name:'みんなの卵焼き',exact:true}).count(),0);
 await b.screenshot({path:'test-results/shared-join-preview.png'});await b.getByRole('button',{name:'参加する',exact:true}).click();
 await b.getByRole('heading',{name:'みんなの卵焼き',exact:true}).waitFor();await b.locator('.space-switch-screen').waitFor({state:'detached'});
 await b.locator('.recipe-favorite').click();await b.waitForTimeout(250);assert.equal(backend.record('shared-recipe').data.favorite,true);
 // New spaces are empty, preserve the joined space and switch with the same animation.
 await b.getByRole('button',{name:'スペースを切り替え：うちのレシピ',exact:true}).click();await b.getByRole('button',{name:'スペースを作成',exact:true}).click();await b.getByRole('textbox',{name:'スペース名',exact:true}).fill('週末のレシピ');await b.getByRole('button',{name:'作成する',exact:true}).click();
 await b.getByRole('button',{name:'スペースを切り替え：週末のレシピ',exact:true}).waitFor();await b.locator('.space-switch-screen').waitFor({state:'detached'});assert.equal(await b.getByRole('heading',{name:'みんなの卵焼き',exact:true}).count(),0);
 await b.reload();await b.getByRole('button',{name:'スペースを切り替え：週末のレシピ',exact:true}).waitFor();
 await b.getByRole('button',{name:'スペースを切り替え：週末のレシピ',exact:true}).click();
 const switchScreen=b.locator('.space-switch-screen').waitFor({state:'visible'});await b.locator('.space-options>button').filter({hasText:'2人で共有 · 参加中'}).click();await switchScreen;await b.locator('.space-switch-screen').waitFor({state:'detached'});await b.getByRole('heading',{name:'みんなの卵焼き',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: two-account invite preview/join, exact code/copy/expiry UI, nested settings, shared edit, space creation/switch/reload, mobile light and dark');
}catch(error){failed=true;console.error(error);for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:`test-results/shared-space-failure-${browser.contexts().indexOf(context)}.png`}).catch(()=>{});}finally{await browser.close();backend.database.close();server.close();process.exit(failed?1:0);}
