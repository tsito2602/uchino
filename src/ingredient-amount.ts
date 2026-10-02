import {isSpoonUnit,quantityNumber,scaleQuantity,type Ingredient} from './domain';

type Portion={grams:number;unit:string};
type Produce={names:string[];portions:Portion[]};
const produce=(names:string[],grams:number,unit:string,alternative?:Portion):Produce=>({names,portions:[{grams,unit},...(alternative?[alternative]:[])]});
// Typical whole-produce weights, including waste; these are estimates, not measured edible weights.
// Sources checked 2026-10-03:
// https://park.ajinomoto.co.jp/contents/basic/ingredients_bunryou/
// Potato: https://www.ichibiki.co.jp/recipe/cooking-basics/ (150 g per potato).
const produceWeights:Produce[]=[
  produce(['アスパラ','アスパラガス','グリーンアスパラガス'],20,'本'),
  produce(['かぶ','カブ','蕪'],80,'個'),
  produce(['かぼちゃ','カボチャ','南瓜'],1200,'個'),
  produce(['カリフラワー'],500,'個'),
  produce(['キャベツ'],1200,'個',{grams:50,unit:'枚'}),
  produce(['きゅうり','キュウリ','胡瓜'],100,'本'),
  produce(['ゴーヤ','ゴーヤー','にがうり'],250,'本'),
  produce(['ごぼう','ゴボウ','牛蒡'],150,'本'),
  produce(['小松菜','こまつな'],300,'束'),
  produce(['さやいんげん','いんげん','インゲン'],7,'本'),
  produce(['春菊','しゅんぎく'],200,'束'),
  produce(['しょうが','ショウガ','生姜'],12,'かけ'),
  produce(['ズッキーニ'],200,'本'),
  produce(['セロリ'],100,'本'),
  produce(['大根','だいこん','ダイコン'],1000,'本',{grams:25,unit:'cm'}),
  produce(['玉ねぎ','玉葱','たまねぎ','タマネギ','新玉ねぎ','新たまねぎ'],200,'個'),
  produce(['とうもろこし','トウモロコシ'],350,'本'),
  produce(['トマト'],200,'個'),
  produce(['なす','ナス','茄子'],80,'個'),
  produce(['にら','ニラ'],100,'束'),
  produce(['にんじん','ニンジン','人参'],150,'本',{grams:10,unit:'cm'}),
  produce(['にんにく','ニンニク','大蒜'],8,'かけ'),
  produce(['ねぎ','ネギ','葱','長ねぎ','長ネギ','長葱','白ねぎ'],100,'本'),
  produce(['白菜','はくさい','ハクサイ'],2000,'株',{grams:100,unit:'枚'}),
  produce(['パプリカ','赤パプリカ','黄パプリカ'],150,'個'),
  produce(['ピーマン'],35,'個'),
  produce(['ブロッコリー'],200,'個',{grams:15,unit:'房'}),
  produce(['ほうれん草','ほうれんそう','ホウレンソウ'],200,'束'),
  produce(['水菜','みずな'],200,'束'),
  produce(['レタス'],400,'個',{grams:30,unit:'枚'}),
  produce(['れんこん','レンコン','蓮根'],180,'節'),
  produce(['さつまいも','サツマイモ'],250,'本'),
  produce(['里いも','里芋','さといも','サトイモ'],50,'個'),
  produce(['じゃがいも','ジャガイモ','じゃが芋'],150,'個'),
  produce(['長いも','長芋','ながいも','ナガイモ'],500,'本'),
  produce(['エリンギ'],40,'本'),
  produce(['しいたけ','シイタケ','椎茸','生しいたけ'],15,'個'),
  produce(['マッシュルーム'],10,'個'),
];
const names=new Map(produceWeights.flatMap(item=>item.names.map(name=>[name,item.portions] as const)));
// Strip only preparation notes that do not change raw weight. Never match by substring:
// dried/cooked vegetables, mini varieties, pastes and sauces need different conversions.
const prep='薄切り|みじん切り|粗みじん切り|千切り|せん切り|ざく切り|乱切り|細切り|いちょう切り|半月切り|輪切り|小口切り|皮なし|皮付き|皮つき|皮をむいたもの|正味|可食部|中|中サイズ|中玉';
function produceName(name:string){
  return name.normalize('NFKC').replace(/\s/g,'').replace(new RegExp(`\\((?:${prep})\\)`,'g'),'').replace(new RegExp(`(?:の)?(?:${prep})$`),'');
}

