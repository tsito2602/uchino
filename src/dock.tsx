import {useEffect,useLayoutEffect,useRef,type CSSProperties} from 'react';
import {BookOpen,ShoppingBasket,Settings,Plus,Check,Pencil,Trash2,ClipboardList,type LucideIcon} from 'lucide-react';
import {FluidDockSurface,type FluidDockHandle} from './kondo-fluid-dock';
import {DockContent} from './kondo-dock-content';
import {PanelBackButton} from './panel-back-button';
import {dockKeyboardInset} from './panel-focus';
export type Tab='recipes'|'shopping'|'settings';
export type DockContext={key:string;label:string;back:()=>void;action?:()=>void;actionLabel?:string;icon?:LucideIcon;disabled?:boolean;remove?:()=>void;commit?:boolean};
export const tabs=[{key:'recipes',label:'レシピ',icon:BookOpen},{key:'shopping',label:'買い物',icon:ShoppingBasket},{key:'settings',label:'設定',icon:Settings}] as const;
export function Dock({tab,onTab,onAdd,addOpen=false,context}:{tab:Tab;onTab:(tab:Tab)=>void;onAdd?:()=>void;addOpen?:boolean;context?:DockContext}){
  const root=useRef<HTMLDivElement>(null),morph=useRef<FluidDockHandle>(null);
  useLayoutEffect(()=>{morph.current?.measure();},[context,tab,onAdd]);
  useEffect(()=>{const viewport=window.visualViewport;const update=()=>document.documentElement.style.setProperty('--dock-keyboard-inset',`${dockKeyboardInset(window.innerHeight,viewport,document.activeElement)}px`);viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);window.addEventListener('focusin',update);window.addEventListener('focusout',update);return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('focusin',update);window.removeEventListener('focusout',update);};},[]);
  const Icon=context?.icon??Check;
  return <div className={`floating-nav-host${context?' context-host':''}`}><div ref={root} className="kondo-floating-dock thumb-dock" data-mode={context?'context':'browse'}><FluidDockSurface root={root} ref={morph} addOpen={addOpen}/><DockContent identity={context?.key??'browse'} mode={context?'context':'browse'}>{context?<nav className="context-dock" aria-label={context.label}><div className="context-island context-back"><PanelBackButton onBack={context.back}/></div>{context.action&&<div className="context-island context-primary" data-commit={context.commit||undefined}><button disabled={context.disabled} onClick={context.action}><Icon size={20}/><span>{context.actionLabel}</span></button></div>}{context.remove&&<div className="context-island context-delete"><button aria-label="削除" onClick={context.remove}><Trash2 size={20}/></button></div>}</nav>:<div className={`browse-dock no-month${onAdd?' has-add':''}`}><nav className="safari-dock" data-wide="true" aria-label="メインメニュー" style={{'--selection-tab':tabs.findIndex(t=>t.key===tab)} as CSSProperties}><span className="dock-selection" aria-hidden="true"/>{tabs.map(t=><button key={t.key} onClick={()=>onTab(t.key)} aria-label={t.label} aria-current={tab===t.key?'page':undefined}><t.icon size={22} strokeWidth={1.8}/></button>)}</nav>{onAdd&&<button className="dock-add" onClick={onAdd} aria-haspopup={tab==='recipes'?'menu':undefined} aria-expanded={tab==='recipes'?addOpen:undefined} style={{opacity:addOpen?0:1,transform:addOpen?'scale(.5)':undefined}} aria-label={tab==='recipes'?'レシピを追加':'買い物を追加'}><Plus size={23}/></button>}</div>}</DockContent></div></div>;
}
export {Pencil,ClipboardList};
