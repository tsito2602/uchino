import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import type {ImportProgress} from './import-progress';
import {haptic} from './haptics';

const stepWidths=['82%','66%','74%'];
const depth=64;
const limit=12;
// Emerging: the swell peaks at PEAK, the drop flies for FLIGHT, then the wobble.
const PEAK=240,FLIGHT=460,EMERGE=1300,SWELL=20;

function useTyped(text:string,reduced:boolean){
  const [count,setCount]=useState(0);
  useEffect(()=>{
    setCount(reduced?text.length:0);if(reduced||!text)return;
    const timer=setInterval(()=>setCount(value=>{if(value>=text.length){clearInterval(timer);return value;}return value+1;}),38);
    return()=>clearInterval(timer);
  },[text,reduced]);
  return count;
}

// While the AI reads, liquid waves at the bottom of a blank card with a
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
    const level=done?0:recipe&&total?1-.75*Math.min(1,ingredients.length/total):1;
  const card=useRef<HTMLDivElement>(null),rising=useRef<HTMLDivElement>(null),items=useRef<HTMLUListElement>(null);
  const bumps=useRef<{x:number;at:number}[]>([]),surfacePath=useRef<SVGPathElement>(null),levelRef=useRef(level),targetRef=useRef(level);
  targetRef.current=level;
  const [landed,setLanded]=useState(0);
  const filter=`import-goo-${useId().replace(/[^a-zA-Z0-9]/g,'')}`;
  useEffect(()=>{if(done)haptic();},[done]);
  useLayoutEffect(()=>{
    if(!recipe)setLanded(0);
  },[recipe]);
  // Every pill, label and step row comes out of the liquid itself: the wave
  // swells into a peak below its place, a drop pulls away from the peak (the goo
  // filter keeps them joined at first), flies up and becomes the element, which
  // lands with a jelly wobble.
  useLayoutEffect(()=>{
    const host=card.current,layer=rising.current;
    if(!host)return;
    const fresh=[...host.querySelectorAll<HTMLElement>('[data-emerge]:not([data-emerged])')];
    if(!fresh.length)return;
    const pillsList=items.current?[...items.current.children]:[];
    const land=(el:HTMLElement)=>{const index=pillsList.indexOf(el);if(index>=0)setLanded(value=>Math.max(value,index+1));};
    if(reduced||!layer||!host.animate){for(const el of fresh){el.dataset.emerged='';land(el);}return;}
    const box=host.getBoundingClientRect(),surface=host.clientHeight-levelRef.current*depth,now=performance.now();
    fresh.forEach((el,order)=>{
      el.dataset.emerged='';
      const r=el.getBoundingClientRect(),y=r.top-box.top-host.clientTop,x=r.left-box.left-host.clientLeft;
      const pill=pillsList.includes(el),w=pill?r.width:Math.min(r.width,r.height+6),h=r.height;
      const cx=x+w/2,delay=order*90;
      bumps.current.push({x:cx,at:now+delay});
      const total=EMERGE,landAt=(PEAK+FLIGHT)/total;
      el.style.opacity='1';
      el.animate([
        {opacity:0,transform:'scale(.6,.5)'},
        {opacity:0,transform:'scale(.6,.5)',offset:landAt-.02},
        {opacity:1,transform:'scale(1.16,.8)',offset:landAt},
        {transform:'scale(.93,1.08)',offset:landAt+(1-landAt)*.3},
        {transform:'scale(1.04,.97)',offset:landAt+(1-landAt)*.58},
        {transform:'scale(.99,1.01)',offset:landAt+(1-landAt)*.8},
        {opacity:1,transform:'none'},
      ],{duration:total,delay,easing:'linear',fill:'backwards'}).onfinish=()=>land(el);
      // The drop: born at the peak of the swell, stretched as it leaves, the
      // element's own size by the time it arrives.
      const drop=document.createElement('i');layer.appendChild(drop);
      const seed=14,top=surface-SWELL;
      drop.style.opacity='0';
      const at=(px:number,py:number,dw:number,dh:number)=>({transform:`translate(${px}px,${py}px)`,width:`${dw}px`,height:`${dh}px`});
      const motion=drop.animate([
        {opacity:0,...at(cx-seed/2,top+4,seed,seed)},
        {opacity:1,...at(cx-seed/2,top-2,seed,seed),offset:PEAK/total*.7},
        {opacity:1,...at(cx-seed*.4,top-seed*1.3,seed*.8,seed*1.5),offset:PEAK/total,easing:'cubic-bezier(.25,.75,.3,1)'},
        {opacity:1,...at(x,y,w,h),offset:landAt},
        {opacity:0,...at(x,y,w,h),offset:Math.min(1,landAt+.06)},
        {opacity:0,...at(x,y,w,h)},
      ],{duration:total,delay,fill:'forwards'});
      motion.onfinish=motion.oncancel=()=>drop.remove();
    });
  });
  // The liquid is a wave: two sines that drift against each other. The level
  // eases toward its target, and the swell calms as the liquid drains.
  useEffect(()=>{
    const host=card.current,path=surfacePath.current;if(!host||!path||reduced)return;
    let frame=0;const start=performance.now();
    const draw=(now:number)=>{
      const t=(now-start)/1000,w=host.clientWidth,h=host.clientHeight;
      levelRef.current+=(targetRef.current-levelRef.current)*.06;
      const level=levelRef.current,swell=Math.min(1,level*2.4),top=h-level*depth;
      let d=`M -10 ${h+10} L -10 ${top.toFixed(1)}`;
      // Each swell rises to a peak, lets the drop go and settles back with a dip.
      bumps.current=bumps.current.filter(b=>now-b.at<PEAK+700);
      const lift=bumps.current.map(b=>{const a=(now-b.at)/PEAK;return {x:b.x,h:a<0?0:a<1?SWELL*Math.sin(a*Math.PI/2):SWELL*Math.cos(Math.min(3,(a-1)*2.2))*Math.exp(-(a-1)*1.6)};});
      for(let x=-10;x<=w+10;x+=6){let y=top+swell*(7*Math.sin(x/42+t*2.4)+4*Math.sin(x/19-t*3.3));for(const b of lift)y-=b.h*Math.exp(-(((x-b.x)/16)**2));d+=` L ${x} ${y.toFixed(1)}`;}
      path.setAttribute('d',`${d} L ${w+10} ${h+10} Z`);
      if(level>.002||targetRef.current>0||bumps.current.length)frame=requestAnimationFrame(draw);
      else path.setAttribute('d','');
    };
    frame=requestAnimationFrame(draw);
    return()=>cancelAnimationFrame(frame);
  },[reduced,done]);
  // Finish with the dock's press (320ms) and release (900ms) once the liquid has drained.
  useEffect(()=>{
    const host=card.current;if(!done||reduced||!host?.animate)return;
    const timer=setTimeout(()=>{
      host.animate([{transform:'scale(1)'},{transform:'scale(1.03,1.05)'}],{duration:320,easing:'cubic-bezier(0.16,1,0.3,1)'}).onfinish=()=>
        host.animate([{transform:'scale(1.03,1.05)'},{transform:'scale(1)'}],{duration:900,easing:'cubic-bezier(0.22,0.72,0.18,1)'});
    },620);
    return()=>clearTimeout(timer);
  },[done,reduced]);
  return <div className="import-bubble" role="img" aria-label={recipe?`${recipe.title}を読み取っています`:'レシピを読み取っています'}>
    <svg width="0" height="0" aria-hidden="true" style={{position:'absolute'}}><defs><filter id={filter}><feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"/></filter></defs></svg>
    <div ref={card} className="import-bubble-card" data-waiting={!recipe||undefined} data-done={done||undefined}>
      {!reduced&&<div className="import-bubble-goo" aria-hidden="true" style={{filter:`url(#${filter})`}}>
        <svg className="import-bubble-wave"><path ref={surfacePath}/></svg>
        <div ref={rising}/>
      </div>}
      <strong className="import-bubble-title">{recipe?recipe.title.slice(0,typed):''}{(!recipe||typed<recipe.title.length)&&<i className="import-bubble-caret"/>}</strong>
      {recipe&&<>
        {shown.length>0&&<span className="import-bubble-label" data-emerge="">材料</span>}
        <ul ref={items} className="import-bubble-items">
          {shown.map((item,i)=><li key={i} data-emerge="" data-landed={i<landed||undefined}>{item.name}</li>)}
          {extra>0&&<li key="more" data-emerge="" data-landed={limit<landed||undefined}>ほか{extra}品</li>}
        </ul>
        {allIn&&recipe.steps.length>0&&<><span className="import-bubble-label" data-emerge="">作り方</span>
          <ol className="import-bubble-steps">{recipe.steps.slice(0,3).map((_,i)=><li key={i} data-emerge="" style={{'--i':i,'--w':stepWidths[i]} as CSSProperties}><b>{i+1}</b><i/></li>)}</ol></>}
      </>}
    </div>
  </div>;
}
