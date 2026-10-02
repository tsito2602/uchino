import {isSpoonUnit,type Ingredient} from './domain';
import {ingredientAmount} from './ingredient-amount';
import {QuantityLabel,QuantityTicker} from './quantity-ticker';

export function IngredientAmountView({ingredient,base,servings}:{ingredient:Ingredient;base:number;servings:number}){
  const amount=ingredientAmount(ingredient,base,servings);
  return <strong className="ingredient-quantity" title={amount.basis}>
    <span className="ingredient-quantity-main">
      <QuantityLabel className="ingredient-quantity-estimate" value={amount.approximate?'約\u2009':''}/>
      {[0,1].map(i=>{
        const part=amount.parts[i],spoon=part&&isSpoonUnit(part.unit);
        return <span className="ingredient-quantity-part" key={i}>
          <QuantityLabel value={i>0&&part?'\u2009＋\u2009':''}/>
          <QuantityLabel value={spoon?`${part.unit}\u2009`:''}/>
          <QuantityTicker value={part?.quantity||''}/>
          <QuantityLabel value={part?.unit&&!spoon?`\u2009${part.unit}`:''}/>
        </span>;
      })}
    </span>
    <small className="ingredient-quantity-original">
      <QuantityLabel value={amount.original?'\u2009（':''}/>
      <QuantityTicker value={amount.original?.quantity||''}/>
      <QuantityLabel value={amount.original?.unit.replace(/\s/g,'')||''}/>
      <QuantityLabel value={amount.original?'）':''}/>
    </small>
  </strong>;
}
