import {HapticTouch} from './haptic-touch';
import {useRef,type PointerEvent as ReactPointerEvent} from 'react';
import {AnimatePresence,motion,useIsPresent,useReducedMotion} from 'motion/react';
import {haptic} from './haptics';
import {Check,Trash2} from 'lucide-react';
import type {ShoppingItem} from './domain';

const RELEASE='cubic-bezier(0.22,0.72,0.18,1)',REMOVE_AT=96;
type ItemActions={disabled?:boolean;onToggle:(item:ShoppingItem)=>void;onRemove:(item:ShoppingItem)=>void};

// Swipe a row left to remove it. A dark drop grows out of the right edge with
// the finger; past the threshold it fills out and a tick confirms, and letting
// go sends the row away (undo then waits in the dock). Short of it, the row
// flows back. Vertical drags stay scrolls.
function useSwipeToRemove(disabled:boolean|undefined,remove:()=>void){
  const row=useRef<HTMLDivElement>(null),drop=useRef<HTMLSpanElement>(null),gesture=useRef<{id:number;x:number;y:number;dx:number;active:boolean;armed:boolean}|null>(null),swiped=useRef(false);
  const reduced=useReducedMotion();
  function paint(dx:number,armed:boolean){
    const node=row.current,pill=drop.current;if(!node||!pill)return;
    node.style.transform=dx?`translateX(${dx}px)`:'';
    const reach=Math.max(0,-dx);
    pill.style.width=`${Math.max(0,reach-10)}px`;pill.style.opacity=String(Math.min(1,reach/36));
    pill.dataset.armed=armed?'true':'false';
  }
  function settle(from:number){
    const node=row.current;if(!node)return;
    if(reduced||!node.animate){paint(0,false);return;}
    const start=performance.now(),step=(now:number)=>{const t=Math.min(1,(now-start)/520),e=1-Math.pow(1-t,3.2);paint(from*(1-e),false);if(t<1&&!gesture.current)requestAnimationFrame(step);};
    requestAnimationFrame(step);
  }
  function down(event:ReactPointerEvent<HTMLDivElement>){
    if(disabled||!event.isPrimary||event.button!==0)return;
    gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,active:false,armed:false};
  }
  function move(event:ReactPointerEvent<HTMLDivElement>){
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(!g.active){
      if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){gesture.current=null;return;}
      if(dx>-10||Math.abs(dx)<Math.abs(dy)*1.2)return;
      g.active=true;swiped.current=true;event.currentTarget.setPointerCapture(event.pointerId);
    }
    // Past the threshold the row keeps following, but with resistance.
    const raw=Math.min(0,dx),limit=REMOVE_AT*1.6;
    g.dx=raw<-limit?-limit+(raw+limit)*.3:raw;
    const armed=-g.dx>=REMOVE_AT;if(armed!==g.armed){g.armed=armed;haptic();}
    paint(g.dx,armed);
  }
  function up(event:ReactPointerEvent<HTMLDivElement>){
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;
    gesture.current=null;
    if(!g.active)return;
    window.setTimeout(()=>{swiped.current=false;},0);
    if(!g.armed){settle(g.dx);return;}
    const node=row.current,width=node?.offsetWidth??320;
    if(reduced||!node?.animate){remove();return;}
    node.animate([{transform:`translateX(${g.dx}px)`},{transform:`translateX(${-width}px)`}],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'}).onfinish=remove;
  }
  function cancel(event:ReactPointerEvent<HTMLDivElement>){const g=gesture.current;if(!g||g.id!==event.pointerId)return;gesture.current=null;if(g.active){swiped.current=false;settle(g.dx);}}
  return {row,drop,swiped,handlers:{onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerCancel:cancel}};
}

function ShoppingEntry({item,index,disabled,onToggle,onRemove}:{item:ShoppingItem;index:number}&ItemActions){
  const reduced=useReducedMotion(),present=useIsPresent();
  const swipe=useSwipeToRemove(disabled,()=>onRemove(item));
  return <motion.div className="shopping-entry" role="listitem" data-item-id={item.id} inert={!present} aria-hidden={!present||undefined}
    initial={reduced?false:{height:0,opacity:0,y:-8}} animate={{height:'auto',opacity:1,y:0}}
    exit={{height:0,opacity:0,filter:reduced?'blur(0px)':'blur(3px)',transition:{duration:reduced?0:.56,ease:[.22,.72,.18,1],delay:reduced?0:Math.min(index,8)*.045,opacity:{duration:reduced?0:.4,ease:[.22,.72,.18,1],delay:reduced?0:Math.min(index,8)*.045}}}}
    transition={{duration:reduced?0:.32,ease:[.22,1,.36,1],opacity:{duration:reduced?0:.2},height:{duration:reduced?0:.32}}}>
    <div className="shopping-swipe" {...swipe.handlers}>
      <span className="shopping-swipe-drop" ref={swipe.drop} aria-hidden="true"><Trash2 size={17}/></span>
      <div ref={swipe.row} className={`shopping-row${item.done?' done':''}`}>
        <button type="button" className="shopping-item-toggle" role="checkbox" aria-checked={item.done} disabled={disabled}
          aria-label={`${[item.name,item.quantity].filter(Boolean).join(' ')}を${item.done?'未購入に戻す':'購入済みにする'}`}
          onClick={event=>{if(swipe.swiped.current){event.preventDefault();return;}haptic();onToggle(item);}}>
          <HapticTouch/><span className="shopping-check" aria-hidden="true">{item.done&&<Check size={15}/>}</span>
          <span className="shopping-item-copy"><strong>{item.name}</strong>{item.quantity&&<span className="shopping-quantity">{item.quantity}</span>}</span>
        </button>
        <button type="button" className="shopping-remove" aria-label={`${item.name}を削除`} disabled={disabled} onClick={()=>onRemove(item)}><Trash2 size={16}/></button>
      </div>
    </div>
  </motion.div>;
}
export function ShoppingList({items,label='今回の買い物',...actions}:{items:ShoppingItem[];label?:string}&ItemActions) {
  return <div className="shopping-list" role="list" aria-label={label}>
    <AnimatePresence initial={false}>
      {items.map((item,index)=><ShoppingEntry key={item.id} item={item} index={index} {...actions}/>)}
    </AnimatePresence>
  </div>;
}
