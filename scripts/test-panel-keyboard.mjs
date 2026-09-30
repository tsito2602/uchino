// Checks the iOS focus-guard event contract in Chromium. This cannot reproduce
// Safari's native keyboard or compositor pan; those still require an iPhone.
import {strict as assert} from 'node:assert';
import './preview.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failed=false;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  const viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});
  window.testViewport=viewport;Object.defineProperty(window,'visualViewport',{value:viewport});
 });
 await page.goto('http://127.0.0.1:8787');await page.getByRole('button',{name:'この端末で使う',exact:true}).click();
 await page.emulateMedia({reducedMotion:'reduce'});
 const keyboard=async height=>{await page.evaluate(height=>{window.testViewport.height=height;window.testViewport.dispatchEvent(new Event('resize'));},height);await page.waitForTimeout(80);};
 const close=async()=>{
  await page.evaluate(()=>document.activeElement?.blur());await keyboard(844);
  await page.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 };
 const visible=async field=>{
  await page.waitForTimeout(80);
  const bounds=await field.boundingBox(),panel=await page.getByRole('dialog').boundingBox(),dock=await page.locator('.floating-nav-host').boundingBox();
  assert.ok(bounds.y>=panel.y+50&&bounds.y+bounds.height<=dock.y-16,'Only the form scrolls to reveal the editor above the dock');
  assert.equal(await field.evaluate(el=>el.style.transform),'','The editor returns to its normal position after focus');
  assert.equal(470-dock.y-dock.height,8,'All panels use the same keyboard-to-dock gap');
  for(const selector of ['.floating-viewport','.floating-nav-host','.card-panel-backdrop'])assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 };
 const tapField=async field=>{
  await field.scrollIntoViewIfNeeded();
  await field.evaluate(el=>{window.lastTouchEnd=null;el.addEventListener('touchend',event=>{window.lastTouchEnd={prevented:event.defaultPrevented,focused:document.activeElement===el};},{once:true});});
  await field.tap();
  assert.deepEqual(await page.evaluate(()=>window.lastTouchEnd),{prevented:true,focused:true},'A real tap focuses synchronously and cancels native centering');
  const fullPanel=await page.getByRole('dialog').boundingBox();
  await keyboard(470);assert.deepEqual(await page.getByRole('dialog').boundingBox(),fullPanel,'The panel keeps its geometry when the keyboard opens');await visible(field);
 };
 await page.locator('main.shell').evaluate(el=>el.style.minHeight='1600px');await page.evaluate(()=>window.scrollTo(0,200));
 await page.getByRole('button',{name:'レシピの検索・絞り込み',exact:true}).click();
 assert.equal(await page.evaluate(()=>scrollY),0,'A scrolled page is anchored while the panel is open');
 await tapField(page.getByRole('searchbox',{name:'レシピを検索'}));await close();
 assert.equal(await page.evaluate(()=>scrollY),200,'Closing restores the original page position');
 await page.locator('main.shell').evaluate(el=>el.style.removeProperty('min-height'));await page.evaluate(()=>window.scrollTo(0,0));
 await page.getByRole('button',{name:'買い物',exact:true}).click();await page.locator('.dock-add').click();
 await tapField(page.getByLabel('買うもの',{exact:true}));
 await tapField(page.getByLabel('分量・個数',{exact:true}));await close();
 await page.getByRole('button',{name:'レシピ',exact:true}).click();await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'URLから取り込む'}).click();
 await tapField(page.getByLabel('レシピのURL',{exact:true}));await close();
 await page.locator('.dock-add').click();await page.getByRole('menuitem',{name:'手入力で追加',exact:true}).click();
 for(let i=0;i<5;i++)await page.locator('.editor-section').first().getByRole('button',{name:'追加',exact:true}).click();
 for(let i=0;i<2;i++)await page.locator('.editor-section').last().getByRole('button',{name:'追加',exact:true}).click();
 await tapField(page.getByLabel('材料4',{exact:true}));
 await page.keyboard.insertText('みりん');assert.equal(await page.getByLabel('材料4',{exact:true}).inputValue(),'みりん');
 // Re-tapping the active input must retain native caret/selection behavior.
 const active=page.getByLabel('材料4',{exact:true});await active.evaluate(el=>el.addEventListener('touchend',event=>window.activeTapPrevented=event.defaultPrevented,{once:true}));await active.tap();
 assert.equal(await page.evaluate(()=>window.activeTapPrevented),false);
 // Accessory next/previous follows the focus-event path, without touch events.
 for(const label of ['レシピ名','人数','材料6','手順3','参照URL','メモ']){
  const field=page.getByLabel(label,{exact:true});
  const topDuringFocus=await field.evaluate(el=>{
   let top;el.addEventListener('focus',()=>{top=el.getBoundingClientRect().top;},{once:true});el.focus();return top;
  });
  assert.ok(topDuringFocus<0,'The focus event prevents Safari from centering a deep field');await visible(field);
 }
 // Swiping from an inactive input must scroll without unexpectedly focusing it.
 const gestures=await page.getByLabel('材料1',{exact:true}).evaluate(el=>{
  const gesture=(count,dy)=>{
   const points=Array.from({length:count},(_,identifier)=>new Touch({identifier,target:el,clientX:100+identifier*30,clientY:200}));
   el.dispatchEvent(new TouchEvent('touchstart',{touches:points,changedTouches:points,bubbles:true,cancelable:true}));
   const moved=points.map(t=>new Touch({identifier:t.identifier,target:el,clientX:t.clientX,clientY:t.clientY+dy}));
   el.dispatchEvent(new TouchEvent('touchmove',{touches:moved,changedTouches:moved,bubbles:true,cancelable:true}));
   const end=new TouchEvent('touchend',{touches:[],changedTouches:moved,bubbles:true,cancelable:true});el.dispatchEvent(end);
   return{prevented:end.defaultPrevented,focused:document.activeElement===el};
  };return[gesture(1,-60),gesture(2,0)];
 });
 assert.deepEqual(gestures,[{prevented:false,focused:false},{prevented:false,focused:false}]);
 await close();
 // No focus interception remains after the last overlay releases its lock.
 assert.equal(await page.evaluate(()=>{
  const panel=document.createElement('div');panel.className='card-panel';panel.innerHTML='<input style="transform:translateX(2px)">';document.body.append(panel);
  const input=panel.firstElementChild;input.focus();const intact=input.style.transform==='translateX(2px)';panel.remove();return intact;
 }),true);
 assert.deepEqual(errors,[]);console.log('PASS: iOS focus guard for search, shopping, import and long recipe forms; caret, swipe, pinch and cleanup. Native iPhone keyboard remains a device check.');
}catch(error){failed=true;console.error(error);}finally{await browser.close();process.exit(failed?1:0);}
