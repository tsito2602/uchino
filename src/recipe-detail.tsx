import type {Dispatch,SetStateAction} from 'react';
import {Clock,ExternalLink} from 'lucide-react';
import type {Recipe} from './domain';
import {RecipePhoto} from './recipe-photo-view';
import {RecipeCategoryIcon} from './recipe-category';
import {IngredientList} from './ingredient-list';

export function RecipeDetail({recipe,servings,checked,onChange,disabled,error}:{recipe:Recipe;servings:number;checked:string[];onChange:Dispatch<SetStateAction<string[]>>;disabled?:boolean;error?:string}){
  return <div className="recipe-detail"><div className="recipe-hero"><RecipePhoto recipe={recipe} priority/><div className="recipe-hero-copy"><span className="recipe-category"><RecipeCategoryIcon category={recipe.category} size={16}/>{recipe.category}</span>{recipe.minutes&&<div className="recipe-meta"><span><Clock size={15}/>{recipe.minutes}分</span></div>}</div></div><section><div className="section-head"><h3>材料</h3></div><IngredientList recipe={recipe} servings={servings} checked={checked} onChange={onChange} disabled={disabled}/><p className="subtle ingredient-selection-hint">長押ししてなぞると選択・解除できます。選んだ材料は買い物メモへ追加できます。</p></section><section><h3>作り方</h3><ol className="recipe-steps">{recipe.steps.map((step,i)=><li key={i}><span>{i+1}</span><p>{step}</p></li>)}</ol></section>{recipe.memo&&<section><h3>メモ</h3><p className="recipe-memo">{recipe.memo}</p></section>}{recipe.sourceUrl&&<a className="source-link" href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>元のレシピを見る</a>}{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}
