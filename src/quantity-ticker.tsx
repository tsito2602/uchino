// uchiwake's layout-based digit reels, adapted for recipe fractions and units.
import {useLayoutEffect,useRef,type RefObject} from 'react';
import './quantity-ticker.css';

const DIGITS=Array.from({length:10},(_,i)=>i),HEIGHT=1.1,DURATION=520,STAGGER=30;
// Every token shares the same width transition. Stable empty slots let labels,
// brackets and extra spoon amounts slide together without a layout jump.
function useQuantityWidth(root:RefObject<HTMLSpanElement|null>,value:string,measure:string){
  useLayoutEffect(()=>{
    const node=root.current!,text=node.querySelector<HTMLElement>(measure)!;
    const from=node.getBoundingClientRect().width,to=text.getBoundingClientRect().width;
    const initialized=!!node.style.width;
    node.style.width=`${to}px`;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    if(!initialized||reduced.matches||Math.abs(from-to)<.1)return;
    const animation=node.animate([{width:`${from}px`},{width:`${to}px`}],{duration:DURATION,easing:'cubic-bezier(0.22,0.72,0.18,1)'});
    const finish=()=>animation.finish();
    reduced.addEventListener('change',finish);document.addEventListener('visibilitychange',finish);
    return()=>{
      node.style.width=`${node.getBoundingClientRect().width}px`;
      animation.cancel();reduced.removeEventListener('change',finish);document.removeEventListener('visibilitychange',finish);
    };
  },[root,value,measure]);
}

export function QuantityLabel({value,className=''}:{value:string;className?:string}){
  const root=useRef<HTMLSpanElement>(null),previous=useRef<string|null>(null);
  useQuantityWidth(root,value,'.quantity-label-static');
  useLayoutEffect(()=>{
    const before=previous.current;previous.current=value;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    if(before===null||before===value||!value||reduced.matches)return;
    const text=root.current!.querySelector<HTMLElement>('.quantity-label-text')!;
    const animation=text.animate([{opacity:0,transform:'translateX(.25em)'},{opacity:1,transform:'translateX(0)'}],{duration:250,easing:'ease-out'});
    const finish=()=>animation.finish();
    reduced.addEventListener('change',finish);document.addEventListener('visibilitychange',finish);
    return()=>{animation.cancel();reduced.removeEventListener('change',finish);document.removeEventListener('visibilitychange',finish);};
  },[value]);
  return <span className={`quantity-label ${className}`} ref={root}><span className="quantity-label-static" aria-hidden="true">{value}</span><span className="quantity-label-text">{value}</span></span>;
}

type Glyph={char:string;key:string;digit?:number};
function glyphs(text:string):Glyph[]{
  const result:Glyph[]=[];
  const number=(value:string,part:string)=>Array.from(value).forEach((char,i)=>result.push({char,key:`${part}-${part==='decimal'?i:value.length-1-i}`,digit:Number(char)}));
  const separator=(char:string)=>result.push({char,key:`separator-${result.length}`});
  const fraction=text.match(/^(?:(\d+)と)?(\d+)\/(\d+)$/);
  if(fraction){if(fraction[1]){number(fraction[1],'whole');separator('と');}number(fraction[2],'numerator');separator('/');number(fraction[3],'denominator');}
  else if(/^\d+(?:\.\d+)?$/.test(text)){const [whole,decimal]=text.split('.');number(whole,'whole');if(decimal){separator('.');number(decimal,'decimal');}}
  return result;
}

export function QuantityTicker({value}:{value:string}){
  const root=useRef<HTMLSpanElement>(null),previous=useRef<string|null>(null),positions=useRef(new Map<string,number>());
  const characters=glyphs(value);
  useQuantityWidth(root,value,'.quantity-ticker-static');
  useLayoutEffect(()=>{
    const node=root.current!;
    const before=previous.current;previous.current=value;node.dataset.settled='true';
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const reels=[...node.querySelectorAll<HTMLElement>('[data-digit]')].map(reel=>{
      const key=reel.dataset.place!,to=Number(reel.dataset.digit);
      // A newly appearing denominator is already valid; never reveal 0/0.
      return {reel,key,from:positions.current.get(key)??(key.startsWith('denominator')?to:0),to};
    });
    const settle=()=>{node.dataset.settled='true';positions.current=new Map(reels.map(({key,to})=>[key,to]));};
    const bounds=node.getBoundingClientRect();
    if(before===null||before===value||!reels.length||reduced.matches||bounds.bottom<0||bounds.top>innerHeight){settle();return;}
    let frame=0,timer=0,finished=false;
    const changed=reels.filter(({from,to})=>from!==to),started=performance.now(),duration=DURATION+Math.max(0,changed.length-1)*STAGGER;
    if(!changed.length){settle();return;}
    const finish=()=>{if(finished)return;finished=true;cancelAnimationFrame(frame);clearTimeout(timer);settle();};
    const tick=(now:number)=>{
      if(finished)return;
      const elapsed=now-started;if(elapsed>=duration){finish();return;}
      changed.forEach(({reel,key,from,to},i)=>{
        const t=Math.min(1,Math.max(0,(elapsed-i*STAGGER)/DURATION)),position=from+(to-from)*(1-Math.pow(1-t,4));
        positions.current.set(key,position);reel.style.top=`${-position*HEIGHT}em`;
      });
      node.dataset.settled='false';frame=requestAnimationFrame(tick);
    };
    timer=window.setTimeout(finish,duration+100);frame=requestAnimationFrame(tick);
    reduced.addEventListener('change',finish);document.addEventListener('visibilitychange',finish);
    return()=>{finished=true;cancelAnimationFrame(frame);clearTimeout(timer);node.dataset.settled='true';reduced.removeEventListener('change',finish);document.removeEventListener('visibilitychange',finish);};
  },[value]);
  return <span className="quantity-ticker" data-settled="true" ref={root}>
    <span className="visually-hidden quantity-ticker-accessible">{value}</span>
    <span className="quantity-ticker-static" aria-hidden="true">{value}</span>
    <span className="quantity-ticker-glyphs" aria-hidden="true">{characters.map(({char,key,digit})=><span className="quantity-ticker-slot" key={key} style={{width:digit!==undefined?'1ch':char==='と'?'1em':'.5ch'}}>{digit===undefined?char:<span className="quantity-ticker-reel" data-place={key} data-digit={digit} style={{top:`${-digit*HEIGHT}em`}}>{DIGITS.map(number=><span key={number}>{number}</span>)}</span>}</span>)}</span>
  </span>;
}
