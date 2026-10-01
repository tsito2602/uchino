import {useEffect,useRef,type Dispatch,type SetStateAction} from 'react';
import {scaleQuantity,type Recipe} from './domain';

type Props={recipe:Recipe;servings:number;checked:string[];onChange:Dispatch<SetStateAction<string[]>>;disabled?:boolean};
type Gesture={id:number;touch:boolean;x:number;y:number;startX:number;startY:number;last:number;select:boolean;active:boolean};

export function IngredientList({recipe,servings,checked,onChange,disabled=false}:Props){
  const root=useRef<HTMLDivElement>(null);
  const latest=useRef({checked,onChange,disabled});latest.current={checked,onChange,disabled};
  useEffect(()=>{
    const element=root.current;if(!element)return;
    const list:HTMLDivElement=element;
    let gesture:Gesture|null=null,timer=0,frame=0,suppressUntil=0,lastFrame=0;
    const indexOf=(target:EventTarget|null)=>{
      const row=target instanceof Element?target.closest<HTMLElement>('[data-ingredient-index]'):null;
      return row&&list.contains(row)?Number(row.dataset.ingredientIndex):-1;
    };
    function paint(index:number){
      if(!gesture||index<0)return;
      const from=Math.min(gesture.last,index),to=Math.max(gesture.last,index),select=gesture.select;
      gesture.last=index;
      latest.current.onChange(current=>{
        const selected=new Set(current);
        for(let i=from;i<=to;i++)select?selected.add(String(i)):selected.delete(String(i));
        return [...selected];
      });
    }
    function hit(){
      if(!gesture)return;
      const bounds=list.getBoundingClientRect();
      if(gesture.x<bounds.left||gesture.x>bounds.right)return;
      if(gesture.y<=bounds.top)paint(0);
      else if(gesture.y>=bounds.bottom)paint(list.children.length-1);
      else paint(indexOf(document.elementFromPoint(gesture.x,gesture.y)));
    }
    function stop(){
      clearTimeout(timer);cancelAnimationFrame(frame);
      if(gesture?.active)suppressUntil=Date.now()+600;
      gesture=null;delete list.dataset.selecting;
    }
    function autoScroll(time:number){
      if(!gesture?.active)return;
      if(latest.current.disabled){stop();return;}
      const scroll=list.closest<HTMLElement>('.card-panel'),rect=scroll?.getBoundingClientRect();
      const bounds=rect?{left:rect.left,right:rect.right,bottom:rect.bottom,top:Math.max(rect.top,scroll?.querySelector('.card-panel-header')?.getBoundingClientRect().bottom??rect.top)}:null;
      if(scroll&&bounds&&gesture.x>=bounds.left&&gesture.x<=bounds.right&&gesture.y>=bounds.top-24&&gesture.y<=bounds.bottom+24){
        const edge=44,top=gesture.y-bounds.top,bottom=bounds.bottom-gesture.y;
        const speed=top<edge?-Math.min(1,(edge-top)/edge):bottom<edge?Math.min(1,(edge-bottom)/edge):0;
        const listBounds=list.getBoundingClientRect();
        if(speed&&(speed<0?listBounds.top<bounds.top:listBounds.bottom>bounds.bottom)){scroll.scrollTop+=speed*10*Math.min(2,(time-lastFrame)/16.67);hit();}
      }
      lastFrame=time;frame=requestAnimationFrame(autoScroll);
    }
    function start(id:number,touch:boolean,x:number,y:number,target:EventTarget|null){
      if(gesture||latest.current.disabled)return;
      const index=indexOf(target);if(index<0)return;
      suppressUntil=0;
      gesture={id,touch,x,y,startX:x,startY:y,last:index,select:!latest.current.checked.includes(String(index)),active:false};
      timer=window.setTimeout(()=>{
        if(!gesture||latest.current.disabled)return;
        gesture.active=true;list.dataset.selecting='true';paint(gesture.last);
        lastFrame=performance.now();frame=requestAnimationFrame(autoScroll);
      },320);
    }
    function move(x:number,y:number,event:Event){
      if(!gesture)return;
      if(!gesture.active){if(Math.hypot(x-gesture.startX,y-gesture.startY)>8)stop();return;}
      if(event.cancelable)event.preventDefault();
      gesture.x=x;gesture.y=y;hit();
    }
    const touchStart=(event:TouchEvent)=>{
      if(event.touches.length!==1){stop();return;}
      const touch=event.touches[0];start(touch.identifier,true,touch.clientX,touch.clientY,event.target);
    };
    const touchMove=(event:TouchEvent)=>{
      if(!gesture?.touch)return;
      if(event.touches.length!==1){stop();return;}
      const touch=Array.from(event.touches).find(touch=>touch.identifier===gesture!.id);
      if(touch)move(touch.clientX,touch.clientY,event);
    };
    const touchEnd=(event:TouchEvent)=>{
      if(!gesture?.touch||!Array.from(event.changedTouches).some(touch=>touch.identifier===gesture!.id))return;
      if(gesture.active&&event.cancelable)event.preventDefault();stop();
    };
    const pointerDown=(event:PointerEvent)=>{if(event.pointerType!=='touch'&&event.button===0&&event.isPrimary)start(event.pointerId,false,event.clientX,event.clientY,event.target);};
    const pointerMove=(event:PointerEvent)=>{if(gesture&&!gesture.touch&&gesture.id===event.pointerId)move(event.clientX,event.clientY,event);};
    const pointerEnd=(event:PointerEvent)=>{if(gesture&&!gesture.touch&&gesture.id===event.pointerId)stop();};
    const click=(event:MouseEvent)=>{if(event.detail>0&&Date.now()<suppressUntil){event.preventDefault();event.stopPropagation();}};
    const contextMenu=(event:Event)=>event.preventDefault();
    const keyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')stop();};
    // A non-passive touchmove is necessary on iOS: changing touch-action after
    // long-press cannot stop a scroll that was allowed at touchstart.
    list.addEventListener('touchstart',touchStart,{passive:true});
    document.addEventListener('touchmove',touchMove,{passive:false,capture:true});
    document.addEventListener('touchend',touchEnd,{passive:false,capture:true});
    document.addEventListener('touchcancel',touchEnd,true);
    list.addEventListener('pointerdown',pointerDown);
    document.addEventListener('pointermove',pointerMove);
    document.addEventListener('pointerup',pointerEnd);document.addEventListener('pointercancel',pointerEnd);
    list.addEventListener('click',click,true);list.addEventListener('contextmenu',contextMenu);
    window.addEventListener('blur',stop);document.addEventListener('keydown',keyDown);
    return()=>{
      stop();list.removeEventListener('touchstart',touchStart);
      document.removeEventListener('touchmove',touchMove,true);document.removeEventListener('touchend',touchEnd,true);document.removeEventListener('touchcancel',touchEnd,true);
      list.removeEventListener('pointerdown',pointerDown);document.removeEventListener('pointermove',pointerMove);
      document.removeEventListener('pointerup',pointerEnd);document.removeEventListener('pointercancel',pointerEnd);
      list.removeEventListener('click',click,true);list.removeEventListener('contextmenu',contextMenu);
      window.removeEventListener('blur',stop);document.removeEventListener('keydown',keyDown);
    };
  },[recipe.id]);
  return <div className="ingredient-list" ref={root} role="group" aria-label="材料を選択">{recipe.ingredients.map((ingredient,index)=><label className="ingredient-row" data-ingredient-index={index} data-checked={checked.includes(String(index))||undefined} key={index}><input type="checkbox" disabled={disabled} checked={checked.includes(String(index))} onChange={event=>{const select=event.target.checked;onChange(current=>select?[...new Set([...current,String(index)])]:current.filter(id=>id!==String(index)));}}/><span>{ingredient.name}</span><strong>{scaleQuantity(ingredient.quantity,recipe.servings,servings)}{ingredient.unit&&` ${ingredient.unit}`}</strong></label>)}</div>;
}
