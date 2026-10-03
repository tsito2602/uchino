import type {Recipe} from './domain';
import type {ImportDiagnostics} from './import-errors';

export type ImportPhase='reading'|'video'|'sorting'|'checking'|'photos';
export type ImportSource={kind:'url'|'image'|'text'|'video';name:string;text?:string;url?:string;image?:string};
export type ImportIssue={field:string;reason:string};
export type SourceDiagnostics={code:'redirect'|'http_error'|'not_html'|'empty_response'|'script_too_large'|'metadata_missing'|'page_too_large'|'timeout'|'network_error';httpStatus?:number;bytes:number;playerDataFound:boolean;pageDataFound:boolean};
export type ImportPhotoSheet={photo:string;width:number;height:number;frames:{index:number;x:number;y:number;width:number;height:number}[]};
export type StepPhotoFailure={step:number;code:'storyboard_missing'|'time_unknown'|'time_out_of_step'|'frame_unavailable'|'http_error'|'not_image'|'too_large'|'invalid_image'|'network_error'|'timeout'|'redirect_error'|'download_limit'|'budget_exceeded'|'prepare_failed';httpStatus?:number};
export type StepPhotoDiagnostics={total:number;attached:number;failures:StepPhotoFailure[]};
export function stepPhotoWarning(diagnostics:StepPhotoDiagnostics):string|undefined {
  if(diagnostics.attached>=diagnostics.total)return;
  return diagnostics.attached===0?`手順画像を取得できませんでした（0 / ${diagnostics.total}件）。手順の動画リンクから確認できます。`:`手順画像は ${diagnostics.attached} / ${diagnostics.total}件を取得しました。画像のない手順は動画リンクから確認できます。`;
}
export type ImportResult={stepPhotoDiagnostics?:StepPhotoDiagnostics;sourceDiagnostics?:SourceDiagnostics;recipe:Recipe;issues:ImportIssue[];source?:ImportSource;demo?:boolean;photo?:string;stepPhotos?:{index:number;photo:string}[];stepPhotoSheets?:ImportPhotoSheet[];stepSources?:(number|null)[];warnings?:string[]};
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
    if(item&&typeof item.field==='string'&&allowed.has(item.field)&&typeof item.reason==='string'&&item.reason.trim()){
      const reason=item.reason.trim().slice(0,400).replace(/\b(?:null|undefined)\b/gi,'未設定');
      issues.set(item.field,reason);
    }
  }
  if(recipe.memo.includes('仮設定')&&!issues.has('servings'))issues.set('servings','元資料の人数を読み取れず、2人分を仮設定しています。');
  if(recipe.category==='その他'&&!issues.has('category'))issues.set('category','カテゴリを特定できていません。適切なカテゴリを選んでください。');
  recipe.ingredients.forEach((item,i)=>{if(!item.quantity.trim()&&!issues.has(`ingredients.${i}.quantity`))issues.set(`ingredients.${i}.quantity`,'分量を独立した値として読み取れていません。元資料と材料名を確認してください。');});
  return [...issues].map(([field,reason])=>({field,reason}));
}
