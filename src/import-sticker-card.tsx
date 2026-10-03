import {useEffect,useState,type CSSProperties} from 'react';
import type {ImportProgress} from './import-progress';
import {haptic} from './haptics';

const tones=['#ffe08a','#ffb3c7','#a8e6cf','#a7c7ff','#d7b8ff','#ffd0a8'];
const stepTones=['#ff6b4a','#3cc497','#ff7fae'];
const stepWidths=['82%','66%','74%'];
const limit=12;

// Stable per-index jitter, so a sticker keeps its tilt across re-renders.
function jitter(i:number,salt:number){const x=Math.sin(i*12.9898+salt*78.233)*43758.5453;return x-Math.floor(x);}
function sticker(i:number):CSSProperties{
  const angle=jitter(i,1)*Math.PI*2;
  return {'--from-x':`${Math.round(Math.cos(angle)*220)}px`,'--from-y':`${Math.round(Math.sin(angle)*150-70)}px`,'--rot':`${((jitter(i,2)-.5)*12).toFixed(1)}deg`,'--spin':`${Math.round((jitter(i,3)-.5)*200)}deg`,'--tone':tones[i%tones.length]} as CSSProperties;
}
function useTyped(text:string,reduced:boolean){
  const [count,setCount]=useState(0);
  useEffect(()=>{
    setCount(reduced?text.length:0);if(reduced||!text)return;
    const timer=setInterval(()=>setCount(value=>{if(value>=text.length){clearInterval(timer);return value;}return value+1;}),38);
    return()=>clearInterval(timer);
  },[text,reduced]);
  return count;
}

// While the AI reads, the blank card floats with a blinking caret where the
// title will go; nothing is shown that is not real. Once the recipe is known,
// its title is written in, each ingredient is slapped on as a sticker, the
// steps line up, and a 「できた」 stamp closes the card.
export function ImportStickerCard({progress}:{progress:ImportProgress}) {
  const {recipe,ingredients,phase,total}=progress;
  const reduced=typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const typed=useTyped(recipe?.title??'',reduced);
  const allIn=!!recipe&&ingredients.length===total;
  const done=allIn&&(phase==='checking'||phase==='photos');
  useEffect(()=>{if(done)haptic();},[done]);
  const shown=ingredients.slice(0,limit),extra=ingredients.length-shown.length;
  return <div className="import-sticker" role="img" aria-label={recipe?`${recipe.title}を一枚のレシピにまとめています`:'レシピを読み取っています'}>
    <div className="import-sticker-card" data-waiting={!recipe||undefined} data-done={done||undefined}>
      {recipe?<>
        <strong className="import-sticker-title">{recipe.title.slice(0,typed)}{typed<recipe.title.length&&<i className="import-sticker-caret"/>}</strong>
        {shown.length>0&&<span className="import-sticker-label">材料</span>}
        <ul className="import-sticker-items">
          {shown.map((item,i)=><li key={i} style={sticker(i)}>{item.name}</li>)}
          {extra>0&&<li key="more" style={sticker(limit)}>ほか{extra}品</li>}
        </ul>
        {allIn&&recipe.steps.length>0&&<><span className="import-sticker-label">作り方</span>
          <ol className="import-sticker-steps">{recipe.steps.slice(0,3).map((_,i)=><li key={i} style={{'--i':i,'--tone':stepTones[i],'--w':stepWidths[i]} as CSSProperties}><b>{i+1}</b><i/></li>)}</ol></>}
        {done&&<><span className="import-sticker-stamp">できた</span><span className="import-sticker-burst">{[0,1,2,3,4].map(i=><i key={i} style={{'--tone':stepTones[i%3],'--dx':`${[-46,-20,30,48,6][i]}px`,'--dy':`${[-30,-52,-44,-6,30][i]}px`} as CSSProperties}/>)}</span></>}
      </>:<strong className="import-sticker-title"><i className="import-sticker-caret"/></strong>}
    </div>
  </div>;
}
