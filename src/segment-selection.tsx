import {useLayoutEffect,useRef} from 'react';

// The white face of a segmented switch moves like the dock: it first stretches
// to reach the new option, then lets go of the old one.
export function SegmentSelection({index}:{index:number}){
  const face=useRef<HTMLSpanElement>(null),previous=useRef(index);
  useLayoutEffect(()=>{
    const from=previous.current;previous.current=index;
    const node=face.current;
    if(!node||from===index||from<0||index<0||!node.animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const width=node.offsetWidth,step=width+4,left=(i:number)=>4+i*step;
    const start=Math.min(from,index),span=Math.abs(index-from)*step+width;
    const animation=node.animate([
      {left:`${left(from)}px`,width:`${width}px`,transform:'none'},
      {left:`${left(start)}px`,width:`${span}px`,transform:'scaleY(.92)',offset:.42},
      {left:`${left(index)}px`,width:`${width}px`,transform:'none'},
    ],{duration:640,easing:'cubic-bezier(0.22,0.72,0.18,1)'});
    return()=>animation.cancel();
  },[index]);
  return <span ref={face} className="appearance-selection" aria-hidden="true"/>;
}
