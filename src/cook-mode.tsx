import {useEffect,useRef} from 'react';
import type {Recipe} from './domain';
import {IngredientAmountView} from './ingredient-amount-view';
import {RecipeImage} from './recipe-image';
import {StepText} from './step-text';
import {splitReferences,stepUsage} from './step-ingredients';

// The step count and gauge sit in the panel header, so the body is the step.
export function CookCount({step,total}:{step:number;total:number}){
  return <p className="cook-count" aria-label={`手順${step+1}／${total}`}><strong>{step+1}</strong><span>／{total}</span></p>;
}
export function CookProgress({step,total}:{step:number;total:number}){
  return <div className="cook-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step+1} aria-label={`手順${step+1}／${total}`}>
    {Array.from({length:total},(_,index)=><span key={index} data-state={index<step?'done':index===step?'current':undefined}/>)}
  </div>;
}
export function CookReference({kind,label}:{kind:'step'|'group';label:string}){
  return <span className="cook-ref" data-kind={kind}>{label}</span>;
}

// Cooking, one step at a time: large type, the ingredients this step uses at
// the chosen servings, and the screen kept awake. A step that says "1を加え"
// or "Aを加える" shows what 1 and A are. Steps move from the dock or with a
// sideways swipe.
export function CookMode({recipe,servings,step,resumed,onStep}:{recipe:Recipe;servings:number;step:number;resumed?:number;onStep:(step:number)=>void}){
  const text=recipe.steps[step]??'',total=recipe.steps.length;
  const usage=stepUsage(recipe.ingredients,recipe.steps,step);
  useWakeLock();
  const swipe=useRef<{x:number;y:number}|null>(null);
  const list=(items:number[])=><ul>{items.map(index=>{const ingredient=recipe.ingredients[index];return <li key={index}><span>{ingredient.name}</span><IngredientAmountView ingredient={ingredient} base={recipe.servings} servings={servings}/></li>;})}</ul>;
  const shown=usage.direct.length>0||usage.references.some(reference=>reference.items.length>0);
  return <div className="cook-mode"
    onTouchStart={event=>{const t=event.touches[0];swipe.current=event.touches.length===1?{x:t.clientX,y:t.clientY}:null;}}
    onTouchEnd={event=>{const start=swipe.current,t=event.changedTouches[0];swipe.current=null;if(!start||!t)return;const dx=t.clientX-start.x,dy=t.clientY-start.y;if(Math.abs(dx)<56||Math.abs(dx)<Math.abs(dy)*1.4)return;const next=step+(dx<0?1:-1);if(next>=0&&next<total)onStep(next);}}>
    {resumed!==undefined&&resumed===step&&<p className="cook-resumed"><span>手順{step+1}から再開しました</span><button type="button" onClick={()=>onStep(0)}>最初から</button></p>}
    <div className="cook-step" key={step}>
      <p className="cook-step-text">{splitReferences(text,usage).map((part,index)=>part.reference?<CookReference key={index} {...part.reference}/>:<StepText key={index} text={part.text} label={`手順${step+1}`}/>)}</p>
      {shown&&<section className="cook-uses" aria-label="この手順で使う材料">
        <h3>この手順で使う</h3>
        {usage.direct.length>0&&list(usage.direct)}
        {usage.references.map(reference=><div className="cook-uses-ref" key={`${reference.kind}-${reference.label}`}>
          <h4><CookReference kind={reference.kind} label={reference.label}/>{reference.kind==='step'?<>手順{reference.label}で用意したもの<button type="button" className="cook-ref-jump" onClick={()=>onStep(reference.step)}>見る</button></>:<>{reference.label}の材料</>}</h4>
          {reference.items.length>0?list(reference.items):<p className="cook-ref-text">{recipe.steps[reference.kind==='step'?reference.step:0]}</p>}
        </div>)}
      </section>}
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
