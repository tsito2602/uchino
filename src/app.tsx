import {haptic} from './haptics';
import {useSpaces,type SpacesController} from './use-spaces';
import {RecipeBookOnboarding} from './recipe-book-onboarding';
import {useSpaceControls} from './space-controls';
import {spaceScope,type Space} from './spaces';
import {SpaceSwitchScreen} from './space-switch-screen';
import {SHOPPING_UNDO_MS} from './shopping-undo';
import {ShoppingList} from './shopping-list';
import {NumberReel} from './servings-count';
import {PhraseText} from './phrase-text';
import {useRecipeImport} from './recipe-import';
import {useEffect,useLayoutEffect,useState,useRef} from 'react';
import {cancelLanding,dissolve,holdLanding,playLanding} from './recipe-landing';
import {useGridFlip} from './grid-flip';
import {closePhoto,rememberCardPhoto} from './shared-photo';
import {PartnerOffer} from './once-card';
import {BookOpen,Search,Heart,Clock,ChevronRight,Plus,Check,ExternalLink,ShoppingBasket,Trash2,Link,ImagePlus,FileText,Pencil,RefreshCw,Download,LogOut,Cloud,Smartphone,ChefHat,Settings,RotateCcw,CookingPot,ChevronLeft} from 'lucide-react';
import {type Session} from './auth';
import {SettingsPage} from './settings-page';
import {categories,cookingToday,newRecipe,todayKey,validateRecord,type Recipe,type ShoppingItem} from './domain';
import {formatIngredientAmount} from './ingredient-amount';
import {useRecords,synchronize,prepareData,rows} from './storage';
import {demoScope,getDataMode,rememberDataMode,type DataMode} from './data-mode';
import {Dock,type Tab,type DockContext} from './dock';
import {Panel} from './panel';
import {FloatingViewport} from './floating-viewport';
import {FuseAddMenu,type AddOption} from './fuse-add-menu';
import {RecipeEditor} from './recipe-editor';
import {RecipePhoto} from './recipe-photo-view';
import {RecipeFavorite} from './recipe-favorite';
import {RecipeCategoryIcon,RiceBowl} from './recipe-category';
import {RecipeDetail} from './recipe-detail';
import {CookMode} from './cook-mode';
import {FloatingStatus} from './cook-timers-view';
import {PartnerPresence,usePartnerPresence} from './partner-presence';
import {useRouteTransition} from './kondo-route-motion';
import {panelOrigin,type PanelOrigin} from './use-panel-morph';
import {checkUpdate,applyUpdate} from './pwa';
type DetailView={kind:'detail';id:string;origin?:PanelOrigin};
type View=DetailView|{kind:'edit';draft:Recipe;isNew:boolean;parent?:DetailView;parentRecipe?:Recipe;fromImport?:boolean}|{kind:'cook';parent:DetailView;step:number}|{kind:'import'}|{kind:'shopping'}|{kind:'shopping-finish'}|{kind:'filters'};
export function App({session}:{session:Session}){
  const spaces=useSpaces(session);
  const [switching,setSwitching]=useState<Space|null>(null),[loadedScope,setLoadedScope]=useState('');
  const backgroundScopes=spaces.spaces.filter(space=>space.id!==spaces.space?.id).map(space=>spaceScope(session.user.id,space)).join('|');
  useEffect(()=>{if(session.local)return;let active=true;const sync=()=>{for(const scope of backgroundScopes.split('|').filter(Boolean))void rows(scope).then(async records=>{if(active&&records.some(row=>row.pending))await synchronize(scope);}).catch(()=>{});};sync();window.addEventListener('online',sync);const timer=setInterval(sync,30000);return()=>{active=false;clearInterval(timer);window.removeEventListener('online',sync);};},[backgroundScopes,session.local]);
  if(!session.local&&navigator.onLine&&(!spaces.ready||(!spaces.space&&!!spaces.error)))return <main className="shell"><p role={spaces.error?'alert':'status'}>{spaces.error||'レシピ帳を読み込んでいます…'}</p>{spaces.error&&<button className="secondary" onClick={()=>void spaces.refresh().catch(()=>{})}>再試行</button>}</main>;
  if(!session.local&&!spaces.space)return <RecipeBookOnboarding session={session} spaces={spaces}/>;
  const realScope=session.local?'guest':spaces.space?spaceScope(session.user.id,spaces.space):`user-${session.user.id}`;
  const controller={...spaces,select:(id:string)=>{const next=spaces.spaces.find(s=>s.id===id);if(next&&next.id!==spaces.space?.id){setLoadedScope('');setSwitching(next);}spaces.select(id);}};
  return <><ScopedApp key={realScope} session={session} realScope={realScope} spaces={controller} onReady={()=>setLoadedScope(realScope)}/>{switching&&<SpaceSwitchScreen space={switching} ready={loadedScope===realScope} onExited={()=>setSwitching(null)}/>}</>;
}
function ScopedApp({session,realScope,spaces,onReady}:{onReady:()=>void;session:Session;realScope:string;spaces:SpacesController}){
  const [mode,setMode]=useState<DataMode|null>(null),[tab,setTab]=useState<Tab>('recipes'),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setError('');void prepareData(realScope).then(async legacy=>{
    const selected=getDataMode(realScope)??(legacy?'demo':'real');
    if(selected==='demo')await prepareData(demoScope(realScope));
    if(active){rememberDataMode(realScope,selected);setMode(selected);}
  }).catch(cause=>{if(active)setError(cause.message);});return()=>{active=false;};},[realScope,attempt]);
  useEffect(()=>{if(error)onReady();},[error,onReady]);
  async function changeDataMode(next:DataMode){
    await prepareData(next==='demo'?demoScope(realScope):realScope);
    rememberDataMode(realScope,next);setMode(next);
  }
  if(!mode)return <main className="shell"><p role={error?'alert':'status'}>{error||'読み込んでいます…'}</p>{error&&<button className="secondary" onClick={()=>setAttempt(value=>value+1)}>再試行</button>}</main>;
  return <RecipeApp key={mode} onReady={onReady} spaces={spaces} session={session} realScope={realScope} dataMode={mode} onDataMode={changeDataMode} tab={tab} onTab={setTab}/>;
}
function RecipeApp({session,realScope,dataMode,onDataMode,tab,onTab,spaces,onReady}:{onReady:()=>void;spaces:SpacesController;session:Session;realScope:string;dataMode:DataMode;onDataMode:(mode:DataMode)=>Promise<void>;tab:Tab;onTab:(tab:Tab)=>void}){
  const [menuPhase,setMenuPhase]=useState<'closed'|'open'|'closing'>('closed');
  const pendingAdd=useRef<(()=>void)|null>(null);
  const addOptions:AddOption[]=[
    {id:'url',label:'URLから取り込む',icon:Link,onClick:()=>beginImport('url')},
    {id:'image',label:'画像から取り込む',icon:ImagePlus,onClick:()=>beginImport('image')},
    {id:'text',label:'本文から取り込む',icon:FileText,onClick:()=>beginImport('text')},
    {id:'manual',label:'手入力で追加',icon:Pencil,onClick:()=>open({kind:'edit',draft:newRecipe(),isNew:true})}
  ];
  function beginImport(mode:'url'|'image'|'text'){setImportMode(mode);open({kind:'import'});}
  function exitAddMenu(){setMenuPhase('closed');const action=pendingAdd.current;pendingAdd.current=null;action?.();}
  const scope=dataMode==='demo'?demoScope(realScope):realScope;
  const store=useRecords(scope);
  useEffect(()=>{if(store.ready||store.error)onReady();},[store.ready,store.error,onReady]);
  const accountStore=useRecords(realScope,false);
  const pending=accountStore.pending;
  const transitionRoute=useRouteTransition();
  const [query,setQuery]=useState(''),[selectedCategories,setSelectedCategories]=useState<string[]>([]),[favorites,setFavorites]=useState(false);
  const [view,setView]=useState<View|null>(null),[closing,setClosing]=useState(false),[formError,setFormError]=useState(''),[busy,setBusy]=useState(false),[photoBusy,setPhotoBusy]=useState(false),[notice,setNotice]=useState('');
  const [servings,setServings]=useState(2),[checked,setChecked]=useState<string[]>([]),[shopName,setShopName]=useState(''),[shoppingFocused,setShoppingFocused]=useState(false),[shoppingUndo,setShoppingUndo]=useState<{items:ShoppingItem[];message:string;expiresAt:number}|null>(null);
  // The empty state eases in only when a list was just emptied, not on every visit.
  const shoppingCount=useRef<number|null>(null),[shoppingEmptied,setShoppingEmptied]=useState(false);
  const shopNameInput=useRef<HTMLInputElement>(null),shoppingInFlight=useRef(false),shoppingComposing=useRef(false);
  const [importMode,setImportMode]=useState<'url'|'image'|'text'>('url'),[ai,setAI]=useState(false),[allowDemo,setAllowDemo]=useState(false),[updateReady,setUpdateReady]=useState(false);
  const today=todayKey();
  const recipes=store.rows.filter(r=>r.kind==='recipe').map(r=>r.data as Recipe).sort((a,b)=>Number(cookingToday(b,today))-Number(cookingToday(a,today))||b.createdAt.localeCompare(a.createdAt));
  const shopping=store.rows.filter(r=>r.kind==='shopping').map(r=>r.data as ShoppingItem).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
  useEffect(()=>{const before=shoppingCount.current;shoppingCount.current=shopping.length;if(shopping.length)setShoppingEmptied(false);else if(before)setShoppingEmptied(true);},[shopping.length]);
  const detailView=view?.kind==='detail'?view:view?.kind==='edit'||view?.kind==='cook'?view.parent:undefined;
  const detail=detailView?(recipes.find(r=>r.id===detailView.id)??(view?.kind==='edit'?view.parentRecipe:undefined)):undefined;
  const filtered=recipes.filter(r=>(!favorites||r.favorite)&&(!selectedCategories.length||selectedCategories.includes(r.category))&&(!query.trim()||`${r.title} ${r.ingredients.map(i=>i.name).join(' ')} ${r.memo}`.toLowerCase().includes(query.trim().toLowerCase())));
  // A saved recipe stays out of the grid until its panel has folded away, then
  // lands in its cell (see recipe-landing.ts).
  const [landing,setLanding]=useState<{id:string;released:boolean;first:boolean}|null>(null),[offerInvite,setOfferInvite]=useState(false);
  const recipeList=useRef<HTMLDivElement>(null);
  const holding=landing&&!landing.released?landing.id:null;
  const listed=holding?filtered.filter(r=>r.id!==holding):filtered,bookCount=recipes.length-Number(!!holding&&recipes.some(r=>r.id===holding));
  useGridFlip(recipeList,listed.map(r=>r.id),{context:[tab,query,selectedCategories.join(','),favorites].join('|'),skip:landing?.id??null});
  function beginLanding(id:string,source?:Element|null){holdLanding(source);setLanding({id,released:false,first:bookCount===0});}
  function abortLanding(){cancelLanding();setLanding(null);}
  useEffect(()=>{
    if(view||!landing||landing.released)return;
    if(tab!=='recipes'){abortLanding();return;}
    const release=()=>{if(landing.first)dissolve(document.querySelector('#main-content .empty-state'));setLanding({...landing,released:true});};
    if(window.scrollY<=8){release();return;}
    window.scrollTo({top:0,behavior:'smooth'});const timer=setTimeout(release,420);return()=>clearTimeout(timer);
  },[view,landing,tab]);
  useLayoutEffect(()=>{
    if(!landing?.released)return;
    playLanding(recipeList.current?.querySelector<HTMLElement>(`[data-recipe-id="${CSS.escape(landing.id)}"]`)??null,landing.first?120:0);
    setLanding(null);
    const space=spaces.space;if(space&&!session.local&&dataMode==='real'&&space.owner_id===session.user.id&&space.member_count===1)setOfferInvite(true);
  },[landing]);
  useLayoutEffect(()=>{if(closing&&view?.kind==='detail')closePhoto(document.querySelector<HTMLElement>('.card-panel .recipe-hero .recipe-photo'));},[closing]);
  // While the shopping list is on screen, check often for the partner's ticks so
  // their strike lines draw themselves here too.
  useEffect(()=>{
    if(session.local||dataMode!=='real'||tab!=='shopping')return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)void synchronize(realScope).catch(()=>{});},6000);
    return()=>clearInterval(timer);
  },[session.local,dataMode,tab,realScope]);
  useEffect(()=>{void fetch('/api/config').then(r=>r.json() as Promise<{ai:boolean;demoImport:boolean}>).then(v=>{setAI(!!v.ai);setAllowDemo(v.demoImport===true);}).catch(()=>{});},[]);
  useEffect(()=>{if(!notice||shoppingUndo?.message===notice)return;const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer);},[notice,shoppingUndo]);
  useEffect(()=>{if(!shoppingUndo)return;const timer=setTimeout(()=>{setShoppingUndo(null);setNotice(current=>current===shoppingUndo.message?'':current);},Math.max(0,shoppingUndo.expiresAt-Date.now()));return()=>clearTimeout(timer);},[shoppingUndo]);
  useEffect(()=>{
    if(view?.kind!=='shopping'){setShoppingFocused(false);return;}
    let frame=0;
    const update=()=>setShoppingFocused(document.activeElement===shopNameInput.current||!!document.activeElement?.matches('[data-panel-submit]'));
    const blur=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
    update();document.addEventListener('focusin',update);document.addEventListener('focusout',blur);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('focusin',update);document.removeEventListener('focusout',blur);};
  },[view?.kind]);
  function open(next:View){shoppingComposing.current=false;setFormError('');setClosing(false);setView(next);}
  function close(){if(busy||photoBusy)return;setClosing(true);}
  function changeTab(next:Tab){if(next===tab)return;const order=['recipes','shopping','settings'];transitionRoute(Math.sign(order.indexOf(next)-order.indexOf(tab)),()=>{onTab(next);window.scrollTo({top:0,behavior:'instant'});});}
  function exitPanel(){
    // Manual entry is a child of the import panel: going back returns to it, and
    // saving folds the import panel away too so the recipe can land.
    if(view?.kind==='edit'&&view.fromImport){const saved=recipes.some(recipe=>recipe.id===view.draft.id);setView({kind:'import'});setClosing(saved);return;}
    setView(current=>(current?.kind==='edit'||current?.kind==='cook')&&current.parent&&recipes.some(recipe=>recipe.id===current.parent!.id)?current.parent:null);setClosing(false);}
  async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);try{await action();}catch(e){setFormError(e instanceof Error?e.message:'処理できませんでした。');}finally{setBusy(false);}}
  const saveRecipe=()=>void run(async()=>{if(view?.kind!=='edit'||photoBusy)return;const form=document.getElementById('recipe-form') as HTMLFormElement|null;if(!form?.reportValidity())return;const record=validateRecord('recipe',view.draft);if(!record)throw new Error('材料・手順・人数などの入力内容を確認してください。');haptic();if(view.isNew)beginLanding(record.id);try{await store.save('recipe',record);}catch(cause){abortLanding();throw cause;}setClosing(true);});
  async function removeRecipe(){const saved=view?.kind==='edit'&&!view.isNew?recipes.find(recipe=>recipe.id===view.draft.id):undefined;if(!saved||busy||!confirm(`「${saved.title}」を削除しますか？`))return;await run(async()=>{await store.save('recipe',saved,true);setClosing(true);});}
  async function addIngredients(){if(!detail||busy)return;haptic();await run(async()=>{const selected=detail.ingredients.filter((_,i)=>checked.includes(String(i)));for(const ingredient of selected){await store.save('shopping',{id:crypto.randomUUID(),name:ingredient.name,quantity:formatIngredientAmount(ingredient,detail.servings,servings),done:false,createdAt:new Date().toISOString()});}setNotice(`${selected.length}件を買い物メモに追加しました`);setChecked([]);});}
  async function addShopping(){
    if(busy||shoppingInFlight.current||shoppingComposing.current)return;
    const form=document.getElementById('shopping-form') as HTMLFormElement|null;if(!form?.reportValidity())return;
    if(!shopName.trim()){setFormError('買うものを入力してください。');shopNameInput.current?.focus({preventScroll:true});return;}
    const name=shopName;shoppingInFlight.current=true;setFormError('');
    // Keep the input and keyboard active for both Enter and the dock action.
    shopNameInput.current?.focus({preventScroll:true});
    try{await run(async()=>{
      await store.save('shopping',{id:crypto.randomUUID(),name:name.trim(),quantity:'',done:false,createdAt:new Date().toISOString()});
      setShopName(current=>current===name?'':current);
      
    });}finally{shoppingInFlight.current=false;}
  }
  function changeShopping(item:ShoppingItem,remove=false){void store.save('shopping',remove?item:{...item,done:!item.done},remove).catch(error=>setFormError(error.message));}
  const shoppingList=(label='今回の買い物')=><ShoppingList items={shopping} disabled={busy} onToggle={item=>changeShopping(item)} onRemove={removeShopping} label={label}/>;
  function removeShopping(item:ShoppingItem){
    changeShopping(item,true);
    const message=`「${item.name}」を消しました`;
    setShoppingUndo({items:[item],message,expiresAt:Date.now()+SHOPPING_UNDO_MS});
  }
  async function finishShopping(keepUnpurchased:boolean){
    if(busy||shoppingInFlight.current)return;haptic();shoppingInFlight.current=true;setFormError('');
    const removed=shopping.filter(item=>!keepUnpurchased||item.done),remaining=shopping.length-removed.length;
    try{await run(async()=>{
      await store.saveMany('shopping',removed,true);
      const message=remaining?`未購入の${remaining}点を残して終了しました`:'買い物を終了しました';
      setShoppingUndo(removed.length?{items:removed,message,expiresAt:Date.now()+SHOPPING_UNDO_MS}:null);
      if(view?.kind==='shopping-finish')setClosing(true);
    });}finally{shoppingInFlight.current=false;}
  }
  function requestFinishShopping(){if(busy||!shopping.length)return;if(shopping.some(item=>!item.done))open({kind:'shopping-finish'});else void finishShopping(false);}
  async function undoShopping(){
    if(!shoppingUndo||busy||shoppingInFlight.current)return;
    if(Date.now()>=shoppingUndo.expiresAt){setShoppingUndo(null);setNotice(current=>current===shoppingUndo.message?'':current);return;}
    haptic();shoppingInFlight.current=true;
    const items=shoppingUndo.items;
    try{await run(async()=>{await store.saveMany('shopping',items);setShoppingUndo(null);});}finally{shoppingInFlight.current=false;}
  }
  async function selectDataMode(mode:DataMode){if(mode===dataMode)return;await run(()=>onDataMode(mode));}
  async function canLeave(){const scopes=session.local?[realScope]:spaces.spaces.map(space=>spaceScope(session.user.id,space));if((await Promise.all(scopes.map(rows))).flat().some(row=>row.pending)){store.setError('未同期の変更があります。実データに切り替えて同期してください。');return false;}return true;}
  const spaceControls=useSpaceControls({controller:spaces,userId:session.user.id,disabled:!!view||menuPhase!=='closed',onSelect:async id=>{spaces.select(id);}});
  const partners=usePartnerPresence({enabled:!session.local&&dataMode==='real'&&(spaces.space?.member_count??1)>1,api:spaces.api,spaceId:spaces.space?.id,shopping:tab==='shopping'});
  const PageIcon=tab==='recipes'?BookOpen:tab==='shopping'?ShoppingBasket:Settings;
  const filterCount=Number(!!query.trim())+Number(selectedCategories.length>0)+Number(favorites);
  const importFlow=useRecipeImport({active:view?.kind==='import'||view?.kind==='edit'&&!!view.fromImport,suspended:view?.kind==='edit',mode:importMode,ai,allowDemo:allowDemo&&dataMode==='demo',local:session.local,closing,onClose:close,onExited:()=>{setView(null);setClosing(false);},onManual:()=>open({kind:'edit',draft:newRecipe(),isNew:true,fromImport:true}),onSave:async recipe=>{beginLanding(recipe.id,document.querySelector('.card-panel .import-formed-card'));try{await store.save('recipe',recipe);}catch(cause){abortLanding();throw cause;}setClosing(true);}});
  let context:DockContext|undefined;
  if(view){context={key:view.kind,label:'操作',back:close,disabled:busy||photoBusy};if(view.kind==='filters')context={...context,action:close,actionLabel:`${filtered.length}件を表示`,actionDisabled:filtered.length===0,icon:Check,secondary:{label:'条件をリセット',text:'リセット',icon:RotateCcw,disabled:!filterCount,action:()=>{setQuery('');setSelectedCategories([]);setFavorites(false);}}};if(view.kind==='edit')context={...context,haptic:true,action:saveRecipe,actionLabel:'保存',icon:Check,commit:true,remove:view.isNew?undefined:()=>void removeRecipe()};if(view.kind==='detail'&&detail)context={...context,haptic:checked.length>0,action:checked.length?()=>void addIngredients():()=>open({kind:'edit',draft:structuredClone(detail),isNew:false,parent:view,parentRecipe:detail}),actionLabel:checked.length?`買い物に追加（${checked.length}）`:'編集',icon:checked.length?ShoppingBasket:Pencil,iconOnly:true,actionCount:checked.length||undefined,servings:{value:servings,onChange:setServings},extra:{label:'作るモードを開く',text:'作る',icon:CookingPot,action:()=>open({kind:'cook',parent:view,step:0})}};if(view.kind==='cook'&&detail){const step=view.step,last=step>=detail.steps.length-1;context={...context,label:'作るモードの操作',extra:{label:'前の手順',icon:ChevronLeft,disabled:step===0,action:()=>setView({...view,step:step-1})},action:last?close:()=>setView({...view,step:step+1}),actionLabel:last?'できあがり':'次の手順',icon:last?Check:ChevronRight,commit:last};}if(view.kind==='shopping')context={...context,action:shoppingFocused?()=>void addShopping():undefined,actionLabel:'追加',icon:Plus,commit:true,preserveEditorFocus:true,disabled:busy||!shopName.trim()};if(view.kind==='shopping-finish')context={...context,haptic:true,action:()=>void finishShopping(true),actionLabel:'未購入を残す',icon:Check,commit:true,remove:()=>void finishShopping(false),removeLabel:'すべて削除',removeText:true};if(view.kind==='import')context=importFlow.context;}
  return <>
    <main className="shell">
      <div id="main-content">
      <header className="screen-page-top page-top"><div><h1 className={`page-heading${tab==='recipes'?' recipe-book-title':''}`}><PageIcon aria-hidden="true"/>{tab==='recipes'?(spaces.space?.name||'レシピ'):tab==='shopping'?'買い物メモ':'設定'}</h1>{(tab!=='settings'||dataMode==='demo')&&<div className="page-meta">{tab!=='settings'&&<p className="page-count">{tab==='recipes'?<><NumberReel value={bookCount}/>件のレシピ</>:<><NumberReel value={shopping.filter(i=>!i.done).length}/>件の買うもの</>}</p>}{dataMode==='demo'&&<span className="data-mode-badge">デモ</span>}</div>}</div></header>
      {spaces.error&&<p className="subtle" role="status">レシピ帳の更新に失敗しました。通信が戻ると再試行します。</p>}
      {store.error&&<div className="notice" role="alert"><span>{store.error}</span><button aria-label="通知を閉じる" onClick={()=>store.setError('')}>×</button></div>}
      {!store.ready&&!store.error&&<p className="subtle" role="status">読み込んでいます…</p>}
      {tab==='recipes'&&<>
        {offerInvite&&spaces.space&&!session.local&&dataMode==='real'&&spaces.space.owner_id===session.user.id&&spaces.space.member_count===1&&<PartnerOffer spaceId={spaces.space.id} onInvite={source=>spaceControls.openInvite(source)} onJoin={source=>spaceControls.openJoin(source)}/>}
        {listed.length?<div className="recipe-list" ref={recipeList}>{listed.map(recipe=><article className="recipe-row" key={recipe.id} data-recipe-id={recipe.id}><button className="recipe-open" onClick={e=>{rememberCardPhoto(e.currentTarget);setServings(recipe.servings);setChecked([]);open({kind:'detail',id:recipe.id,origin:panelOrigin(e.currentTarget)});}}><RecipePhoto recipe={recipe}/><span className="recipe-category"><RecipeCategoryIcon category={recipe.category}/>{recipe.category}</span>{cookingToday(recipe,today)&&<span className="recipe-today"><CookingPot size={11} strokeWidth={2.4} aria-hidden="true"/>今日つくる</span>}<div className="recipe-row-copy"><h2><PhraseText text={recipe.title}/></h2>{recipe.minutes&&<p><span><Clock size={13}/>{recipe.minutes}分</span></p>}</div></button><RecipeFavorite recipe={recipe} onToggle={()=>void store.save('recipe',{...recipe,favorite:!recipe.favorite}).catch(e=>store.setError(e.message))}/></article>)}</div>:store.ready&&<div className="empty-state">{bookCount?<Search size={36} strokeWidth={1.4} aria-hidden="true"/>:<RiceBowl className="empty-recipe-symbol" size={44} strokeWidth={1.4} aria-hidden="true"/>}<h2>{bookCount?'レシピが見つかりません':'また作りたい、をここに。'}</h2><p>{bookCount?'検索条件を変えてみてください。':'お気に入りの一品から、レシピ帳を育てよう。'}</p>{bookCount>0&&filterCount>0&&<button className="primary" onClick={()=>{setQuery('');setSelectedCategories([]);setFavorites(false);}}><RotateCcw size={18}/>条件をはずす</button>}{!bookCount&&<><button className="primary" onClick={()=>setMenuPhase('open')}><Plus size={18}/>レシピを追加</button>{dataMode==='real'&&<button className="text-action" disabled={busy} onClick={()=>void selectDataMode('demo')}>サンプルを見てみる</button>}</>}</div>}</>}
      {tab==='shopping'&&<>{shoppingList()}{!shopping.length&&<div className={`empty-state${shoppingEmptied?' empty-state-arriving':''}`} onAnimationEnd={event=>{if(event.target===event.currentTarget)setShoppingEmptied(false);}}><ShoppingBasket size={40} strokeWidth={1.4} aria-hidden="true"/><h2>買うものをまとめよう</h2><p>レシピの材料からも追加できます。</p><button className="primary" onClick={()=>open({kind:'shopping'})}><Plus size={18}/>買うものを追加</button></div>}</>}
      {tab==='settings'&&formError&&<p className="form-error" role="alert">{formError}</p>}
      {tab==='settings'&&<SettingsPage onSpaceSettings={spaceControls.openSettings} session={session} pending={pending} updateReady={updateReady} dataMode={dataMode} changingData={busy} onDataMode={mode=>void selectDataMode(mode)}
        onSync={()=>synchronize(realScope).then(()=>{store.setError('');},e=>{store.setError(e.message);throw e;})}
        onUpdate={()=>void canLeave().then(allowed=>allowed?(updateReady?applyUpdate():checkUpdate()).then(found=>{setUpdateReady(!!found);}):undefined).catch(()=>setFormError('更新を確認できませんでした'))}
        onLogout={()=>void canLeave().then(allowed=>allowed?session.logout():undefined).catch(e=>store.setError(e.message))}/>}
      </div>
    </main>
    <FloatingViewport>
    {spaceControls.button}
    {spaceControls.panel}
    <Dock shoppingUndo={tab==='shopping'&&shoppingUndo?{expiresAt:shoppingUndo.expiresAt,onUndo:()=>void undoShopping(),disabled:busy}:undefined} onFinishShopping={tab==='shopping'&&shopping.length?requestFinishShopping:undefined} shoppingReady={shopping.length>0&&shopping.every(item=>item.done)} tab={tab} onTab={changeTab} onSearch={tab==='recipes'?()=>open({kind:'filters'}):undefined} filterCount={filterCount} addOpen={menuPhase==='open'} onAdd={tab==='settings'?undefined:()=>tab==='recipes'?setMenuPhase('open'):open({kind:'shopping'})} context={spaceControls.context??context}/>
    <FloatingStatus>{!view&&menuPhase==='closed'&&<PartnerPresence active={partners}/>}</FloatingStatus>
    {menuPhase!=='closed'&&<FuseAddMenu options={addOptions} closing={menuPhase==='closing'} onClose={()=>setMenuPhase('closing')} onSelect={option=>{pendingAdd.current=option.onClick;setMenuPhase('closing');}} onExited={exitAddMenu}/>}
    {importFlow.panel}
    {detailView&&detail&&<Panel key={`detail-${detailView.id}`} actions={<RecipeFavorite recipe={detail} onToggle={()=>void store.save('recipe',{...detail,favorite:!detail.favorite}).catch(e=>store.setError(e.message))}/>} className="recipe-detail-panel" title={detail.title} suspended={view?.kind!=='detail'} closing={view?.kind==='detail'&&closing} onClose={close} onExited={exitPanel} origin={detailView.origin}>
      <RecipeDetail recipe={detail} today={cookingToday(detail,today)} onToday={()=>{haptic();void store.save('recipe',{...detail,cookOn:cookingToday(detail,today)?undefined:today}).catch(e=>store.setError(e.message));}} servings={servings} checked={checked} onChange={setChecked} disabled={busy||view?.kind!=='detail'} error={view?.kind==='detail'?formError:undefined}/>
    </Panel>}
    {view&&view.kind!=='detail'&&view.kind!=='import'&&<Panel key={view.kind} className={view.kind==='edit'?'recipe-editor-panel':view.kind==='cook'?'cook-panel':undefined} icon={view.kind==='cook'?CookingPot:view.kind==='filters'?Search:view.kind==='edit'?Pencil:view.kind==='shopping'?ShoppingBasket:view.kind==='shopping-finish'?Check:undefined} title={view.kind==='cook'?(detail?.title??''):view.kind==='filters'?'検索・絞り込み':view.kind==='edit'?(view.isNew?'レシピを追加':'レシピを編集'):view.kind==='shopping-finish'?'この買い物を終了する':'買うものを追加'} closing={closing} onClose={close} onExited={exitPanel}>
      {view.kind==='filters'&&<div className="recipe-filters">
        <div className="field"><span>レシピ名・材料</span><label className="recipe-search"><Search size={19}/><input type="search" aria-label="レシピを検索" placeholder="レシピ名・材料で検索" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
        <fieldset className="filter-categories"><legend>カテゴリ（複数選択可）</legend><div className="category-tabs" role="group" aria-label="カテゴリ">{categories.map(c=><button type="button" key={c} aria-pressed={c==='すべて'?!selectedCategories.length:selectedCategories.includes(c)} onClick={()=>setSelectedCategories(current=>c==='すべて'?[]:current.includes(c)?current.filter(value=>value!==c):[...current,c])}><RecipeCategoryIcon category={c}/>{c}</button>)}</div></fieldset>
        <button className="filter-favorite-row" aria-pressed={favorites} onClick={()=>setFavorites(!favorites)}><Heart size={20} fill={favorites?'currentColor':'none'}/><span>お気に入りのみ</span><span className="filter-toggle" aria-hidden="true"/></button>
        <div className="filter-footer"><p aria-live="polite">{filtered.length}件のレシピ</p></div>
      </div>}
      {view.kind==='cook'&&detail&&<CookMode recipe={detail} servings={servings} step={view.step} onStep={step=>setView({...view,step})}/>}
      {view.kind==='edit'&&<RecipeEditor value={view.draft} onChange={draft=>setView({...view,draft})} onSubmit={saveRecipe} error={formError} onPhotoBusyChange={setPhotoBusy}/>}
      {view.kind==='shopping'&&<div className="shopping-entry-panel"><form id="shopping-form" className="form" onCompositionStart={()=>{shoppingComposing.current=true;}} onCompositionEnd={()=>{shoppingComposing.current=false;}} onKeyDown={e=>{if(e.key==='Enter'&&(shoppingComposing.current||e.nativeEvent.isComposing||e.nativeEvent.keyCode===229))e.preventDefault();}} onSubmit={e=>{e.preventDefault();void addShopping();}}><label className="field">買うもの<input ref={shopNameInput} required maxLength={200} enterKeyHint="enter" aria-describedby="shopping-enter-hint" placeholder="牛乳 1本、卵 1パックなど" value={shopName} onChange={e=>setShopName(e.target.value)}/></label><p id="shopping-enter-hint" className="subtle">Enterで追加して、続けて入力できます。</p>{formError&&<p className="form-error" role="alert">{formError}</p>}</form>{shopping.length?<div className="shopping-list-heading"><h3>今回の買い物</h3><span>{shopping.length}点</span></div>:<p className="shopping-entry-empty">追加したものがここに並びます。</p>}{shoppingList('追加した買うもの')}</div>}
      {view.kind==='shopping-finish'&&<div className="shopping-finish-summary"><h3>未購入のもの</h3><p>未購入のものを次の買い物に残しますか？<br/>購入済みのものはリストから消えます。</p><ul className="shopping-finish-items" aria-label="未購入のもの">{shopping.filter(item=>!item.done).map(item=><li key={item.id}>{[item.name,item.quantity].filter(Boolean).join(' ')}</li>)}</ul>{formError&&<p className="form-error" role="alert">{formError}</p>}</div>}

    </Panel>}
    {notice&&<div className="uchino-toast" role="status"><Check size={17}/>{notice}</div>}
    {!view&&formError&&<div className="uchino-toast" role="alert">{formError}<button onClick={()=>setFormError('')} aria-label="閉じる">×</button></div>}
    </FloatingViewport>
  </>;
}
