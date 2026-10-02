import {importIssues,type ImportResult} from '../src/import-model';
import {importAI,aiConfigured,type ImportOptions,type ImportBindings} from './import-ai';
export {importAI,aiConfigured,type ImportBindings} from './import-ai';
import {newRecipe,validateRecord,type Recipe} from '../src/domain';
export const recipeHosts=['cookpad.com','www.kurashiru.com','delishkitchen.tv','www.orangepage.net','park.ajinomoto.co.jp','www.kikkoman.co.jp','www.kewpie.co.jp','www.sirogohan.com','www.kyounoryouri.jp'];
function permitted(value:string){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||!recipeHosts.includes(url.hostname))throw new Error('このサイトからの直接取り込みにはまだ対応していません。レシピ本文を貼り付けるか、画像を選択してください。');return url;}
export function parseRecipeSchema(html:string,sourceUrl:string,evidence?:{text?:string}):Recipe|null {
  const scripts=[...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const walk=(value:unknown):Record<string,unknown>|null=>{if(!value||typeof value!=='object')return null;if(Array.isArray(value)){for(const item of value){const result=walk(item);if(result)return result;}return null;}const o=value as Record<string,unknown>;if(o['@type']==='Recipe'||Array.isArray(o['@type'])&&o['@type'].includes('Recipe'))return o;return walk(o['@graph']);};
  for(const script of scripts){let item:Record<string,unknown>|null;try{item=walk(JSON.parse(script[1]));}catch{continue;}if(!item||typeof item.name!=='string'||!Array.isArray(item.recipeIngredient))continue;
    const r=newRecipe();r.title=item.name;r.sourceUrl=sourceUrl;r.category='その他';
    const yieldValue=Array.isArray(item.recipeYield)?String(item.recipeYield[0]):String(item.recipeYield??'');
    const servings=yieldValue.match(/(?:^|\s)(\d+)\s*(?:人|serving|$)/i);r.servings=servings?Math.min(100,Math.max(1,Number(servings[1]))):2;
    const time=String(item.totalTime??'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);r.minutes=time?(Number(time[1]||0)*60+Number(time[2]||0))||null:null;
    r.ingredients=item.recipeIngredient.filter((v):v is string=>typeof v==='string').map(name=>({name,quantity:'',unit:''}));
    const steps=(value:unknown):string[]=>{if(typeof value==='string')return value.split(/\n+/).map(v=>v.trim()).filter(Boolean);if(Array.isArray(value))return value.flatMap(steps);if(value&&typeof value==='object'){const o=value as Record<string,unknown>;return o.itemListElement?steps(o.itemListElement):typeof o.text==='string'?[o.text]:[];}return [];};
    r.steps=steps(item.recipeInstructions);r.memo=servings?'':'人数が取得できなかったため、2人分を仮設定しています。元のレシピを確認してください。';
    const valid=validateRecord('recipe',r);if(valid){if(evidence)evidence.text=[item.name,`人数：${yieldValue||'記載なし'}`,`調理時間：${String(item.totalTime??'記載なし')}`,'材料',...item.recipeIngredient,'作り方',...r.steps].join('\n');return valid as Recipe;}
  }return null;
}
export function recipePageText(html:string):string {
  const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|head|nav|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    .replace(/<\/?(?:p|div|br|h[1-6]|li|tr|section|article)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(match,code:string)=>{
      if(!code.startsWith('#'))return entities[code.toLowerCase()]??match;
      const point=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):Number(code.slice(1));
      return point>0&&point<=0x10ffff?String.fromCodePoint(point):match;
    }).replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
export async function importUrl(value:string,options:ImportOptions={},env:ImportBindings={}):Promise<ImportResult>{
  let url=permitted(value);
  for(let redirects=0;redirects<4;redirects++){
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.any([AbortSignal.timeout(12000),...(options.signal?[options.signal]:[])]),headers:{Accept:'text/html','User-Agent':'uchino recipe importer'}});
    if(response.status>=300&&response.status<400){const location=response.headers.get('Location');if(!location)break;url=permitted(new URL(location,url).href);continue;}
    if(!response.ok)throw new Error('ページを取得できませんでした。レシピ本文か画像から取り込んでください。');
    if(!response.headers.get('content-type')?.includes('text/html'))throw new Error('レシピのページURLを入力してください。');
    const reader=response.body?.getReader();if(!reader)break;const decoder=new TextDecoder();let html='',size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw new Error('ページが大きすぎます。本文か画像から取り込んでください。');}html+=decoder.decode(value,{stream:true});}html+=decoder.decode();}finally{reader.releaseLock();}
    options.onPhase?.('sorting');
    const evidence:{text?:string}={},recipe=parseRecipeSchema(html,url.href,evidence);
    if(aiConfigured(env)){
      const text=evidence.text||recipePageText(html);
      if(!text||text.length>30000)throw new Error('ページの本文を読み取れませんでした。レシピの部分を貼り付けるか、画像を選んでください。');
      const imported=await importAI(env,{text},{...options,onPhase:phase=>{if(phase!=='sorting')options.onPhase?.(phase);}});
      return {...imported,recipe:{...imported.recipe,sourceUrl:url.href},source:{kind:'url',name:recipe?'元ページのレシピ情報':'元ページの本文',url:url.href,text}};
    }
    options.onPhase?.('checking');if(recipe)return {recipe,issues:importIssues(recipe,[]),source:{kind:'url',name:'元ページのレシピ情報',url:url.href,text:evidence.text}};
    throw new Error('レシピ情報を読み取れませんでした。本文か画像から取り込んでください。');
  }throw new Error('ページの移動先を確認できませんでした。本文か画像から取り込んでください。');
}
