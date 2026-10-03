import {useState} from 'react';
import {ChefHat} from 'lucide-react';
import {recipePhoto,type Recipe} from './domain';
import {RecipeImage} from './recipe-image';

export function RecipePhoto({recipe,priority=false}:{recipe:Recipe;priority?:boolean}) {
  const src=recipePhoto(recipe),[failed,setFailed]=useState('');
  return <div className="recipe-photo" aria-hidden="true">{src&&failed!==src?<RecipeImage src={src} alt="" loading={priority?'eager':'lazy'} decoding="async" onError={()=>setFailed(src)}/>:<div className="recipe-photo-placeholder"><ChefHat size={38} strokeWidth={1.2}/></div>}</div>;
}
