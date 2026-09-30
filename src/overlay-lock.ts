import {guardOverlayTouchScroll} from './overlay-touch-scroll';
type ScrollLock = {count:number;restore:()=>void};
type InertLock = {count:number;inert:boolean};
const scrollLocks=new WeakMap<HTMLElement,ScrollLock>();
const inertLocks=new WeakMap<HTMLElement,InertLock>();

// An incoming overlay can mount before the outgoing one's cleanup runs.
// Only the last owner restores the state from before the first overlay opened.
export function lockOverlayBackground(layers:HTMLElement[],body:HTMLElement=document.body):()=>void {
 let scroll=scrollLocks.get(body);
 if(!scroll){
  const root=body.ownerDocument.documentElement;
  const x=window.scrollX,y=window.scrollY;
  const properties=['overflow','position','top','left','right','overscroll-behavior'] as const;
  const saved=properties.map(key=>[key,body.style.getPropertyValue(key)] as const);
  const rootOverflow=root.style.overflow,rootOverscroll=root.style.overscrollBehavior;
  // overflow:hidden alone still lets iOS pan the page behind a keyboard.
  Object.assign(body.style,{overflow:'hidden',position:'fixed',top:`${-y}px`,left:'0px',right:'0px',overscrollBehavior:'none'});
  root.style.overflow='hidden';root.style.overscrollBehavior='none';
  const releaseTouches=guardOverlayTouchScroll(body.ownerDocument);
  scroll={count:0,restore:()=>{
   releaseTouches();
   saved.forEach(([key,value])=>{if(value)body.style.setProperty(key,value);else body.style.removeProperty(key);});
   root.style.overflow=rootOverflow;root.style.overscrollBehavior=rootOverscroll;
   window.scrollTo({left:x,top:y,behavior:'instant'});
  }};
  scrollLocks.set(body,scroll);
 }
 scroll.count++;
 body.style.overflow='hidden';
 const backgrounds=[...new Set(layers)].map(layer=>{
  let state=inertLocks.get(layer);
  if(!state){state={count:0,inert:layer.inert};inertLocks.set(layer,state);}
  state.count++;
  layer.inert=true;
  return {layer,state};
 });
 let released=false;
 return()=>{
  if(released)return;
  released=true;
  for(const {layer,state} of backgrounds){
   if(--state.count===0){layer.inert=state.inert;inertLocks.delete(layer);}
  }
  if(--scroll.count===0){scroll.restore();scrollLocks.delete(body);}
 };
}
