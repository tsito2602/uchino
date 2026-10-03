import {useRef,useState,type CSSProperties} from 'react';
import {haptic} from './haptics';
import {Heart} from 'lucide-react';
import type {Recipe} from './domain';

export function RecipeFavorite({recipe,onToggle}:{recipe:Recipe;onToggle:()=>void}){
  const sequence=useRef(0);
  const [motion,setMotion]=useState<{id:number;favorite:boolean}|null>(null);
  const animate=motion&&motion.favorite===recipe.favorite;
  return <button type="button" className="recipe-favorite" aria-pressed={recipe.favorite}
    aria-label={`${recipe.title}を${recipe.favorite?'お気に入りから外す':'お気に入りに追加'}`}
    onClick={()=>{haptic();setMotion({id:++sequence.current,favorite:!recipe.favorite});onToggle();}}>
    <span key={motion?.id??0} className="recipe-favorite-heart" data-motion={animate?(recipe.favorite?'add':'remove'):undefined}
      onAnimationEnd={event=>{if(event.target===event.currentTarget)setMotion(null);}}>
      <Heart size={18} fill={recipe.favorite?'currentColor':'none'}/>
    </span>
    {animate&&recipe.favorite&&<span key={`burst-${motion.id}`} className="recipe-favorite-burst" aria-hidden="true">
      {Array.from({length:6},(_,i)=><i key={i} style={{'--spark-angle':`${i*60+15}deg`} as CSSProperties}/>)}
    </span>}
  </button>;
}
