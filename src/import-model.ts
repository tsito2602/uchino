import type {Recipe} from './domain';
import type {ImportDiagnostics} from './import-errors';

export type ImportPhase='reading'|'video'|'sorting'|'checking';
export type ImportSource={kind:'url'|'image'|'text'|'video';name:string;text?:string;url?:string;image?:string};
export type ImportIssue={field:string;reason:string};
export type ImportResult={recipe:Recipe;issues:ImportIssue[];source?:ImportSource;demo?:boolean;photo?:string;stepPhotos?:{index:number;photo:string}[];stepSources?:(number|null)[];warnings?:string[]};
export type ImportEvent={type:'phase';phase:ImportPhase}|{type:'result';result:ImportResult}|{type:'error';error:string;diagnostics?:ImportDiagnostics};

export function issueLabel(field:string) {
  const labels:Record<string,string>={title:'レシピ名',category:'カテゴリ',servings:'人数',minutes:'調理時間',memo:'メモ'};
  const ingredient=field.match(/^ingredients\.(\d+)\.(name|quantity|unit|group)$/);
  if(ingredient)return `${ingredient[2]==='name'?'材料':ingredient[2]==='quantity'?'分量':ingredient[2]==='group'?'グループ':'単位'}${Number(ingredient[1])+1}`;
  const step=field.match(/^steps\.(\d+)$/);
  return step?`手順${Number(step[1])+1}`:labels[field]||field;
}

export function fieldAfterRemoval(field:string,kind:'ingredients'|'steps',removed:number):string|null {
  const parts=field.split('.');if(parts[0]!==kind)return field;
  const index=Number(parts[1]);if(index===removed)return null;
  if(index>removed)parts[1]=String(index-1);
  return parts.join('.');
}

// Treat model output as untrusted metadata. Only existing, editable fields survive.
export function importIssues(recipe:Recipe,raw:unknown):ImportIssue[] {
  const allowed=new Set(['title','category','servings','minutes','memo',...recipe.ingredients.flatMap((_,i)=>['name','quantity','unit','group'].map(key=>`ingredients.${i}.${key}`)),...recipe.steps.map((_,i)=>`steps.${i}`)]);
  const issues=new Map<string,string>();
  if(Array.isArray(raw))for(const item of raw.slice(0,100)){
    if(item&&typeof item.field==='string'&&allowed.has(item.field)&&typeof item.reason==='string'&&item.reason.trim())issues.set(item.field,item.reason.trim().slice(0,400));
  }
  if(recipe.memo.includes('仮設定')&&!issues.has('servings'))issues.set('servings','元資料の人数を読み取れず、2人分を仮設定しています。');
  if(recipe.category==='その他'&&!issues.has('category'))issues.set('category','カテゴリを特定できていません。適切なカテゴリを選んでください。');
  recipe.ingredients.forEach((item,i)=>{if(!item.quantity.trim()&&!issues.has(`ingredients.${i}.quantity`))issues.set(`ingredients.${i}.quantity`,'分量を独立した値として読み取れていません。元資料と材料名を確認してください。');});
  return [...issues].map(([field,reason])=>({field,reason}));
}
