import {SHOPPING_UNDO_MS} from './shopping-undo';
import {ShoppingList} from './shopping-list';
import {useRecipeImport} from './recipe-import';
import {useEffect,useState,useRef} from 'react';
import {BookOpen,Search,Heart,Clock,ChevronRight,Minus,Plus,Check,ExternalLink,ShoppingBasket,Trash2,Link,ImagePlus,FileText,Pencil,RefreshCw,Download,LogOut,Cloud,Smartphone,ChefHat,Settings,SlidersHorizontal} from 'lucide-react';
import {type Session} from './auth';
import {SettingsPage} from './settings-page';
import {categories,newRecipe,scaleQuantity,validateRecord,type Recipe,type ShoppingItem} from './domain';
import {useRecords,synchronize} from './storage';
import {Dock,type Tab,type DockContext} from './dock';
import {Panel} from './panel';
import {FloatingViewport} from './floating-viewport';
import {FuseAddMenu,type AddOption} from './fuse-add-menu';
import {RecipeEditor} from './recipe-editor';
import {samples} from './samples';
import {panelOrigin,type PanelOrigin} from './use-panel-morph';
import {checkUpdate,applyUpdate} from './pwa';
type View={kind:'detail';id:string;origin?:PanelOrigin}|{kind:'edit';draft:Recipe;isNew:boolean}|{kind:'import'}|{kind:'shopping'}|{kind:'shopping-finish'}|{kind:'filters'};
export function App({session}:{session:Session}){
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
  const scope=session.local?'guest':`user-${session.user.id}`;
  const store=useRecords(scope);
  const [tab,setTab]=useState<Tab>('recipes'),[query,setQuery]=useState(''),[selectedCategories,setSelectedCategories]=useState<string[]>([]),[favorites,setFavorites]=useState(false);
  const [view,setView]=useState<View|null>(null),[closing,setClosing]=useState(false),[formError,setFormError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [servings,setServings]=useState(2),[checked,setChecked]=useState<string[]>([]),[shopName,setShopName]=useState(''),[shoppingAdded,setShoppingAdded]=useState(''),[shoppingFocused,setShoppingFocused]=useState(false),[shoppingUndo,setShoppingUndo]=useState<{items:ShoppingItem[];message:string;expiresAt:number}|null>(null);
  const shopNameInput=useRef<HTMLInputElement>(null),shoppingInFlight=useRef(false),shoppingComposing=useRef(false);
  const [importMode,setImportMode]=useState<'url'|'image'|'text'>('url'),[ai,setAI]=useState(false),[allowDemo,setAllowDemo]=useState(false),[updateReady,setUpdateReady]=useState(false);
  const recipes=store.rows.filter(r=>r.kind==='recipe').map(r=>r.data as Recipe).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const shopping=store.rows.filter(r=>r.kind==='shopping').map(r=>r.data as ShoppingItem).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
  const detail=view?.kind==='detail'?recipes.find(r=>r.id===view.id):undefined;
  const filtered=recipes.filter(r=>(!favorites||r.favorite)&&(!selectedCategories.length||selectedCategories.includes(r.category))&&(!query.trim()||`${r.title} ${r.ingredients.map(i=>i.name).join(' ')} ${r.memo}`.toLowerCase().includes(query.trim().toLowerCase())));
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
  function close(){if(busy)return;setClosing(true);}
  function changeTab(next:Tab){setTab(next);window.scrollTo({top:0,behavior:'instant'});}
  async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);try{await action();}catch(e){setFormError(e instanceof Error?e.message:'処理できませんでした。');}finally{setBusy(false);}}
  const saveRecipe=()=>void run(async()=>{if(view?.kind!=='edit')return;const form=document.getElementById('recipe-form') as HTMLFormElement|null;if(!form?.reportValidity())return;const record=validateRecord('recipe',view.draft);if(!record)throw new Error('材料・手順・人数などの入力内容を確認してください。');await store.save('recipe',record);setNotice('レシピを保存しました');setClosing(true);});
  async function removeRecipe(){const saved=view?.kind==='edit'&&!view.isNew?recipes.find(recipe=>recipe.id===view.draft.id):undefined;if(!saved||busy||!confirm(`「${saved.title}」を削除しますか？`))return;await run(async()=>{await store.save('recipe',saved,true);setClosing(true);setNotice('レシピを削除しました');});}
  async function addIngredients(){if(!detail)return;await run(async()=>{const selected=detail.ingredients.filter((_,i)=>checked.includes(String(i)));for(const ingredient of selected){await store.save('shopping',{id:crypto.randomUUID(),name:ingredient.name,quantity:[scaleQuantity(ingredient.quantity,detail.servings,servings),ingredient.unit].filter(Boolean).join(' '),done:false,createdAt:new Date().toISOString()});}setNotice(`${selected.length}件を買い物メモに追加しました`);setChecked([]);});}
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
      setShoppingAdded(`「${name.trim()}」を追加しました`);
    });}finally{shoppingInFlight.current=false;}
  }
  function changeShopping(item:ShoppingItem,remove=false){void store.save('shopping',remove?item:{...item,done:!item.done},remove).catch(error=>setFormError(error.message));}
  const shoppingList=(label='今回の買い物')=><ShoppingList items={shopping} disabled={busy} onToggle={item=>changeShopping(item)} onRemove={item=>changeShopping(item,true)} label={label}/>;
  async function finishShopping(keepUnpurchased:boolean){
    if(busy||shoppingInFlight.current)return;shoppingInFlight.current=true;setFormError('');
    const removed=shopping.filter(item=>!keepUnpurchased||item.done),remaining=shopping.length-removed.length;
    try{await run(async()=>{
      await store.saveMany('shopping',removed,true);
      const message=remaining?`未購入の${remaining}点を残して終了しました`:'買い物を終了しました';
      setShoppingUndo(removed.length?{items:removed,message,expiresAt:Date.now()+SHOPPING_UNDO_MS}:null);setNotice(message);
      if(view?.kind==='shopping-finish')setClosing(true);
    });}finally{shoppingInFlight.current=false;}
  }
  function requestFinishShopping(){if(busy||!shopping.length)return;if(shopping.some(item=>!item.done))open({kind:'shopping-finish'});else void finishShopping(false);}
  async function undoShopping(){
    if(!shoppingUndo||busy||shoppingInFlight.current)return;
    if(Date.now()>=shoppingUndo.expiresAt){setShoppingUndo(null);setNotice(current=>current===shoppingUndo.message?'':current);return;}
    shoppingInFlight.current=true;
    const items=shoppingUndo.items;
    try{await run(async()=>{await store.saveMany('shopping',items);setShoppingUndo(null);setNotice('買い物リストを戻しました');});}finally{shoppingInFlight.current=false;}
  }
  async function exportData(){const blob=new Blob([JSON.stringify({app:'uchino',version:1,exportedAt:new Date().toISOString(),records:store.allRows.map(({kind,data,deleted,pending})=>({kind,data,deleted,pending}))},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`uchino-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  const PageIcon=tab==='recipes'?BookOpen:tab==='shopping'?ShoppingBasket:Settings;
  const filterCount=Number(!!query.trim())+Number(selectedCategories.length>0)+Number(favorites);
  const importFlow=useRecipeImport({active:view?.kind==='import',mode:importMode,ai,allowDemo,local:session.local,closing,onClose:close,onExited:()=>{setView(null);setClosing(false);},onManual:()=>open({kind:'edit',draft:newRecipe(),isNew:true}),onSave:async recipe=>{await store.save('recipe',recipe);setNotice('レシピを保存しました');setClosing(true);}});
  let context:DockContext|undefined;
  if(view){context={key:view.kind,label:'操作',back:close,disabled:busy};if(view.kind==='filters')context={...context,action:close,actionLabel:`${filtered.length}件を表示`,icon:Check};if(view.kind==='edit')context={...context,action:saveRecipe,actionLabel:'保存',icon:Check,commit:true,remove:view.isNew?undefined:()=>void removeRecipe()};if(view.kind==='detail'&&detail)context={...context,action:checked.length?()=>void addIngredients():()=>open({kind:'edit',draft:structuredClone(detail),isNew:false}),actionLabel:checked.length?`買い物に追加（${checked.length}）`:'編集',icon:checked.length?ShoppingBasket:Pencil,iconOnly:!checked.length};if(view.kind==='shopping')context={...context,action:shoppingFocused?()=>void addShopping():undefined,actionLabel:'追加',icon:Plus,commit:true,preserveEditorFocus:true,disabled:busy||!shopName.trim()};if(view.kind==='shopping-finish')context={...context,action:()=>void finishShopping(true),actionLabel:'未購入を残す',textOnly:true,commit:true,remove:()=>void finishShopping(false),removeLabel:'すべて削除',removeText:true};if(view.kind==='import')context=importFlow.context;}
  return <>
    <main className="shell">
      <header className="screen-page-top page-top"><div><h1 className="page-heading"><PageIcon aria-hidden="true"/>{tab==='recipes'?'レシピ':tab==='shopping'?'買い物メモ':'設定'}</h1><p className="page-count">{tab==='recipes'?`${recipes.length}件のレシピ`:tab==='shopping'?`${shopping.filter(i=>!i.done).length}件の買うもの`:session.local?'この端末に保存':session.user.name||session.user.email}</p></div></header>
      {store.error&&<div className="notice" role="alert"><span>{store.error}</span><button aria-label="通知を閉じる" onClick={()=>store.setError('')}>×</button></div>}
      {!store.ready&&!store.error&&<p className="subtle" role="status">読み込んでいます…</p>}
      {tab==='recipes'&&<>
        {filtered.length?<div className="recipe-list">{filtered.map(recipe=><article className="recipe-row" key={recipe.id}><button className="recipe-open" onClick={e=>{setServings(recipe.servings);setChecked([]);open({kind:'detail',id:recipe.id,origin:panelOrigin(e.currentTarget)});}}><div className="recipe-symbol"><ChefHat size={29} strokeWidth={1.4}/></div><div className="recipe-row-copy"><span className="recipe-category">{recipe.category}</span><h2>{recipe.title}</h2><p><span>{recipe.servings}人分</span>{recipe.minutes&&<span><Clock size={13}/>{recipe.minutes}分</span>}</p></div><ChevronRight size={18}/></button><button className="recipe-favorite" aria-label={`${recipe.title}を${recipe.favorite?'お気に入りから外す':'お気に入りに追加'}`} onClick={()=>void store.save('recipe',{...recipe,favorite:!recipe.favorite}).catch(e=>store.setError(e.message))}><Heart size={18} fill={recipe.favorite?'currentColor':'none'}/></button></article>)}</div>:store.ready&&<div className="empty-state"><BookOpen size={40} strokeWidth={1.2}/><h2>{recipes.length?'レシピが見つかりません':'レシピを保存しよう'}</h2><p>{recipes.length?'検索条件を変えてみてください。':'URL・画像・手入力から追加できます。'}</p>{!recipes.length&&<><button className="primary" onClick={()=>setMenuPhase('open')}><Plus size={18}/>レシピを追加</button><button className="text-action" disabled={busy} onClick={()=>void run(async()=>{for(const sample of samples)await store.save('recipe',sample);setNotice('サンプルを追加しました');})}>サンプルを見てみる</button></>}</div>}</>}
      {tab==='shopping'&&<>{shopping.length?shoppingList():<div className="empty-state"><ShoppingBasket size={40} strokeWidth={1.2}/><h2>買うものをまとめよう</h2><p>レシピの材料からも追加できます。</p><button className="primary" onClick={()=>open({kind:'shopping'})}><Plus size={18}/>買うものを追加</button></div>}</>}
      {tab==='settings'&&<SettingsPage session={session} pending={store.pending} updateReady={updateReady}
        onSync={()=>void synchronize(scope).then(()=>setNotice('同期しました')).catch(e=>store.setError(e.message))}
        onExport={()=>void exportData()}
        onUpdate={()=>void (updateReady?applyUpdate():checkUpdate()).then(found=>{setUpdateReady(!!found);setNotice(found?'更新があります。もう一度押すと更新します。':'最新版です');}).catch(()=>setNotice('更新を確認できませんでした'))}
        onLogout={()=>{if(store.pending){store.setError('未同期の変更があります。同期または書き出し後にログアウトしてください。');return;}void session.logout().catch(e=>store.setError(e.message));}}/>}
    </main>
    <FloatingViewport>
    <Dock shoppingUndo={tab==='shopping'&&shoppingUndo?{expiresAt:shoppingUndo.expiresAt,onUndo:()=>void undoShopping(),disabled:busy}:undefined} onFinishShopping={tab==='shopping'&&shopping.length?requestFinishShopping:undefined} tab={tab} onTab={changeTab} onSearch={tab==='recipes'?()=>open({kind:'filters'}):undefined} filterCount={filterCount} addOpen={menuPhase==='open'} onAdd={tab==='settings'?undefined:()=>tab==='recipes'?setMenuPhase('open'):open({kind:'shopping'})} context={context}/>
    {menuPhase!=='closed'&&<FuseAddMenu options={addOptions} closing={menuPhase==='closing'} onClose={()=>setMenuPhase('closing')} onSelect={option=>{pendingAdd.current=option.onClick;setMenuPhase('closing');}} onExited={exitAddMenu}/>}
    {importFlow.panel}
    {view&&view.kind!=='import'&&<Panel key={view.kind} icon={view.kind==='filters'?SlidersHorizontal:view.kind==='edit'?Pencil:view.kind==='shopping'?ShoppingBasket:view.kind==='shopping-finish'?Check:BookOpen} title={view.kind==='filters'?'検索・絞り込み':view.kind==='detail'?'レシピ':view.kind==='edit'?(view.isNew?'レシピを追加':'レシピを編集'):view.kind==='shopping-finish'?'この買い物を終了する':'買うものを追加'} closing={closing} onClose={close} onExited={()=>{setView(null);setClosing(false);}} origin={view.kind==='detail'?view.origin:undefined}>
      {view.kind==='filters'&&<div className="recipe-filters">
        <div className="field"><span>レシピ名・材料</span><label className="recipe-search"><Search size={19}/><input type="search" aria-label="レシピを検索" placeholder="レシピ名・材料で検索" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
        <fieldset className="filter-categories"><legend>カテゴリ（複数選択可）</legend><div className="category-tabs" role="group" aria-label="カテゴリ">{categories.map(c=><button type="button" key={c} aria-pressed={c==='すべて'?!selectedCategories.length:selectedCategories.includes(c)} onClick={()=>setSelectedCategories(current=>c==='すべて'?[]:current.includes(c)?current.filter(value=>value!==c):[...current,c])}>{c}</button>)}</div></fieldset>
        <button className="filter-favorite-row" aria-pressed={favorites} onClick={()=>setFavorites(!favorites)}><Heart size={20} fill={favorites?'currentColor':'none'}/><span>お気に入りのみ</span><span className="filter-toggle" aria-hidden="true"/></button>
        <div className="filter-footer"><p aria-live="polite">{filtered.length}件のレシピ</p><button className="text-action" disabled={!filterCount} onClick={()=>{setQuery('');setSelectedCategories([]);setFavorites(false);}}>条件をリセット</button></div>
      </div>}
      {view.kind==='edit'&&<RecipeEditor value={view.draft} onChange={draft=>setView({...view,draft})} onSubmit={saveRecipe} error={formError}/>}
      {view.kind==='detail'&&detail&&<div className="recipe-detail"><span className="recipe-category">{detail.category}</span><h3>{detail.title}</h3><div className="recipe-meta"><span>{detail.servings}人分</span>{detail.minutes&&<span><Clock size={15}/>{detail.minutes}分</span>}</div><section><div className="section-head"><h3>材料</h3><div className="servings-control" aria-label="人数を変更"><button aria-label="人数を減らす" disabled={servings<=1} onClick={()=>setServings(servings-1)}><Minus size={16}/></button><span>{servings}人分</span><button aria-label="人数を増やす" disabled={servings>=100} onClick={()=>setServings(servings+1)}><Plus size={16}/></button></div></div><div className="ingredient-list">{detail.ingredients.map((ingredient,index)=><label className="ingredient-row" key={index}><input type="checkbox" checked={checked.includes(String(index))} onChange={e=>setChecked(e.target.checked?[...checked,String(index)]:checked.filter(i=>i!==String(index)))}/><span>{ingredient.name}</span><strong>{scaleQuantity(ingredient.quantity,detail.servings,servings)}{ingredient.unit&&` ${ingredient.unit}`}</strong></label>)}</div><p className="subtle">選んだ材料を買い物メモに追加できます。</p></section><section><h3>作り方</h3><ol className="recipe-steps">{detail.steps.map((step,i)=><li key={i}><span>{i+1}</span><p>{step}</p></li>)}</ol></section>{detail.memo&&<section><h3>メモ</h3><p className="recipe-memo">{detail.memo}</p></section>}{detail.sourceUrl&&<a className="source-link" href={detail.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>元のレシピを見る</a>}{formError&&<p className="form-error" role="alert">{formError}</p>}</div>}
      {view.kind==='shopping'&&<div className="shopping-entry-panel"><form id="shopping-form" className="form" onCompositionStart={()=>{shoppingComposing.current=true;}} onCompositionEnd={()=>{shoppingComposing.current=false;}} onKeyDown={e=>{if(e.key==='Enter'&&(shoppingComposing.current||e.nativeEvent.isComposing||e.nativeEvent.keyCode===229))e.preventDefault();}} onSubmit={e=>{e.preventDefault();void addShopping();}}><label className="field">買うもの<input ref={shopNameInput} required maxLength={200} enterKeyHint="enter" aria-describedby="shopping-enter-hint" placeholder="牛乳 1本、卵 1パックなど" value={shopName} onChange={e=>setShopName(e.target.value)}/></label><p id="shopping-enter-hint" className="subtle">Enterで追加して、続けて入力できます。</p><span className="visually-hidden" role="status">{shoppingAdded}</span>{formError&&<p className="form-error" role="alert">{formError}</p>}</form>{shopping.length?<div className="shopping-list-heading"><h3>今回の買い物</h3><span>{shopping.length}点</span></div>:<p className="shopping-entry-empty">追加したものがここに並びます。</p>}{shoppingList('追加した買うもの')}</div>}
      {view.kind==='shopping-finish'&&<div className="shopping-finish-summary"><h3>未購入のもの</h3><p>未購入のものを次の買い物に残しますか？<br/>購入済みのものはリストから消えます。</p><ul className="shopping-finish-items" aria-label="未購入のもの">{shopping.filter(item=>!item.done).map(item=><li key={item.id}>{[item.name,item.quantity].filter(Boolean).join(' ')}</li>)}</ul>{formError&&<p className="form-error" role="alert">{formError}</p>}</div>}

    </Panel>}
    </FloatingViewport>
    {notice&&<div className="uchino-toast" role="status"><Check size={17}/>{notice}</div>}
    {!view&&formError&&<div className="uchino-toast" role="alert">{formError}<button onClick={()=>setFormError('')} aria-label="閉じる">×</button></div>}
  </>;
}
