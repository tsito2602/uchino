import type {Ingredient} from './domain';

// Only import-time cleanup: never rewrite the user's saved ingredient names.
export function normalizeImportedIngredient(ingredient:Ingredient):Ingredient {
  let name=ingredient.name.trim(),group=ingredient.group?.trim()||'';
  const prefix=name.match(/^(?:[（(【［\[]([A-ZＡ-Ｚ])[）)】］\]]\s*|([A-ZＡ-Ｚ])(?:\s+|[：:・]\s*))/);
  if(prefix){
    const label=(prefix[1]||prefix[2]).normalize('NFKC');
    if(!group||group.normalize('NFKC')===label){group=group||label;name=name.slice(prefix[0].length).trim();}
  }
  // Narrow known product matches. Do not turn seasoned sauces or diluted soy
  // sauces into plain soy sauce, or remove meaningful type/concentration labels.
  const compact=name.replace(/[\s　]/g,'');
  if(/^(?:キッコーマン)?(?:いつでも新鮮)?(?:しぼりたて)?生(?:しょうゆ|醤油)$/.test(compact)||/^(?:キッコーマン)?しょうゆ$/.test(compact))name='醤油';
  else if(/^(?:マンジョウ)?(?:米麹こだわり仕込み)?本みりん$/.test(compact))name='みりん';
  else if(/^(?:マンジョウ)?(?:国産米こだわり仕込み)?(?:料理の清酒|料理酒)$/.test(compact))name='酒';
  return {...ingredient,name,...(group?{group}:{})};
}
