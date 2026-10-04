import type {Ingredient} from './domain';

// Which ingredients a step uses. Recipes rarely repeat an ingredient's full
// name in the steps ("豚バラ薄切り肉" becomes "豚肉"), refer back to earlier
// steps ("1を加え") or name a group ("Aを加える"), so each is matched by the
// shorter names a cook would write as well.
const script=(char:string)=>/[぀-ゟ]/.test(char)?'h':/[゠-ヿｦ-ﾟ]/.test(char)?'k':/[一-鿿々]/.test(char)?'c':'o';
const width=(text:string)=>text.normalize('NFKC');

export function ingredientKeys(name:string){
  const base=width(name).replace(/[（(][^）)]*[）)]/g,'').replace(/\s+/g,'').trim(),keys=new Set<string>();
  if(!base)return [];
  keys.add(base);
  // A tail that starts where the script changes: 長ねぎ→ねぎ, 木綿豆腐→豆腐, 薄口しょうゆ→しょうゆ.
  for(let i=1;i<base.length-1;i++)if(script(base[i-1])!==script(base[i]))keys.add(base.slice(i));
  for(let i=1;i<base.length-1;i++)if(script(base[i])==='c'&&base.length-i>=2&&/[一-鿿]{2,}$/.test(base.slice(i)))keys.add(base.slice(i));
  // Meat is written by its animal: 豚バラ薄切り肉, 鶏もも肉, 牛こま切れ肉 → 豚肉 / 鶏肉 / 牛肉.
  if(/肉/.test(base))for(const animal of ['豚','牛','鶏'])if(base.includes(animal))keys.add(`${animal}肉`);
  if(/ひき|挽/.test(base))keys.add('ひき肉');
  // A tail like "の素" (鶏ガラスープの素) is a particle plus a word, not a name.
  return [...keys].filter(key=>key.length>=2&&(key===base||script(key[0])!=='h'||[...key].every(char=>script(char)==='h')));
}

function groupMentioned(text:string,group:string){
  const label=width(group).replace(/[【】\[\]()（）〈〉<>]/g,'').trim();
  if(!label)return false;
  if(/^[A-Za-z]$/.test(label))return new RegExp(`(?<![A-Za-z])${label}(?![A-Za-z])`).test(text);
  return text.includes(label);
}

function direct(ingredients:Ingredient[],step:string){
  const text=width(step);
  return ingredients.map(ingredient=>!!ingredient.name&&(ingredientKeys(ingredient.name).some(key=>text.includes(key))||!!ingredient.group&&groupMentioned(text,ingredient.group)));
}

// Indexes into ingredients, in recipe order.
export function stepIngredients(ingredients:Ingredient[],steps:string[],index:number){
  const used=direct(ingredients,steps[index]??'');
  // "1を加え" / "2と合わせる": an earlier step's own ingredients come along.
  const text=width(steps[index]??'');
  for(const match of text.matchAll(/(?<![0-9.])([1-9][0-9]?)(?=を|と|に|へ|も|の(?:鍋|フライパン|ボウル|器))/g)){
    const earlier=Number(match[1])-1;if(earlier<0||earlier>=index)continue;
    direct(ingredients,steps[earlier]).forEach((hit,i)=>{if(hit)used[i]=true;});
  }
  return used.flatMap((hit,i)=>hit?[i]:[]);
}
