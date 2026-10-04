// The launch animation in index.html runs from the first paint, which on a
// cold PWA launch can come well after navigation starts. So the cover waits
// for the wordmark's last letter to actually finish, holds a beat, then hands
// over: the pot turns into a drop of ink, falls, and spreads into the dock.
// Without a dock on screen (sign-in) the cover simply fades.
const HOLD=300,LEAVE=260,LIMIT=4500;
const EASE='cubic-bezier(.5,0,.3,1)';
export function finishBoot(){
  const screen=document.getElementById('initial-boot');if(!screen)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){screen.remove();return;}
  let done=false;
  const fade=()=>{screen.classList.add('boot-leaving');window.setTimeout(()=>screen.remove(),LEAVE);};
  const leave=()=>{if(done)return;done=true;requestAnimationFrame(()=>{if(!toDock(screen))fade();});};
  const last=[...screen.querySelectorAll('.boot-name [data-letter]')].pop(),animation=last?.getAnimations?.()[0];
  if(animation)void animation.finished.then(()=>window.setTimeout(leave,HOLD),leave);
  else window.setTimeout(leave,Math.max(0,2100-performance.now()));
  window.setTimeout(leave,LIMIT);
}

function toDock(screen:HTMLElement){
  const dock=document.querySelector<HTMLElement>('.kondo-floating-dock'),pot=screen.querySelector<SVGElement>('.boot-pot');
  if(!dock||!pot||!screen.animate)return false;
  const d=dock.getBoundingClientRect(),p=pot.getBoundingClientRect();
  if(!d.width||!p.width)return false;
  const drop=document.createElement('div');
  drop.style.cssText=`position:fixed;left:0;top:0;background:${getComputedStyle(screen).color};pointer-events:none`;
  screen.appendChild(drop);
  const box=(left:number,top:number,width:number,height:number)=>({left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`,borderRadius:`${height/2}px`});
  const cx=p.left+p.width/2,FALL=180,MORPH=760,landAt=FALL+MORPH*.8;
  screen.querySelector('.boot-name')?.animate([{opacity:1},{opacity:0,filter:'blur(4px)',transform:'translateY(6px)'}],{duration:260,easing:'ease-in',fill:'forwards'});
  screen.querySelector('.boot-lid')?.animate([{opacity:1},{opacity:0,transform:'translateY(-40px) rotate(-14deg)'}],{duration:420,easing:'cubic-bezier(.5,0,.8,.4)',fill:'forwards'});
  pot.animate([{opacity:1},{opacity:0}],{duration:120,delay:FALL,fill:'forwards'});
  screen.querySelector('.boot-steam')?.animate([{opacity:1},{opacity:0}],{duration:200,fill:'forwards'});
  drop.animate([
    {...box(p.left,p.top+p.height*.12,p.width,p.height*.82),opacity:1},
    {...box(cx-p.width*.36,p.top+p.height*.5,p.width*.72,p.height*1.1),offset:.3},
    {...box(cx-40,d.top-26,80,70),offset:.62},
    {...box(d.left-8,d.top+4,d.width+16,d.height-8),offset:.8,opacity:1},
    {...box(d.left,d.top,d.width,d.height),opacity:0},
  ],{duration:MORPH,delay:FALL,easing:EASE,fill:'both'});
  screen.animate([{backgroundColor:getComputedStyle(screen).backgroundColor},{backgroundColor:'transparent'}],{duration:420,delay:400,easing:'ease-out',fill:'forwards'});
  const total=FALL+MORPH+80;
  dock.animate([{opacity:0},{opacity:0,offset:landAt/total},{opacity:1}],{duration:total});
  document.getElementById('main-content')?.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:560,delay:620,easing:'cubic-bezier(.22,.72,.18,1)',fill:'backwards'});
  window.setTimeout(()=>screen.remove(),total);
  return true;
}
