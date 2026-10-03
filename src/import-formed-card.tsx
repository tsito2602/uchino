import {Check} from 'lucide-react';
import type {Recipe} from './domain';
import {RecipePhoto} from './recipe-photo-view';
import {RecipeCategoryIcon} from './recipe-category';
import {BowlFigure} from './import-bowl';

const warm:Recipe['category'][]=['主菜','汁物','主食'];
// The import's finishing moment: the full prep bowl gives one stir, then gives
// way to the recipe card that will sit in the recipe book. Warm dishes steam;
// everything else catches a glint.
export function ImportFormedCard({recipe}:{recipe:Recipe}) {
  const finish=warm.includes(recipe.category)?'steam':'glint';
  return <div className="import-formed" aria-hidden="true" data-finish={finish}>
    <div className="import-formed-bowl"><BowlFigure level={1} mixing/></div>
    <div className="import-formed-frame"><div className="import-formed-card">
      <RecipePhoto recipe={recipe} priority/>
      <div className="import-formed-copy"><span><RecipeCategoryIcon category={recipe.category} size={11}/>{recipe.category}</span><strong>{recipe.title}</strong></div>
      <span className="import-formed-check"><Check size={14} strokeWidth={2.6}/></span>
    </div>
    {finish==='steam'?<span className="import-formed-steam"><i/><i/><i/></span>:<span className="import-formed-glint"><i/><i/><i/></span>}
    </div>
  </div>;
}
