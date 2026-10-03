import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import type {ImportProgress} from './import-progress';
import {haptic} from './haptics';

const stepWidths=['82%','66%','74%'];
const bumps=[16,39,62,86];
const limit=12;

function useTyped(text:string,reduced:boolean){
  const [count,setCount]=useState(0);
  useEffect(()=>{
    setCount(reduced?text.length:0);if(reduced||!text)return;
    const timer=setInterval(()=>setCount(value=>{if(value>=text.length){clearInterval(timer);return value;}return value+1;}),38);
    return()=>clearInterval(timer);
  },[text,reduced]);
  return count;
}

// While the AI reads, liquid sways at the bottom of a blank card with a
// blinking caret where the title will go. Once the recipe is known, the title
// is written in and each ingredient rises out of the liquid as a bubble that
// becomes its pill; the level falls as they leave, drains when all are in, and
// the card gives the dock's press-and-release.
export function ImportBubbleCard({progress}:{progress:ImportProgress}) {
  const {recipe,ingredients,phase,total}=progress;
  const reduced=typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const typed=useTyped(recipe?.title??'',reduced);
  const allIn=!!recipe&&ingredients.length===total;
  const done=allIn&&(phase==='checking'||phase==='photos');
  const shown=ingredients.slice(0,limit),extra=ingredients.length-shown.length;
  const pills=shown.length+(extra>0?1:0);
  const level=done?0:recipe&&total?1-.75*Math.min(1,ingredients.length/total):1;
  const card=useRef<HTMLDivElement>(null),rising=useRef<HTMLDivElement>(null),items=useRef<HTMLUListElement>(null);
  const sent=useRef(0);
  const [landed,setLanded]=useState(0);
  const filter=`import-goo-${useId().replace(/[^a-zA-Z0-9]/g,'')}`;
  useEffect(()=>{if(done)haptic();},[done]);
  useLayoutEffect(()=>{
    if(!recipe){sent.current=0;setLanded(0);}
  },[recipe]);
  // Launch a bubble for every pill that has not risen yet.
  useLayoutEffect(()=>{
    const host=card.current,layer=rising.current,list=items.current;
    if(!host||!layer||!list)return;
    if(reduced||!layer.animate){sent.current=pills;setLanded(pills);return;}
    const box=host.getBoundingClientRect();
    const surface=host.clientHeight-level*64;
    for(let i=sent.current;i<pills;i++){
      const li=list.children[i] as HTMLElement|undefined;if(!li)break;
      const r=li.getBoundingClientRect(),w=r.width,h=r.height;
      const x=r.left-box.left-host.clientLeft+w/2,y=r.top-box.top-host.clientTop+h/2;
      const bubble=document.createElement('i');layer.appendChild(bubble);
      const start=Math.max(20,Math.min(host.clientWidth-20,x+(i%2?10:-10)));
      const motion=bubble.animate([
        {transform:`translate(${start-11}px,${surface-6}px)`,width:'22px',height:'22px'},
        {transform:`translate(${x-w/2}px,${y-h/2}px)`,width:`${w}px`,height:`${h}px`},
      ],{duration:720,easing:'cubic-bezier(0.2,0.8,0.3,1)',fill:'forwards'});
      const index=i;
      motion.onfinish=()=>{bubble.remove();setLanded(value=>Math.max(value,index+1));};
      motion.oncancel=()=>bubble.remove();
    }
    sent.current=Math.max(sent.current,pills);
  },[pills,reduced]);
  // Finish with the dock's press (320ms) and release (900ms) once the liquid has drained.
  useEffect(()=>{
    const host=card.current;if(!done||reduced||!host?.animate)return;
    const timer=setTimeout(()=>{
      host.animate([{transform:'scale(1)'},{transform:'scale(1.03,1.05)'}],{duration:320,easing:'cubic-bezier(0.16,1,0.3,1)'}).onfinish=()=>
        host.animate([{transform:'scale(1.03,1.05)'},{transform:'scale(1)'}],{duration:900,easing:'cubic-bezier(0.22,0.72,0.18,1)'});
    },620);
    return()=>clearTimeout(timer);
  },[done,reduced]);
  return <div className="import-bubble" role="img" aria-label={recipe?`${recipe.title}を一枚のレシピにまとめています`:'レシピを読み取っています'}>
    <svg width="0" height="0" aria-hidden="true" style={{position:'absolute'}}><defs><filter id={filter}><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"/></filter></defs></svg>
    <div ref={card} className="import-bubble-card" data-waiting={!recipe||undefined} data-done={done||undefined} style={{'--level':level} as CSSProperties}>
      {!reduced&&<div className="import-bubble-goo" aria-hidden="true" style={{filter:`url(#${filter})`}}>
        <span className="import-bubble-pool"/>
        {bumps.map((left,i)=><span key={i} className="import-bubble-bump" style={{left:`${left}%`,animationDelay:`${i*-0.7}s`}}/>)}
        <div ref={rising}/>
      </div>}
      <strong className="import-bubble-title">{recipe?recipe.title.slice(0,typed):''}{(!recipe||typed<recipe.title.length)&&<i className="import-bubble-caret"/>}</strong>
      {recipe&&<>
        {shown.length>0&&<span className="import-bubble-label">材料</span>}
        <ul ref={items} className="import-bubble-items">
          {shown.map((item,i)=><li key={i} data-landed={i<landed||undefined}>{item.name}</li>)}
          {extra>0&&<li key="more" data-landed={limit<landed||undefined}>ほか{extra}品</li>}
        </ul>
        {allIn&&recipe.steps.length>0&&<><span className="import-bubble-label">作り方</span>
          <ol className="import-bubble-steps">{recipe.steps.slice(0,3).map((_,i)=><li key={i} style={{'--i':i,'--w':stepWidths[i]} as CSSProperties}><b>{i+1}</b><i/></li>)}</ol></>}
      </>}
    </div>
  </div>;
}
