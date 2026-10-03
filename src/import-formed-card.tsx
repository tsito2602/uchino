import {Check} from 'lucide-react';
import type {Recipe} from './domain';
import {RecipePhoto} from './recipe-photo-view';
import {RecipeCategoryIcon} from './recipe-category';

const warm:Recipe['category'][]=['主菜','汁物','主食'];
// The import's finishing moment: the recipe card that will sit in the recipe
// book settles into place. Warm dishes steam; everything else catches a glint.
export function ImportFormedCard({recipe}:{recipe:Recipe}) {
  const finish=warm.includes(recipe.category)?'steam':'glint';
  return <div className="import-formed" aria-hidden="true" data-finish={finish}>
    <div className="import-formed-frame"><div className="import-formed-card">
      <RecipePhoto recipe={recipe} priority/>
      <span className="import-formed-category"><RecipeCategoryIcon category={recipe.category} size={11}/>{recipe.category}</span>
      <div className="import-formed-copy"><strong>{recipe.title}</strong></div>
      <span className="import-formed-check"><Check size={14} strokeWidth={2.6}/></span>
    </div>
    {finish==='steam'?<span className="import-formed-steam"><svg viewBox="0 0 24 48"><path d="M12 46C5 39 19 31 12 23S5 9 12 2"/></svg><svg viewBox="0 0 24 48"><path d="M12 46C5 39 19 31 12 23S5 9 12 2"/></svg><svg viewBox="0 0 24 48"><path d="M12 46C5 39 19 31 12 23S5 9 12 2"/></svg></span>:<span className="import-formed-glint"><i/><i/><i/></span>}
    </div>
  </div>;
}
