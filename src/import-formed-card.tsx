import type {CSSProperties} from 'react';
import {Check} from 'lucide-react';
import type {Recipe} from './domain';
import {RecipePhoto} from './recipe-photo-view';
import {RecipeCategoryIcon} from './recipe-category';

// The import's finishing moment: the pieces the AI read drift in and settle
// into one recipe card, the same card that will sit in the recipe book.
export function ImportFormedCard({recipe}:{recipe:Recipe}) {
  const pieces=[...recipe.ingredients.map(item=>item.name),...recipe.steps.map((_,i)=>`手順${i+1}`)].filter(Boolean).slice(0,7);
  return <div className="import-formed" aria-hidden="true">
    {pieces.map((piece,i)=>{const angle=i/pieces.length*Math.PI*2-Math.PI/2;return <span key={i} className="import-formed-piece" style={{'--piece-x':`${Math.round(Math.cos(angle)*138)}px`,'--piece-y':`${Math.round(Math.sin(angle)*112)}px`,'--piece-delay':`${i*55}ms`} as CSSProperties}>{piece}</span>;})}
    <div className="import-formed-frame"><div className="import-formed-card">
      <RecipePhoto recipe={recipe} priority/>
      <div className="import-formed-copy"><span><RecipeCategoryIcon category={recipe.category} size={11}/>{recipe.category}</span><strong>{recipe.title}</strong></div>
      <span className="import-formed-check"><Check size={14} strokeWidth={2.6}/></span>
    </div></div>
  </div>;
}
