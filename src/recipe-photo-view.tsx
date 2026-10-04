import {useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {recipePhoto,type Recipe} from './domain';
import {RecipeImage} from './recipe-image';
import {photoTone,rememberTone} from './photo-tone';

// Recipes without a photo get a cover of their own: a washi-dyed field per
// category and the dish's first character, placed by a hash of its title.
const dyes:Record<Recipe['category'],[string,string]>={
  '主菜':['#b8643c','#8f4426'],'副菜':['#6f8f5e','#4f6b41'],'汁物':['#5f7a8f','#435a6c'],
  '主食':['#b08a4a','#86662e'],'おやつ':['#c07a86','#985562'],'その他':['#857a6e','#615850'],
};
function hash(text:string){let value=2166136261;for(const char of text)value=Math.imul(value^char.codePointAt(0)!,16777619);return value>>>0;}
export function RecipeCover({recipe}:{recipe:Pick<Recipe,'title'|'category'>}) {
  const [light,deep]=dyes[recipe.category]||dyes['その他'],seed=hash(recipe.title);
  const glyph=[...recipe.title.trim()][0]||'う';
  const style={'--cover-light':light,'--cover-deep':deep,'--cover-x':`${18+seed%46}%`,'--cover-y':`${8+(seed>>>8)%30}%`,'--cover-turn':`${(seed>>>16)%11-5}deg`} as CSSProperties;
  return <div className="recipe-cover" style={style}><span className="recipe-cover-glyph">{glyph}</span></div>;
}
export function RecipePhoto({recipe,priority=false}:{recipe:Recipe;priority?:boolean}) {
  const src=recipePhoto(recipe),[failed,setFailed]=useState(''),[loaded,setLoaded]=useState(''),mounted=useRef(0);
  useLayoutEffect(()=>{mounted.current=performance.now();},[src]);
  const photo=src&&failed!==src;
  // A picture that arrives within a frame (already cached) just appears; a slow
  // one resolves from its remembered tone through a soft blur.
  return <div className="recipe-photo" aria-hidden="true" style={photo?{'--photo-tone':photoTone(src)} as CSSProperties:undefined}>{photo?<RecipeImage src={src} alt="" loading={priority?'eager':'lazy'} decoding="async" data-loaded={loaded===src?(performance.now()-mounted.current<80?'instant':'true'):undefined} onLoad={event=>{rememberTone(src,event.currentTarget);setLoaded(src);}} onError={()=>setFailed(src)}/>:<RecipeCover recipe={recipe}/>}</div>;
}
