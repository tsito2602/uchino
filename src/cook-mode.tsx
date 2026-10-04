import {useEffect,useRef} from 'react';
import type {Recipe} from './domain';
import {IngredientAmountView} from './ingredient-amount-view';
import {RecipeImage} from './recipe-image';
import {StepText} from './step-text';

// Cooking, one step at a time: large type, the ingredients this step uses at
// the chosen servings, and the screen kept awake. Steps move from the dock or
// with a sideways swipe.
export function CookMode({recipe,servings,step,onStep}:{recipe:Recipe;servings:number;step:number;onStep:(step:number)=>void}){
  const text=recipe.steps[step]??'',total=recipe.steps.length;
  const used=recipe.ingredients.filter(ingredient=>ingredient.name.length>0&&text.includes(ingredient.name));
  useWakeLock();
  const swipe=useRef<{x:number;y:number}|null>(null);
  return <div className="cook-mode"
    onTouchStart={event=>{const t=event.touches[0];swipe.current=event.touches.length===1?{x:t.clientX,y:t.clientY}:null;}}
    onTouchEnd={event=>{const start=swipe.current,t=event.changedTouches[0];swipe.current=null;if(!start||!t)return;const dx=t.clientX-start.x,dy=t.clientY-start.y;if(Math.abs(dx)<56||Math.abs(dx)<Math.abs(dy)*1.4)return;const next=step+(dx<0?1:-1);if(next>=0&&next<total)onStep(next);}}>
    <div className="cook-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step+1} aria-label={`手順${step+1}／${total}`}>
      {recipe.steps.map((_,index)=><span key={index} data-state={index<step?'done':index===step?'current':undefined}/>)}
    </div>
    <div className="cook-step" key={step}>
      <p className="cook-step-number"><strong>{step+1}</strong><span>／{total}</span></p>
      <p className="cook-step-text"><StepText text={text} label={`手順${step+1}`}/></p>
      {used.length>0&&<section className="cook-uses" aria-label="この手順で使う材料"><h3>この手順で使う</h3><ul>{used.map((ingredient,index)=><li key={index}><span>{ingredient.name}</span><IngredientAmountView ingredient={ingredient} base={recipe.servings} servings={servings}/></li>)}</ul></section>}
      {recipe.stepPhotos?.[step]&&<RecipeImage className="cook-step-photo" src={recipe.stepPhotos[step]} alt={`手順${step+1}の写真`}/>}
    </div>
  </div>;
}

function useWakeLock(){
  useEffect(()=>{
    const api=(navigator as Navigator&{wakeLock?:{request:(type:'screen')=>Promise<{release:()=>Promise<void>}>}}).wakeLock;
    if(!api)return;
    let lock:{release:()=>Promise<void>}|null=null,active=true;
    const acquire=()=>{if(document.visibilityState!=='visible')return;void api.request('screen').then(next=>{if(active)lock=next;else void next.release();}).catch(()=>{});};
    acquire();document.addEventListener('visibilitychange',acquire);
    return()=>{active=false;document.removeEventListener('visibilitychange',acquire);void lock?.release().catch(()=>{});};
  },[]);
}
