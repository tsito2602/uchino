import {isSpoonUnit,type Ingredient} from './domain';
import {ingredientAmount} from './ingredient-amount';
import {QuantityTicker} from './quantity-ticker';

export function IngredientAmountView({ingredient,base,servings}:{ingredient:Ingredient;base:number;servings:number}){
  const amount=ingredientAmount(ingredient,base,servings);
  return <strong className="ingredient-quantity" title={amount.basis}>
    <span className="ingredient-quantity-main">{amount.approximate&&<span className="ingredient-quantity-estimate">約</span>}{amount.parts.map((part,i)=><span className="ingredient-quantity-part" key={i}>{i>0&&<span>＋</span>}{isSpoonUnit(part.unit)&&<span>{part.unit}</span>}<QuantityTicker value={part.quantity}/>{part.unit&&!isSpoonUnit(part.unit)&&<span>{part.unit}</span>}</span>)}</span>
    {amount.original&&<small className="ingredient-quantity-original">（{amount.original.replace(/\s/g,'')}）</small>}
  </strong>;
}
