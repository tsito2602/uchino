// The launch animation in index.html runs from the first paint. Once the app
// has rendered and the animation has played out, the cover fades away.
const BOOT_END=1950,LEAVE=260;
export function finishBoot(){
  const screen=document.getElementById('initial-boot');if(!screen)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(reduced){screen.remove();return;}
    screen.classList.add('boot-leaving');window.setTimeout(()=>screen.remove(),LEAVE);
  })),reduced?0:Math.max(0,BOOT_END-performance.now()));
}
