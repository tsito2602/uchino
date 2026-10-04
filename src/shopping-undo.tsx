import {HapticTouch} from './haptic-touch';
import {useEffect,useRef} from 'react';
import {useReducedMotion} from 'motion/react';
import {Undo2} from 'lucide-react';

export const SHOPPING_UNDO_MS=7000;
export type ShoppingUndoProps={expiresAt:number;onUndo:()=>void;disabled?:boolean};

export function ShoppingUndoAction({expiresAt,onUndo,disabled}:ShoppingUndoProps){
  const fill=useRef<HTMLSpanElement>(null),reduced=useReducedMotion();
  useEffect(()=>{
    const animation=fill.current?.animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{
      duration:SHOPPING_UNDO_MS,easing:reduced?'steps(7,end)':'linear',fill:'both',
    });
    // Returning from a panel or another tab resumes the original deadline.
    if(animation)animation.currentTime=Math.max(0,SHOPPING_UNDO_MS-(expiresAt-Date.now()));
    return()=>animation?.cancel();
  },[expiresAt,reduced]);
  return <div className="dock-month shopping-undo">
    <button type="button" onClick={onUndo} disabled={disabled} aria-label="元に戻す"><HapticTouch disabled={disabled}/>
      <span ref={fill} className="shopping-undo-fill" aria-hidden="true"/>
      <span className="shopping-undo-label"><Undo2 size={18}/><span>元に戻す</span></span>
    </button>
  </div>;
}
