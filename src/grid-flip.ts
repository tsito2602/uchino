import {useLayoutEffect,useRef,type RefObject} from 'react';

// When recipes join or leave the two-column grid, every card glides from its
// old cell to its new one in reading order, so a card that wraps from the right
// column to the next row travels there instead of jumping. Cards nobody added
// here (a sync from the partner) grow in place. Filtering and switching books
// swap the whole set, so those changes are left to the page's own motion.
const ease='cubic-bezier(.22,.72,.18,1)';
type Cell={left:number;top:number};

export function useGridFlip(list:RefObject<HTMLElement|null>,ids:string[],{context,skip}:{context:string;skip:string|null}){
  const cells=useRef(new Map<string,Cell>()),previous=useRef<{context:string;ids:string[]}|null>(null);
  const key=ids.join('|');
  useLayoutEffect(()=>{
    const root=list.current;
    const rows=root?[...root.querySelectorAll<HTMLElement>(':scope>[data-recipe-id]')]:[];
    const next=new Map<string,Cell>(rows.map(row=>[row.dataset.recipeId!,{left:row.offsetLeft,top:row.offsetTop}]));
    const before=previous.current,old=cells.current;
    previous.current={context,ids};cells.current=next;
    if(!root||!before||before.context!==context||!before.ids.length||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const kept=ids.filter(id=>old.has(id));
    if(!kept.length||ids.join('|')===before.ids.join('|'))return;
    const viewport=window.innerHeight;let moved=0;
    for(const row of rows){
      const id=row.dataset.recipeId!,to=next.get(id)!,from=old.get(id);
      if(row.getBoundingClientRect().top>viewport+80)continue;
      if(from){
        const dx=from.left-to.left,dy=from.top-to.top;if(!dx&&!dy)continue;
        row.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:620,easing:ease,delay:Math.min(moved++,8)*45,fill:'backwards'});
      }else if(id!==skip){
        row.animate([{opacity:0,transform:'scale(.9)',filter:'blur(4px)'},{opacity:1,transform:'none',filter:'blur(0px)'}],{duration:680,easing:ease,delay:160,fill:'backwards'});
      }
    }
  },[key,context]);
}
