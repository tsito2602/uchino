// The moment a saved recipe joins the book. The card formed in the import panel
// stays on screen while the panel folds away, then flies to its cell in the
// two-column grid and turns into the list card as it lands.
const ease='cubic-bezier(.22,.72,.18,1)';
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let ghost:HTMLElement|null=null;

function place(element:HTMLElement,rect:DOMRect){
  Object.assign(element.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
}
function face(source:Element){
  const copy=source.cloneNode(true) as HTMLElement;
  copy.classList.add('landing-face');copy.removeAttribute('id');copy.setAttribute('aria-hidden','true');copy.inert=true;
  return copy;
}

export function holdLanding(source:Element|null|undefined){
  cancelLanding();
  const rect=source?.getBoundingClientRect();
  if(!source||!rect||!rect.width||rect.bottom<0||rect.top>window.innerHeight||reduced())return;
  ghost=document.createElement('div');ghost.className='landing-ghost';
  ghost.style.borderRadius=getComputedStyle(source).borderRadius;
  place(ghost,rect);ghost.appendChild(face(source));document.body.appendChild(ghost);
}

export function cancelLanding(){ghost?.remove();ghost=null;}

// Words that leave the page as the first card arrives fade in place.
export function dissolve(element:Element|null){
  if(!element||reduced())return;
  const copy=face(element) as HTMLElement,rect=element.getBoundingClientRect();
  copy.classList.add('landing-dissolve');place(copy,rect);document.body.appendChild(copy);
  void copy.animate([{opacity:1,filter:'blur(0px)',transform:'none'},{opacity:0,filter:'blur(4px)',transform:'translateY(-8px) scale(.98)'}],{duration:380,easing:ease,fill:'forwards'}).finished.finally(()=>copy.remove());
}

export function playLanding(row:HTMLElement|null,delay=0){
  const flying=ghost;ghost=null;
  if(!row){if(flying)void flying.animate([{opacity:1},{opacity:0}],{duration:220,fill:'forwards'}).finished.finally(()=>flying.remove());return;}
  if(reduced())return;
  if(!flying){
    row.animate([{opacity:0,transform:'scale(.9)',filter:'blur(4px)'},{opacity:1,transform:'none',filter:'blur(0px)'}],{duration:640,easing:ease,delay:delay+120,fill:'backwards'});
    return;
  }
  const from=flying.getBoundingClientRect(),to=row.getBoundingClientRect(),radius=getComputedStyle(row).borderRadius;
  const target=face(row);target.classList.add('landing-target');flying.appendChild(target);
  const formed=flying.firstElementChild as HTMLElement;
  row.style.visibility='hidden';
  const box=(rect:DOMRect)=>({left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  const timing={duration:780,easing:ease,delay,fill:'both' as FillMode};
  const flight=flying.animate([
    {...box(from),borderRadius:flying.style.borderRadius,transform:'none'},
    {...box(to),borderRadius:radius,transform:'scale(1.035)',offset:.72},
    {...box(to),borderRadius:radius,transform:'none'},
  ],timing);
  formed.animate([{opacity:1},{opacity:0,offset:.5},{opacity:0}],timing);
  target.animate([{opacity:0},{opacity:0,offset:.18},{opacity:1,offset:.62},{opacity:1}],timing);
  const done=()=>{row.style.visibility='';flying.remove();};
  void flight.finished.then(done,done);
}
