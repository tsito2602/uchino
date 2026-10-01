export const categories = ['すべて','主菜','副菜','汁物','主食','おやつ','その他'] as const;
export type Category = Exclude<typeof categories[number], 'すべて'>;
export type Ingredient = {name:string;quantity:string;unit:string};
export type Recipe = {id:string;title:string;category:Category;servings:number;minutes:number|null;ingredients:Ingredient[];steps:string[];memo:string;sourceUrl:string;favorite:boolean;createdAt:string;photo?:string};
export const MAX_PHOTO_BYTES=256_000;
export const MAX_PHOTO_URL_LENGTH=23+4*Math.ceil(MAX_PHOTO_BYTES/3);
export const demoPhotos={ginger:'/recipe-photos/ginger.webp',salad:'/recipe-photos/salad.webp',soup:'/recipe-photos/soup.webp',chicken:'/recipe-photos/chicken.webp'};
export function validRecipePhoto(value:unknown):value is string {
  if(typeof value!=='string'||value.length>MAX_PHOTO_URL_LENGTH)return false;
  if(value===''||Object.values(demoPhotos).includes(value))return true;
  if(!value.startsWith('data:image/jpeg;base64,'))return false;
  const encoded=value.slice(23);
  if(!encoded||encoded.length%4!==0||/[^A-Za-z0-9+/=]/.test(encoded)||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return false;
  try{const bytes=atob(encoded);return bytes.length<=MAX_PHOTO_BYTES&&bytes.length>4&&bytes.charCodeAt(0)===255&&bytes.charCodeAt(1)===216&&bytes.charCodeAt(2)===255&&bytes.charCodeAt(bytes.length-2)===255&&bytes.charCodeAt(bytes.length-1)===217;}catch{return false;}
}
// Old samples gain their photo without overwriting edits or an explicit removal ('').
export function recipePhoto(recipe:Recipe):string {
  if(recipe.photo!==undefined)return validRecipePhoto(recipe.photo)?recipe.photo:'';
  if(recipe.id==='sample-ginger'&&recipe.title==='豚のしょうが焼き')return demoPhotos.ginger;
  if(recipe.id==='sample-salad'&&recipe.title==='きゅうりとわかめの酢の物')return demoPhotos.salad;
  if(recipe.id==='sample-soup'&&recipe.title==='豆腐とねぎのみそ汁')return demoPhotos.soup;
  if(recipe.title==='鶏肉ときのこのクリーム煮'&&recipe.memo.startsWith('デモ用レシピ。'))return demoPhotos.chicken;
  return '';
}
export type ShoppingItem = {id:string;name:string;quantity:string;done:boolean;createdAt:string};
export type Kind = 'recipe'|'shopping';
export type RecordData = Recipe|ShoppingItem;
export function newRecipe():Recipe { return {id:crypto.randomUUID(),title:'',category:'主菜',servings:2,minutes:null,ingredients:[{name:'',quantity:'',unit:''}],steps:[''],memo:'',sourceUrl:'',favorite:false,createdAt:new Date().toISOString(),photo:''}; }
export function quantityNumber(value:string):number|null {
  const normalized=value.trim().replace(/[０-９．／]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0));
  const fraction=normalized.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if(fraction){const denominator=Number(fraction[3]);return denominator?Number(fraction[1]||0)+Number(fraction[2])/denominator:null;}
  return /^\d+(?:\.\d+)?$/.test(normalized)?Number(normalized):null;
}
export function scaleQuantity(value:string,base:number,servings:number):string {
  const number=quantityNumber(value);
  if(number===null||!Number.isFinite(base)||base<=0||!Number.isFinite(servings)||servings<=0)return value;
  const result=number*servings/base;
  for(const denominator of [2,3,4,8]){
    const numerator=Math.round(result*denominator);
    if(Math.abs(result-numerator/denominator)<0.00001&&numerator%denominator){
      const whole=Math.floor(numerator/denominator);return `${whole?`${whole} `:''}${numerator%denominator}/${denominator}`;
    }
  }
  return String(Number(result.toFixed(2)));
}
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max?v.trim():null;
export function validateRecord(kind:Kind,value:unknown):RecordData|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  const id=text(v.id,80),createdAt=text(v.createdAt,40);
  if(!id||!/^[a-zA-Z0-9_-]+$/.test(id)||!createdAt||!Number.isFinite(Date.parse(createdAt)))return null;
  if(kind==='shopping'){
    const name=text(v.name,200),quantity=text(v.quantity,100);
    return name&&quantity!==null&&typeof v.done==='boolean'?{id,name,quantity,done:v.done,createdAt}:null;
  }
  const title=text(v.title,200),memo=text(v.memo,10000),sourceUrl=text(v.sourceUrl,2048);
  if(v.photo!==undefined&&!validRecipePhoto(v.photo))return null;
  if(!title||memo===null||sourceUrl===null||!categories.slice(1).includes(v.category as Category)||!Number.isInteger(v.servings)||Number(v.servings)<1||Number(v.servings)>100||typeof v.favorite!=='boolean')return null;
  if(v.minutes!==null&&(!Number.isInteger(v.minutes)||Number(v.minutes)<1||Number(v.minutes)>10080))return null;
  if(sourceUrl){try{const u=new URL(sourceUrl);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;}catch{return null;}}
  if(!Array.isArray(v.ingredients)||v.ingredients.length>100||!v.ingredients.length||!Array.isArray(v.steps)||!v.steps.length||v.steps.length>100)return null;
  const ingredients:Ingredient[]=[];
  for(const i of v.ingredients){if(!i||typeof i!=='object')return null;const name=text(i.name,200),quantity=text(i.quantity,100),unit=text(i.unit,50);if(!name||quantity===null||unit===null)return null;ingredients.push({name,quantity,unit});}
  const steps=v.steps.map(s=>text(s,5000));if(steps.some(s=>!s))return null;
  const record={id,title,category:v.category as Category,servings:Number(v.servings),minutes:v.minutes as number|null,ingredients,steps:steps as string[],memo,sourceUrl,favorite:v.favorite,createdAt,...(v.photo===undefined?{}:{photo:v.photo as string})};
  return new TextEncoder().encode(JSON.stringify(record)).length<=1_800_000?record:null;
}
