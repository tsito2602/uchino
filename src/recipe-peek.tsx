import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {recipePhoto,type Recipe} from './domain';
import {formatIngredientAmount} from './ingredient-amount';
import {photoTone} from './photo-tone';
import {haptic} from './haptics';

const HOLD=450,SLOP=8,SHOWN=12;
type Peek={recipe:Recipe;from:DOMRect;leaving?:boolean};

// Press and hold a recipe card to glance at what it needs without opening it.
// The card's ingredients rise out of it as a glass sheet and sink back when
// the finger lifts; a drag before the hold is a scroll, not a peek.
export function useRecipePeek(){
  const [peek,setPeek]=useState<Peek|null>(null);
  const press=useRef<{id:number;x:number;y:number;timer:number}|null>(null),consumed=useRef(false);
  const end=()=>{const p=press.current;if(p)window.clearTimeout(p.timer);press.current=null;setPeek(current=>current&&!current.leaving?{...current,leaving:true}:current);};
  // While a peek is up the page must not scroll under the finger.
  useEffect(()=>{
    if(!peek||peek.leaving)return;
    const stop=(event:TouchEvent)=>event.preventDefault();
    window.addEventListener('touchmove',stop,{passive:false});
    return()=>window.removeEventListener('touchmove',stop);
  },[peek]);
  function bind(recipe:Recipe){
    return {
      onPointerDown(event:ReactPointerEvent<HTMLElement>){
        if(!event.isPrimary||event.button!==0)return;
        consumed.current=false;const target=event.currentTarget;
        const timer=window.setTimeout(()=>{consumed.current=true;haptic();setPeek({recipe,from:target.getBoundingClientRect()});},HOLD);
        press.current={id:event.pointerId,x:event.clientX,y:event.clientY,timer};
      },
      onPointerMove(event:ReactPointerEvent<HTMLElement>){
        const p=press.current;if(!p||p.id!==event.pointerId||consumed.current)return;
        if(Math.hypot(event.clientX-p.x,event.clientY-p.y)>SLOP){window.clearTimeout(p.timer);press.current=null;}
      },
      onPointerUp:end,onPointerCancel:end,onPointerLeave:(event:ReactPointerEvent<HTMLElement>)=>{if(event.pointerType==='mouse')end();},
      onContextMenu(event:ReactMouseEvent){event.preventDefault();},
    };
  }
  // The click that ends a peek must not also open the recipe.
  const swallow=()=>{if(!consumed.current)return false;consumed.current=false;return true;};
  const overlay=peek?createPortal(<PeekSheet peek={peek} onGone={()=>setPeek(null)}/>,document.body):null;
  return {bind,swallow,overlay};
}

function PeekSheet({peek,onGone}:{peek:Peek;onGone:()=>void}){
  const sheet=useRef<HTMLDivElement>(null),shade=useRef<HTMLDivElement>(null);
  const {recipe,from}=peek,src=recipePhoto(recipe),tone=src?photoTone(src):undefined;
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function delta(node:HTMLElement){
    const to=node.getBoundingClientRect();
    return `translate(${from.left+from.width/2-(to.left+to.width/2)}px,${from.top+from.height/2-(to.top+to.height/2)}px) scale(${from.width/to.width})`;
  }
  useLayoutEffect(()=>{
    const node=sheet.current;if(!node||reduced||!node.animate)return;
    node.animate([{transform:delta(node),opacity:.4,borderRadius:'40px'},{transform:'none',opacity:1,borderRadius:'26px'}],{duration:420,easing:'cubic-bezier(.22,1.18,.36,1)'});
    shade.current?.animate([{opacity:0},{opacity:1}],{duration:260,easing:'ease-out'});
  },[]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(!peek.leaving)return;
    const node=sheet.current;if(!node||reduced||!node.animate){onGone();return;}
    shade.current?.animate([{opacity:1},{opacity:0}],{duration:200,easing:'ease-in',fill:'forwards'});
    node.animate([{transform:'none',opacity:1},{transform:delta(node),opacity:0}],{duration:220,easing:'cubic-bezier(.4,0,.8,.4)',fill:'forwards'}).onfinish=onGone;
  },[peek.leaving]);// eslint-disable-line react-hooks/exhaustive-deps
  const rest=recipe.ingredients.length-SHOWN;
  return <div className="recipe-peek" aria-hidden="true" style={tone?{'--photo-tone':tone} as CSSProperties:undefined}>
    <div className="recipe-peek-shade" ref={shade}/>
    <div className="recipe-peek-sheet" ref={sheet}>
      <p className="recipe-peek-title">{recipe.title}</p>
      <p className="recipe-peek-meta">{recipe.servings}人分{recipe.minutes?`・${recipe.minutes}分`:''}・材料{recipe.ingredients.length}品</p>
      <ul>{recipe.ingredients.slice(0,SHOWN).map((ingredient,index)=><li key={index}><span>{ingredient.name}</span><b>{formatIngredientAmount(ingredient,recipe.servings,recipe.servings)}</b></li>)}</ul>
      {rest>0&&<p className="recipe-peek-more">ほか{rest}品</p>}
    </div>
  </div>;
}
