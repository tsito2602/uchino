import {StudioActionLabel} from './studio-action-label';
import {ImportProcessingLabel} from './import-processing-label';
import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent,type CSSProperties} from 'react';
import {Search,BookOpen,ShoppingBasket,Settings,Plus,Check,Pencil,Trash2,ClipboardList,type LucideIcon} from 'lucide-react';
import {FluidDockSurface,type FluidDockHandle} from './kondo-fluid-dock';
import {DockContent} from './kondo-dock-content';
import {PanelBackButton} from './panel-back-button';
import {dockTabAt} from './dock-tab-hit';
export type Tab='recipes'|'shopping'|'settings';
export type DockContext={key:string;label:string;back:()=>void;action?:()=>void;actionLabel?:string;icon?:LucideIcon;disabled?:boolean;remove?:()=>void;commit?:boolean;iconOnly?:boolean;appearance?:'studio'|'breathing'};
export const tabs=[{key:'recipes',label:'レシピ',icon:BookOpen},{key:'shopping',label:'買い物',icon:ShoppingBasket},{key:'settings',label:'設定',icon:Settings}] as const;
export function Dock({tab,onTab,onAdd,addOpen=false,onSearch,filterCount=0,context}:{tab:Tab;onTab:(tab:Tab)=>void;onAdd?:()=>void;addOpen?:boolean;onSearch?:()=>void;filterCount?:number;context?:DockContext}){
  const [preview,setPreview]=useState<number|null>(null);
  const pointer=useRef<{id:number;target:HTMLElement}|null>(null);
  const swallowClick=useRef(false);
  const root=useRef<HTMLDivElement>(null),morph=useRef<FluidDockHandle>(null);
  useLayoutEffect(()=>{morph.current?.measure();},[context,tab,onAdd,onSearch]);
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
    pointer.current={id:event.pointerId,target:event.currentTarget};
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreview(hit(event));
  }
  function move(event:PointerEvent<HTMLElement>) {
    if(pointer.current?.id===event.pointerId)setPreview(hit(event));
  }
  function up(event:PointerEvent<HTMLElement>) {
    if(pointer.current?.id!==event.pointerId)return;
    const index=hit(event);
    swallowClick.current=true;
    window.setTimeout(()=>{swallowClick.current=false;},0);
    release();
    if(index!==null)onTab(tabs[index].key);
  }
  const Icon=context?.icon??Check;
  return <div className={`floating-nav-host${context?' context-host':''}`}><div ref={root} className="kondo-floating-dock thumb-dock" data-mode={context?'context':'browse'}><FluidDockSurface root={root} ref={morph} addOpen={addOpen}/><DockContent identity={context?.key??'browse'} mode={context?'context':'browse'}>{context?<nav className="context-dock" aria-label={context.label}><div className="context-island context-back"><PanelBackButton onBack={context.back}/></div>{context.action&&<div className={`context-island context-primary${context.iconOnly?' context-compact':''}`} data-commit={context.commit||undefined}><button className={context.appearance?`${context.appearance}-action`:undefined} aria-label={context.actionLabel} disabled={context.disabled} onClick={context.action}>{context.appearance==='studio'?<StudioActionLabel label={context.actionLabel||''}/>:context.appearance==='breathing'?<ImportProcessingLabel label={context.actionLabel||''}/>:<><Icon size={20}/>{!context.iconOnly&&<span>{context.actionLabel}</span>}</>}</button></div>}{context.remove&&<div className="context-island context-delete"><button aria-label="削除" disabled={context.disabled} onClick={context.remove}><Trash2 size={20}/></button></div>}</nav>:<div className="browse-dock no-month has-add"><nav className="safari-dock" data-wide="true" aria-label="メインメニュー" onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onPointerCancel={event=>{if(pointer.current?.id===event.pointerId)release();}}
        onLostPointerCapture={event=>{if(pointer.current?.id===event.pointerId)release();}}
        onContextMenu={event=>event.preventDefault()}
        onClickCapture={event=>{if(swallowClick.current){event.preventDefault();event.stopPropagation();swallowClick.current=false;}}}
        style={{'--selection-tab':preview??tabs.findIndex(t=>t.key===tab)} as CSSProperties}><span className="dock-selection" aria-hidden="true"/>{tabs.map((t,index)=><button key={t.key} data-dock-index={index} onClick={()=>onTab(t.key)} aria-label={t.label} aria-current={tab===t.key?'page':undefined}><t.icon size={22} strokeWidth={1.8}/></button>)}</nav>{onSearch&&<div className="dock-month recipe-tools"><button aria-label="レシピの検索・絞り込み" aria-haspopup="dialog" data-active={filterCount>0||undefined} onClick={onSearch}><Search size={21}/><span>検索</span>{filterCount>0&&<small aria-label={`${filterCount}件の条件を設定中`}>{filterCount}</small>}</button></div>}{onAdd&&<button className="dock-add" onClick={onAdd} aria-haspopup={tab==='recipes'?'menu':undefined} aria-expanded={tab==='recipes'?addOpen:undefined} style={{opacity:addOpen?0:1,transform:addOpen?'scale(.5)':undefined}} aria-label={tab==='recipes'?'レシピを追加':'買い物を追加'}><Plus size={23}/></button>}</div>}</DockContent></div></div>;
}
export {Pencil,ClipboardList};
