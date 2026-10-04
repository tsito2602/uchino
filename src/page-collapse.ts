import {useEffect} from 'react';

// As the list scrolls, the large page heading eases away and a slim glass bar
// takes its place at the top; at the top (and in the iPhone rubber band) the
// heading grows back. One CSS variable carries the progress, 0 to 1, plus the
// overscroll stretch.
const RANGE=64;
export function usePageCollapse(){
  useEffect(()=>{
    const root=document.documentElement;let frame=0;
    const paint=()=>{frame=0;const y=window.scrollY;root.style.setProperty('--collapse',String(Math.min(1,Math.max(0,y/RANGE)).toFixed(3)));root.style.setProperty('--stretch',String(Math.min(1,Math.max(0,-y/120)).toFixed(3)));};
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint);};
    paint();window.addEventListener('scroll',schedule,{passive:true});
    return()=>{window.removeEventListener('scroll',schedule);cancelAnimationFrame(frame);root.style.removeProperty('--collapse');root.style.removeProperty('--stretch');};
  },[]);
}