export type AmountPart={quantity:string;unit:string};
export type IngredientAmount={parts:AmountPart[];approximate:boolean;original?:AmountPart;basis?:string};
const formatPart=(part:AmountPart)=>isSpoonUnit(part.unit)?`${part.unit.trim()}${part.quantity}`:[part.quantity,part.unit].filter(Boolean).join(' ');
function fraction(value:number,denominators:number[],tolerance:number):string|null {
  for(const denominator of denominators){
    const numerator=Math.round(value*denominator),candidate=numerator/denominator;
    if(numerator>0&&Math.abs(candidate-value)<=Math.max(1e-8,value*tolerance))return scaleQuantity(`${numerator}/${denominator}`,1,1);
  }
  return null;
}

// Exact Japanese measuring spoon volumes: tablespoon 15 ml, teaspoon 5 ml.
// https://www.mizkan.co.jp/ouchirecipe/basic/measure/
function spoons(ml:number):AmountPart[]|null {
  // A cup is more practical for large volumes. Never round a seasoning amount.
  if(ml<=0||ml>90)return null;
  const tablespoon=ml>=15?fraction(ml/15,[1,2],0):null;
  if(tablespoon)return [{quantity:tablespoon,unit:'大さじ'}];
  const whole=Math.floor(ml/15),teaspoon=fraction((ml-whole*15)/5,[1,2,4,8],0);
  if(!teaspoon)return null;
  return [...(whole?[{quantity:String(whole),unit:'大さじ'}]:[]),{quantity:teaspoon,unit:'小さじ'}];
}

export function ingredientAmount(ingredient:Ingredient,base:number,servings:number):IngredientAmount {
  const quantity=scaleQuantity(ingredient.quantity,base,servings);
  const fallback:IngredientAmount={parts:[{quantity,unit:ingredient.unit}],approximate:false};
  const sourceValue=quantityNumber(ingredient.quantity),value=sourceValue===null?null:sourceValue*servings/base,unit=ingredient.unit.normalize('NFKC').trim().toLowerCase();
  if(value===null||!Number.isFinite(value)||value<=0||!Number.isFinite(base)||base<=0||!Number.isFinite(servings)||servings<=0)return fallback;
  // Fractions suit pieces and spoons; reference weights/volumes are easier to read as decimals.
  if(['ml','cc','ミリリットル','g','グラム','kg','キログラム'].includes(unit))fallback.parts[0].quantity=String(Number(value.toFixed(3))||value);
  const original=fallback.parts[0];
  if(['ml','cc','ミリリットル'].includes(unit)){
    const parts=spoons(value);return parts?{parts,approximate:false,original}:fallback;
  }
  const grams=['g','グラム'].includes(unit)?value:['kg','キログラム'].includes(unit)?value*1000:null;
  if(grams===null)return fallback;
  for(const portion of names.get(produceName(ingredient.name))||[]){
    // Prefer easy fractions within 8% of the typical weight. Fall back to g when no useful estimate exists.
    const count=fraction(grams/portion.grams,[1,2,3,4,6,8],.08);
    if(count)return {parts:[{quantity:count,unit:portion.unit}],approximate:true,original,basis:`一般的な大きさの1${portion.unit}を約${portion.grams}gとして換算した目安です。`};
  }
  return fallback;
}

export function formatIngredientAmount(ingredient:Ingredient,base:number,servings:number):string {
  const amount=ingredientAmount(ingredient,base,servings);
  return `${amount.approximate?'約':''}${amount.parts.map(formatPart).join('＋')}${amount.original?`（${formatPart(amount.original)}）`:''}`;
}
