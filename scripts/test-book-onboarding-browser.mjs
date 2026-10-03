import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import app from '../dist/worker.mjs';
import {r2Backend} from '../tests/r2-fixture.mjs';
import {newRecipe} from '../src/domain.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin='http://127.0.0.1:8793';
const server=createServer(async(req,res)=>{const response=await app.fetch(new Request(new URL(req.url,origin),{headers:req.headers}),{APP_ENV:'staging'});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});
await new Promise(resolve=>server.listen(8793,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const b=await r2Backend({createBooks:false}),errors=[];let failed=false;
try{
 await mkdir('test-results',{recursive:true});
 const pageFor=async(user,width=390)=>{
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await context.route('**/api/**',async route=>{const r=route.request(),url=new URL(r.url());const response=await b.request(url.pathname+url.search,{method:r.method(),headers:{...(r.headers()['x-uchino-user']?{'X-Uchino-User':r.headers()['x-uchino-user']}: {})},...(r.postData()?{body:r.postData()}: {})},user);await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);return page;
 };
 const a=await pageFor('user-a');await a.getByRole('heading',{name:'レシピ帳をはじめよう',exact:true}).waitFor();
 assert.equal(await a.locator('.space-switcher').count(),0);assert.equal(await a.getByRole('navigation',{name:'メインメニュー'}).count(),0);
 assert.equal(b.database.prepare('SELECT count(*) n FROM recipe_spaces').get().n,0);
 await a.screenshot({path:'test-results/book-onboarding-light.png'});
 await a.getByRole('button',{name:/^レシピ帳を作る/}).click();await a.getByRole('textbox',{name:'レシピ帳名',exact:true}).fill('');assert.equal(await a.getByRole('button',{name:'作成する',exact:true}).isDisabled(),true);
 await a.getByRole('button',{name:'キーボードを閉じる',exact:true}).click();await a.getByRole('button',{name:'戻る',exact:true}).click();await a.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(b.database.prepare('SELECT count(*) n FROM recipe_spaces').get().n,0);
 await a.getByRole('button',{name:/^レシピ帳を作る/}).click();await a.getByRole('textbox',{name:'レシピ帳名',exact:true}).fill('ふたりのレシピ');await a.getByRole('button',{name:'作成する',exact:true}).click();
 await a.getByRole('button',{name:'スペースを切り替え：ふたりのレシピ',exact:true}).waitFor();await a.reload();await a.getByRole('button',{name:'スペースを切り替え：ふたりのレシピ',exact:true}).waitFor();
 const space=(await (await b.request('/api/spaces')).json()).spaces[0];assert.equal(space.name,'ふたりのレシピ');
 await b.put({...newRecipe(),id:'family-recipe',title:'ふたりの卵焼き',ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['焼く']});
 const code=(await (await b.request(`/api/spaces/${space.id}/invites`,{method:'POST',body:'{}'})).json()).code;
 const partner=await pageFor('user-b',320);await partner.getByRole('heading',{name:'レシピ帳をはじめよう',exact:true}).waitFor();
 await partner.evaluate(()=>document.documentElement.dataset.brandTheme='dark');await partner.screenshot({path:'test-results/book-onboarding-dark-320.png'});
 assert.equal(await partner.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await partner.context().setOffline(true);await partner.waitForFunction(()=>navigator.onLine===false);assert.equal(await partner.getByRole('button',{name:/^招待されたレシピ帳に参加する/}).isDisabled(),true);
 await partner.context().setOffline(false);await partner.getByRole('button',{name:/^招待されたレシピ帳に参加する/}).click();
 await partner.getByRole('textbox',{name:'招待コード',exact:true}).fill('XXXX-XXXX-XXXX');await partner.getByRole('button',{name:'参加先を確認',exact:true}).click();await partner.getByRole('alert').filter({hasText:'招待コードが無効'}).waitFor();
 assert.equal(b.database.prepare('SELECT count(*) n FROM recipe_spaces WHERE owner_id=?').get('user-b').n,0);
 await partner.getByRole('textbox',{name:'招待コード',exact:true}).fill(code);await partner.getByRole('button',{name:'参加先を確認',exact:true}).click();await partner.locator('.space-join-preview').getByText('ふたりのレシピ',{exact:true}).waitFor();
 await partner.waitForTimeout(700);await partner.screenshot({path:'test-results/book-onboarding-join-preview.png'});assert.equal(await partner.getByRole('heading',{name:'ふたりの卵焼き',exact:true}).count(),0);
 await partner.getByRole('button',{name:'参加する',exact:true}).click();await partner.getByRole('heading',{name:'ふたりの卵焼き',exact:true}).waitFor();await partner.reload();await partner.getByRole('heading',{name:'ふたりの卵焼き',exact:true}).waitFor();
 const joined=(await (await b.request('/api/spaces',{},'user-b')).json()).spaces;assert.deepEqual(joined.map(s=>s.id),[space.id]);assert.equal(b.database.prepare('SELECT count(*) n FROM recipe_spaces WHERE owner_id=?').get('user-b').n,0);
 await b.request(`/api/spaces/${space.id}/members/user-b`,{method:'DELETE',body:'{}'});await partner.evaluate(()=>window.dispatchEvent(new Event('uchino:spaces-refresh')));await partner.getByRole('heading',{name:'レシピ帳をはじめよう',exact:true}).waitFor();await partner.reload();await partner.getByRole('heading',{name:'レシピ帳をはじめよう',exact:true}).waitFor();
 // A legacy account with cloud recipes opens those recipes, skipping the choice.
 b.database.prepare('INSERT INTO user_data(user_id,kind,id,data,revision,deleted,edit_id) VALUES (?,?,?,?,7,0,?)').run('user-c','recipe','legacy-c',JSON.stringify({...newRecipe(),id:'legacy-c',title:'保存済みのレシピ',ingredients:[{name:'卵',quantity:'2',unit:'個'}],steps:['焼く']}),'legacy');
 const legacy=await pageFor('user-c');await legacy.getByRole('heading',{name:'保存済みのレシピ',exact:true}).waitFor();assert.equal(await legacy.locator('.book-onboarding').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: empty-account choice, cancel, named creation, retry/reload, offline actions, invalid/preview/confirm invite, joined-only selection/reload, revocation, legacy migration, mobile light/dark');
}catch(error){failed=true;console.error(error);for(const [index,context] of browser.contexts().entries())for(const page of context.pages())await page.screenshot({path:`test-results/book-onboarding-failure-${index}.png`}).catch(()=>{});}finally{await browser.close();b.database.close();server.close();process.exit(failed?1:0);}
