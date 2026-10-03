import {ImportFormedCard} from './import-formed-card';
import {useId,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {AlertCircle,Check,ChevronDown,ExternalLink,FileText,Pencil,Sparkles} from 'lucide-react';
import {issueLabel,type ImportResult,type ImportSource} from './import-model';
import {GlassCheckbox} from './glass-checkbox';
import {RecipeEditor} from './recipe-editor';
import type {Recipe} from './domain';

export function ImportOriginal({source}:{source:ImportSource}) {
  const [open,setOpen]=useState(false),id=useId(),reduced=useReducedMotion();
  return <section className="import-original-files" aria-label="取り込み元">
    <button type="button" className="import-source-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}><FileText size={17}/><span>元の{source.kind==='image'?'画像':source.kind==='video'?'動画':'レシピ'}：{source.name}</span><ChevronDown size={16}/></button>
    <div id={id} inert={!open}><AnimatePresence initial={false}>{open&&<motion.div className="import-source-expander" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduced?0:.24,ease:[.22,1,.36,1]}}><div className="import-source import-source-content">{source.image&&<img src={source.image} alt={source.name||'取り込み元の画像'}/>} {source.text&&<pre>{source.text}</pre>}{source.url&&<a href={source.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/> {source.kind==='video'?'元の動画を開く':'元のページを開く'}</a>}</div></motion.div>}</AnimatePresence></div>
  </section>;
}

const sourceActions={url:'レシピページを読み取りました',video:'動画の概要欄・音声・映像を読み取りました',image:'画像の文字を読み取りました',text:'貼り付けた本文を読み取りました'} as const;
// Summarize the import as it arrived, so later edits in the form do not rewrite what AI did.
export function importActions(result:ImportResult,source:ImportSource):{text:string;check?:boolean}[] {
  const {recipe}=result,groups=new Set(recipe.ingredients.map(item=>item.group).filter(Boolean)).size;
  const stepPhotos=recipe.stepPhotos?.filter(Boolean).length??0;
  return [
    {text:sourceActions[source.kind]},
    {text:`材料を${recipe.ingredients.length}品に整理${groups>1?`し、${groups}つのグループに分けました`:'しました'}`},
    {text:`作り方を${recipe.steps.length}ステップにまとめました${stepPhotos?`（手順の写真${stepPhotos}枚つき）`:''}`},
    {text:`${recipe.category}・${recipe.servings}人分${recipe.minutes?`・${recipe.minutes}分`:''}と判断しました`},
    ...(recipe.photo?[{text:'料理の写真を設定しました'}]:[]),
    result.issues.length?{text:`自信がない${result.issues.length}か所は「要確認」にしました`,check:true}:{text:'迷った箇所はありませんでした'}
  ];
}
export function ImportActions({result,source}:{result:ImportResult;source:ImportSource}) {
  const [actions]=useState(()=>importActions(result,source));
  return <section className="import-ai-actions" aria-labelledby="import-ai-actions-title"><h3 id="import-ai-actions-title"><Sparkles size={16}/>AIがしたこと</h3><ul>{actions.map(action=><li key={action.text} data-check={action.check||undefined}>{action.check?<AlertCircle size={15}/>:<Check size={15}/>}<span>{action.text}</span></li>)}</ul></section>;
}

export function ImportReview({result,source,onChange,onSubmit,error,acknowledged,onAcknowledge,onRemoveItem,onPhotoBusyChange}:{result:ImportResult;source:ImportSource;onChange:(recipe:Recipe)=>void;onSubmit:()=>void;error:string;onPhotoBusyChange:(busy:boolean)=>void;acknowledged:string[];onAcknowledge:(fields:string[])=>void;onRemoveItem:(kind:'ingredients'|'steps',index:number)=>void}) {
  const remaining=result.issues.filter(issue=>!acknowledged.includes(issue.field));
  function edit(field:string){const input=document.querySelector<HTMLElement>(`[data-import-field="${CSS.escape(field)}"]`);input?.focus({preventScroll:true});}
  return <div className="recipe-import-review">
    <div className="import-review-heading"><ImportFormedCard recipe={result.recipe}/><h3>一枚のレシピにまとめました</h3><p>元のレシピと照らし合わせて、内容を確認・修正してください。</p>{result.demo&&<span className="import-demo-badge">デモ · staging限定</span>}</div>
    <ImportActions result={result} source={source}/>
    <ImportOriginal source={source}/>
    {result.warnings?.map((warning,i)=><p className="form-error" role="status" key={i}>{warning}</p>)}
    {result.sourceDiagnostics&&<details className="import-error-details"><summary>概要欄の取得状況</summary><pre>{JSON.stringify(result.sourceDiagnostics,null,2)}</pre></details>}
    {!!result.stepPhotoDiagnostics?.failures.length&&<details className="import-error-details"><summary>手順画像の取得状況</summary><pre>{JSON.stringify(result.stepPhotoDiagnostics,null,2)}</pre></details>}
    {!!result.issues.length&&<section className="import-issues" aria-labelledby="import-issues-title"><h3 id="import-issues-title"><AlertCircle size={18}/>要確認 <span>{remaining.length}件</span></h3><p>仮設定や曖昧な箇所です。内容を確かめたらチェックしてください。</p>{result.issues.map(issue=><div className="import-issue" key={issue.field} data-checked={acknowledged.includes(issue.field)}><div><button type="button" onClick={()=>edit(issue.field)}><Pencil size={14}/>{issueLabel(issue.field)}を編集</button><p>{issue.reason}</p></div><label><GlassCheckbox aria-label={`${issueLabel(issue.field)}を確認した`} checked={acknowledged.includes(issue.field)} onChange={event=>onAcknowledge(event.target.checked?[...acknowledged,issue.field]:acknowledged.filter(field=>field!==issue.field))}/><span>確認した</span></label></div>)}</section>}
    <div className="import-review-list-heading"><strong>保存するレシピ</strong><span className="import-edit-hint"><Pencil size={13}/>すべての項目を編集できます</span></div>
    <RecipeEditor onPhotoBusyChange={onPhotoBusyChange} onRemoveItem={onRemoveItem} value={result.recipe} onChange={onChange} onSubmit={onSubmit} error={error}/>
    <p className="import-review-demo">{result.demo?'デモの結果です。「サンプルとして保存」を押すとレシピに追加されます。':'「確認して保存」を押すまでレシピには追加されません。'}</p>
  </div>;
}
