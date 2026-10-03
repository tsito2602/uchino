import {useLayoutEffect,useRef} from 'react';

// The servings number (not its 人分 label) glides up (more) or down (fewer) with the dock's release
// timing; the leaving number keeps going from wherever it is, so repeated taps
// flow into each other. The edges fade so nothing pops in or out.
export function ServingsCount({value}:{value:number}){
  const root=useRef<HTMLSpanElement>(null),current=useRef<HTMLSpanElement>(null),previous=useRef(value);
  useLayoutEffect(()=>{
    const before=previous.current;previous.current=value;
    const node=root.current,now=current.current;
    if(!node||!now||before===value||!now.animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const up=value>before,distance=node.clientHeight||22,timing={duration:520,easing:'cubic-bezier(0.22,0.72,0.18,1)'};
    // The leaving number is drawn from an attribute, so the group's text stays the current value.
    const leaving=document.createElement('span');
    leaving.className='servings-count-value servings-count-leaving';leaving.dataset.value=String(before);leaving.setAttribute('aria-hidden','true');
    const from=new DOMMatrix(getComputedStyle(now).transform).m42;
    node.appendChild(leaving);
    leaving.animate([{transform:`translateY(${from}px)`},{transform:`translateY(${up?-distance:distance}px)`}],{...timing,fill:'forwards'}).onfinish=()=>leaving.remove();
    now.animate([{transform:`translateY(${up?distance:-distance}px)`},{transform:'translateY(0)'}],timing);
  },[value]);
  return <span className="servings-count"><span className="servings-count-reel" ref={root}><span className="servings-count-value" ref={current}>{value}</span></span><small>人分</small></span>;
}
