// The launch animation in index.html runs from the first paint, which on a
// cold PWA launch can come well after navigation starts. So the cover waits
// for the wordmark's last letter to actually finish, holds a beat, then fades.
const HOLD=380,LEAVE=260,LIMIT=4500;
export function finishBoot(){
  const screen=document.getElementById('initial-boot');if(!screen)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){screen.remove();return;}
  let done=false;
  const leave=()=>{if(done)return;done=true;requestAnimationFrame(()=>{screen.classList.add('boot-leaving');window.setTimeout(()=>screen.remove(),LEAVE);});};
  const last=[...screen.querySelectorAll('.boot-name [data-letter]')].pop(),animation=last?.getAnimations?.()[0];
  if(animation)void animation.finished.then(()=>window.setTimeout(leave,HOLD),leave);
  else window.setTimeout(leave,Math.max(0,2100-performance.now()));
  window.setTimeout(leave,LIMIT);
}
