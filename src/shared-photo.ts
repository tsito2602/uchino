// The list card's photo and the detail's hero are one picture: opening a
// recipe stretches the card's photo into the hero while the panel unfolds, and
// closing shrinks the hero back into the card it came from.
import {panelTiming} from './kondo-panel-motion';

let origin:{photo:HTMLElement;rect:DOMRect;radius:string}|null=null;
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const visible=(rect:DOMRect)=>rect.width>0&&rect.bottom>0&&rect.top<window.innerHeight;

function fly(source:HTMLElement,from:DOMRect,fromRadius:string,to:DOMRect,toRadius:string,duration:number,hide:HTMLElement[]){
  const ghost=source.cloneNode(true) as HTMLElement;
  ghost.classList.add('photo-ghost');ghost.setAttribute('aria-hidden','true');
  document.body.appendChild(ghost);for(const element of hide)element.style.visibility='hidden';
  const box=(rect:DOMRect,radius:string)=>({left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,borderRadius:radius});
  const flight=ghost.animate([box(from,fromRadius),box(to,toRadius)],{duration,easing:panelTiming.easing,fill:'forwards'});
  const done=()=>{for(const element of hide)element.style.visibility='';ghost.remove();};
  void flight.finished.then(done,done);
}

export function rememberCardPhoto(card:HTMLElement){
  const photo=card.querySelector<HTMLElement>('.recipe-photo');
  origin=photo&&!reduced()?{photo,rect:photo.getBoundingClientRect(),radius:getComputedStyle(photo).borderRadius}:null;
}

export function openPhoto(hero:HTMLElement|null){
  if(!origin||!hero||!origin.photo.isConnected)return;
  const to=hero.getBoundingClientRect();if(!visible(to))return;
  fly(origin.photo,origin.rect,origin.radius,to,getComputedStyle(hero).borderRadius,panelTiming.duration as number,[hero]);
}

export function closePhoto(hero:HTMLElement|null){
  const target=origin;origin=null;
  if(!target||!hero||reduced()||!target.photo.isConnected)return;
  const from=hero.getBoundingClientRect();if(!visible(from))return;
  fly(hero,from,getComputedStyle(hero).borderRadius,target.rect,target.radius,Math.round((panelTiming.duration as number)/1.15),[hero,target.photo]);
}
