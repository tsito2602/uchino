import {useLayoutEffect,useRef} from 'react';

export function SelectionCountBadge({count}:{count:number}){
  const badge=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{
    const node=badge.current!;
    node.classList.remove('is-bumping');
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    // Reset the transition before reflow so even rapid sweeps restart at rest.
    node.style.transition='none';
    void node.offsetWidth;
    node.style.transition='';
    node.classList.add('is-bumping');
    const timer=window.setTimeout(()=>node.classList.remove('is-bumping'),320);
    return()=>window.clearTimeout(timer);
  },[count]);
  return <small ref={badge} className="context-action-count" aria-hidden="true">{count}</small>;
}
