import {useRef,useState} from 'react';
import {haptic} from './haptics';
import {Heart} from 'lucide-react';
import type {Recipe} from './domain';

// Favouriting fills the heart from below like a rising liquid, with one ring
// spreading out; un-favouriting drains it.
export function RecipeFavorite({recipe,onToggle}:{recipe:Recipe;onToggle:()=>void}){
  const sequence=useRef(0);
  const [motion,setMotion]=useState<{id:number;favorite:boolean}|null>(null);
  const animate=motion&&motion.favorite===recipe.favorite?(recipe.favorite?'add':'remove'):undefined;
  return <button type="button" className="recipe-favorite" aria-pressed={recipe.favorite}
    aria-label={`${recipe.title}を${recipe.favorite?'お気に入りから外す':'お気に入りに追加'}`}
    onClick={()=>{haptic();setMotion({id:++sequence.current,favorite:!recipe.favorite});onToggle();}}>
    <span key={motion?.id??0} className="recipe-favorite-heart" data-motion={animate}
      onAnimationEnd={event=>{if(event.target===event.currentTarget)setMotion(null);}}>
      <Heart size={18}/>
      {(recipe.favorite||animate==='remove')&&<span className="recipe-favorite-liquid" aria-hidden="true"><Heart size={18} fill="currentColor"/></span>}
      {animate==='add'&&<span className="recipe-favorite-ring" aria-hidden="true"/>}
    </span>
  </button>;
}
