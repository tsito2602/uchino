import {HapticTouch} from './haptic-touch';
import {haptic} from './haptics';
import {SelectionCountBadge} from './selection-count-badge';
import {ShoppingUndoAction,type ShoppingUndoProps} from './shopping-undo';
import {StudioActionLabel} from './studio-action-label';
import {ImportProcessingLabel} from './import-processing-label';
import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent,type CSSProperties} from 'react';
import {Search,BookOpen,ShoppingBasket,Settings,Plus,Minus,Check,Pencil,Trash2,ClipboardList,type LucideIcon} from 'lucide-react';
import {FluidDockSurface,type FluidDockHandle} from './kondo-fluid-dock';
import {DockContent} from './kondo-dock-content';
import {PanelBackButton} from './panel-back-button';
import {dockTabAt} from './dock-tab-hit';
import {ServingsCount} from './servings-count';
export type Tab='recipes'|'shopping'|'settings';
export type DockContext={key:string;haptic?:boolean;label:string;back:()=>void;action?:()=>void;actionLabel?:string;icon?:LucideIcon;disabled?:boolean;actionDisabled?:boolean;remove?:()=>void;removeLabel?:string;removeText?:boolean;commit?:boolean;iconOnly?:boolean;appearance?:'studio'|'breathing';preserveEditorFocus?:boolean;servings?:{value:number;onChange:(value:number)=>void};actionCount?:number;secondary?:{label:string;text:string;icon:LucideIcon;disabled?:boolean;action:()=>void};extra?:{label:string;text?:string;icon:LucideIcon;disabled?:boolean;action:()=>void}};
export const tabs=[{key:'recipes',label:'レシピ',icon:BookOpen},{key:'shopping',label:'買い物',icon:ShoppingBasket},{key:'settings',label:'設定',icon:Settings}] as const;
export function Dock({tab,onTab,onAdd,addOpen=false,onSearch,onFinishShopping,shoppingReady=false,shoppingUndo,filterCount=0,context}:{tab:Tab;onTab:(tab:Tab)=>void;onAdd?:()=>void;addOpen?:boolean;onSearch?:()=>void;onFinishShopping?:()=>void;shoppingReady?:boolean;shoppingUndo?:ShoppingUndoProps;filterCount?:number;context?:DockContext}){
  const [preview,setPreview]=useState<number|null>(null);
  const pointer=useRef<{id:number;target:HTMLElement;x:number;y:number}|null>(null);
  const swallowClick=useRef(false);
  const root=useRef<HTMLDivElement>(null),morph=useRef<FluidDockHandle>(null);
  useLayoutEffect(()=>{morph.current?.measure();},[context,tab,onAdd,onSearch,onFinishShopping,shoppingUndo]);
  // Every press in the dock ticks on iPhone through the HapticTouch layer in
  // each button. Android cannot soften its pulse, so there only confirmed
  // actions call haptic() themselves.
  function hit(event:PointerEvent<HTMLElement>) {
    // Scope to the captured nav, excluding calendar controls and outgoing copies.
    const buttons=event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-dock-index]');
    return dockTabAt(event.clientX,event.clientY,Array.from(buttons,button=>button.getBoundingClientRect()));
  }
  function release() {
    const held=pointer.current;
    pointer.current=null;setPreview(null);
    if(held?.target.hasPointerCapture(held.id))held.target.releasePointerCapture(held.id);
  }
  useEffect(()=>{release();},[tab,!!context]);
  useEffect(()=>{
    const end=(event:globalThis.PointerEvent)=>{if(pointer.current?.id===event.pointerId)release();};
    window.addEventListener('blur',release);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
    return()=>{release();window.removeEventListener('blur',release);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);};
  },[]);
  function down(event:PointerEvent<HTMLElement>) {
    if(event.button!==0||!event.isPrimary||pointer.current)return;
    swallowClick.current=false;
    // Capture only once the finger slides: a plain tap must reach the tab's
    // HapticTouch switch, which pointer capture would redirect to the nav.
    pointer.current={id:event.pointerId,target:event.currentTarget,x:event.clientX,y:event.clientY};
    setPreview(hit(event));
  }
  function move(event:PointerEvent<HTMLElement>) {
    const held=pointer.current;if(held?.id!==event.pointerId)return;
    if(!held.target.hasPointerCapture(held.id)&&Math.hypot(event.clientX-held.x,event.clientY-held.y)>6)held.target.setPointerCapture(held.id);
    setPreview(hit(event));
  }
  function up(event:PointerEvent<HTMLElement>) {
    if(pointer.current?.id!==event.pointerId)return;
    const index=hit(event);
    swallowClick.current=true;
    window.setTimeout(()=>{swallowClick.current=false;},0);
    release();
    if(index!==null)onTab(tabs[index].key);
  }
  const Icon=context?.icon??Check,SecondaryIcon=context?.secondary?.icon??Check,ExtraIcon=context?.extra?.icon??Check;
  // Reflect changes within browse/import too, without restarting on every
  // serving step or ingredient count update.
  const contentIdentity=context?[context.key,!!context.action,!!context.secondary,!!context.remove,context.appearance,context.iconOnly,!!context.extra].join(':'):['browse',tab,!!onSearch,!!onAdd,!!onFinishShopping,!!shoppingUndo].join(':');
  return <div className={`floating-nav-host${context?' context-host':''}`}><div ref={root} className="kondo-floating-dock thumb-dock" data-mode={context?'context':'browse'}><FluidDockSurface root={root} ref={morph} addOpen={addOpen}/><DockContent identity={contentIdentity} mode={context?'context':'browse'}>{context?<nav className={`context-dock${context.removeText?' context-two-actions':''}${context.servings?' context-recipe':''}${context.key==='cook'?' context-cook':''}`} aria-label={context.label}><div className="context-island context-back"><PanelBackButton onBack={context.back}/></div>{context.servings&&<div className="context-island context-servings" role="group" aria-label="人数を変更"><button type="button" aria-label="人数を減らす" disabled={context.disabled||context.servings.value<=1} onClick={()=>{haptic();context.servings!.onChange(context.servings!.value-1);}}><HapticTouch/><Minus size={18}/></button><span aria-live="polite" aria-atomic="true"><ServingsCount value={context.servings.value}/></span><button type="button" aria-label="人数を増やす" disabled={context.disabled||context.servings.value>=100} onClick={()=>{haptic();context.servings!.onChange(context.servings!.value+1);}}><HapticTouch/><Plus size={18}/></button></div>}{context.extra&&<div className={`context-island context-extra${context.extra.text?'':' context-compact'}`}><button type="button" aria-label={context.extra.label} disabled={context.disabled||context.extra.disabled} onClick={context.extra.action}><HapticTouch/><ExtraIcon size={19}/>{context.extra.text&&<span>{context.extra.text}</span>}</button></div>}{context.action&&<div className={`context-island context-primary${context.iconOnly?' context-compact':''}${context.key==='filters'?' context-filter-results':''}`} data-commit={context.commit||undefined}><button className={context.appearance?`${context.appearance}-action`:undefined} data-panel-submit={context.preserveEditorFocus||undefined} onPointerDown={event=>{if(context.preserveEditorFocus&&event.button===0)event.preventDefault();}} aria-label={context.actionLabel} disabled={context.disabled||context.actionDisabled} onClick={context.action}><HapticTouch/>{context.appearance==='studio'?<StudioActionLabel label={context.actionLabel||''}/>:context.appearance==='breathing'?<ImportProcessingLabel label={context.actionLabel||''}/>:<><span className="context-action-icon" key={context.actionCount!==undefined?'basket':'action'}><Icon size={20}/></span>{context.actionCount!==undefined&&<SelectionCountBadge count={context.actionCount}/>}{!context.iconOnly&&<span>{context.actionLabel}</span>}</>}</button></div>}{context.secondary&&<div className="context-island context-reset"><button type="button" aria-label={context.secondary.label} disabled={context.disabled||context.secondary.disabled} onClick={context.secondary.action}><HapticTouch/><SecondaryIcon size={16}/><span>{context.secondary.text}</span></button></div>}{context.remove&&<div className={`context-island context-delete${context.removeText?' context-secondary':''}`}><button aria-label={context.removeLabel||'削除'} disabled={context.disabled} onClick={context.remove}><HapticTouch/><Trash2 size={20}/>{context.removeText&&<span>{context.removeLabel}</span>}</button></div>}</nav>:<div className="browse-dock no-month has-add"><nav className="safari-dock" data-wide="true" aria-label="メインメニュー" onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onPointerCancel={event=>{if(pointer.current?.id===event.pointerId)release();}}
        onLostPointerCapture={event=>{if(event.target===event.currentTarget&&pointer.current?.id===event.pointerId)release();}}
        onContextMenu={event=>event.preventDefault()}
        onClickCapture={event=>{if(swallowClick.current){if(!(event.target as Element).classList.contains('haptic-touch'))event.preventDefault();event.stopPropagation();swallowClick.current=false;}}}
        style={{'--selection-tab':preview??tabs.findIndex(t=>t.key===tab)} as CSSProperties}><span className="dock-selection" aria-hidden="true"/>{tabs.map((t,index)=><button key={t.key} data-dock-index={index} onClick={()=>onTab(t.key)} aria-label={t.label} aria-current={tab===t.key?'page':undefined}><HapticTouch/><t.icon size={22} strokeWidth={1.8}/></button>)}</nav>{onSearch&&<div className="dock-month recipe-tools"><button aria-label="レシピの検索・絞り込み" aria-haspopup="dialog" data-active={filterCount>0||undefined} onClick={onSearch}><HapticTouch/><Search size={21}/><span>{filterCount>0?'絞り込み中':'検索'}</span></button></div>}{shoppingUndo?<ShoppingUndoAction {...shoppingUndo}/>:onFinishShopping&&<div className="dock-month shopping-finish" data-ready={shoppingReady||undefined}><button type="button" aria-label="この買い物を終了する" onClick={onFinishShopping}><HapticTouch/><span className="shopping-finish-fill" aria-hidden="true"/><Check size={19}/><span className="shopping-finish-label"><span>この買い物を</span><span>終了する</span></span></button></div>}{onAdd&&<button className="dock-add" onClick={onAdd} aria-haspopup={tab==='recipes'?'menu':undefined} aria-expanded={tab==='recipes'?addOpen:undefined} style={{opacity:addOpen?0:1,transform:addOpen?'scale(.5)':undefined}} aria-label={tab==='recipes'?'レシピを追加':'買い物を追加'}><HapticTouch/><Plus size={23}/></button>}</div>}</DockContent></div></div>;
}
export {Pencil,ClipboardList};
