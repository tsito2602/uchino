import {useEffect,useRef,useState,type ChangeEvent} from 'react';
import {BookOpen,Check,FileText,ImagePlus,Pencil,Sparkles} from 'lucide-react';
import {Panel} from './panel';
import type {DockContext} from './dock';
import {validateRecord,removeRecipeStep,type Recipe} from './domain';
import {fieldAfterRemoval,type ImportResult,type ImportSource} from './import-model';
import {readImport,importPause} from './import-client';
import {ImportFailure,type ImportDiagnostics} from './import-errors';
import {prepareImportPhotos} from './prepare-import-photos';
import {ImportReview} from './import-review';
import {ClipboardLink} from './clipboard-link';
import {ImportPhaseStatus,ImportProcessing,type ImportProgress} from './import-progress';

type Mode='url'|'image'|'text';
type Props={active:boolean;mode:Mode;ai:boolean;allowDemo:boolean;local:boolean;closing:boolean;onClose:()=>void;onExited:()=>void;onManual:()=>void;onSave:(recipe:Recipe)=>Promise<void>};
export function useRecipeImport(props:Props) {
  const [mode,setMode]=useState<Mode>(props.mode),[demo,setDemo]=useState(false),[value,setValue]=useState(''),[image,setImage]=useState(''),[imageName,setImageName]=useState('');
  const [error,setError]=useState(''),[progress,setProgress]=useState<ImportProgress|null>(null),[result,setResult]=useState<ImportResult|null>(null),[source,setSource]=useState<ImportSource|null>(null),[acknowledged,setAcknowledged]=useState<string[]>([]),[saving,setSaving]=useState(false),[photoBusy,setPhotoBusy]=useState(false);
  const [diagnostics,setDiagnostics]=useState<ImportDiagnostics|null>(null);
  useEffect(()=>{if(!error)setDiagnostics(null);},[error]);
  const request=useRef<AbortController|null>(null),fileRead=useRef<FileReader|null>(null);
  useEffect(()=>{
    request.current?.abort();request.current=null;fileRead.current?.abort();
    setMode(props.mode);setDemo(false);setValue('');setImage('');setImageName('');setError('');setProgress(null);setResult(null);setSource(null);setAcknowledged([]);
    return()=>{request.current?.abort();fileRead.current?.abort();};
  },[props.active,props.mode]);
  function back(){if(saving||photoBusy)return;if(request.current){request.current.abort();request.current=null;setProgress(null);setError('');return;}props.onClose();}
  async function selectImage(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];if(!file)return;fileRead.current?.abort();setError('');
    if(file.size>6_000_000||!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('6MB以内のPNG・JPEG・WebPを選んでください。');event.target.value='';return;}
    const reader=new FileReader();fileRead.current=reader;
    reader.onload=()=>{if(fileRead.current!==reader)return;setImage(String(reader.result));setImageName(file.name);};reader.onerror=()=>setError('画像を読み込めませんでした。');reader.readAsDataURL(file);
  }
  async function start(){
    if(request.current||saving)return;
    if(demo&&!props.allowDemo)return;
    if(!demo&&props.local){setError('取り込みにはGoogleログインが必要です。');return;}
    const controller=new AbortController();request.current=controller;const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(mode==='url'?360000:120000)]);
    const original:ImportSource={kind:mode,name:mode==='image'?imageName:mode==='url'?'レシピのURL':'貼り付けた本文',...(mode==='image'?{image}:mode==='url'?{url:value}:{text:value})};
    (document.activeElement as HTMLElement|null)?.blur();setError('');setDiagnostics(null);setResult(null);setAcknowledged([]);
    setProgress({phase:'reading',started:Date.now(),demo,ingredients:[],total:null});
    try{
      const imported=await readImport(mode==='url'?{url:value}:mode==='image'?{image}:{text:value},demo,signal,phase=>{if(request.current===controller)setProgress(current=>current?{...current,phase}:current);});
      await prepareImportPhotos(imported,signal);
      if(demo){
        const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if(!reduced)await importPause(2000,signal);
        setProgress(current=>current?{...current,phase:'sorting',total:imported.recipe.ingredients.length}:current);
        for(let count=1;count<=imported.recipe.ingredients.length;count++){
          if(!reduced)await importPause(6000/imported.recipe.ingredients.length,signal);
          setProgress(current=>current?{...current,ingredients:imported.recipe.ingredients.slice(0,count)}:current);
        }
        setProgress(current=>current?{...current,phase:'checking'}:current);
        if(!reduced)await importPause(2000,signal);
      }
      signal.throwIfAborted();if(request.current!==controller)return;
      setSource(imported.source||original);setResult(imported);setProgress(null);
    }catch(cause){if(request.current===controller){setProgress(null);if(!controller.signal.aborted){setError(signal.aborted?'時間がかかっています。もう一度お試しください。':cause instanceof Error?cause.message:'読み取れませんでした。もう一度お試しください。');setDiagnostics(cause instanceof ImportFailure?cause.diagnostics??null:null);}}}
    finally{if(request.current===controller)request.current=null;}
  }
  function removeItem(kind:'ingredients'|'steps',index:number){
    if(!result||result.recipe[kind].length<=1)return;
    const recipe=kind==='ingredients'?{...result.recipe,ingredients:result.recipe.ingredients.filter((_,i)=>i!==index)}:removeRecipeStep(result.recipe,index);
    const issues=result.issues.flatMap(issue=>{const field=fieldAfterRemoval(issue.field,kind,index);return field?[{...issue,field}]:[];});
    setResult({...result,recipe,issues});setAcknowledged(acknowledged.flatMap(field=>{const next=fieldAfterRemoval(field,kind,index);return next?[next]:[];}));
  }
  const remaining=result?.issues.filter(issue=>!acknowledged.includes(issue.field)).length??0;
  async function save(){
    if(!result||saving||photoBusy)return;
    if(remaining){setError('「要確認」の内容を確かめてチェックしてください。');return;}
    const form=document.getElementById('recipe-form') as HTMLFormElement|null;if(!form?.reportValidity())return;
    const recipe=validateRecord('recipe',result.recipe);if(!recipe){setError('材料・手順・人数などの入力内容を確認してください。');return;}
    setError('');setSaving(true);
    try{await props.onSave(recipe as Recipe);}catch(cause){setError(cause instanceof Error?cause.message:'保存できませんでした。');}finally{setSaving(false);}
  }
  const disabled=props.closing||!!progress||saving||photoBusy||(!result&&!demo&&(props.local||(mode!=='url'&&!props.ai)||(mode==='image'?!image:!value.trim())));
  const context:DockContext={key:'import',label:'取り込みの操作',back,action:()=>void(result?save():start()),actionLabel:progress?'読み取っています…':saving?'保存しています…':result?(result.demo?'サンプルとして保存':'確認して保存'):demo?'デモで読み取る':'読み取る',icon:Check,disabled:disabled||!!remaining,commit:true,appearance:progress?'breathing':result?undefined:'studio'};
  const panel=props.active?<Panel title={result?'取り込み内容を確認':'レシピを取り込む'} icon={result?Check:BookOpen} closing={props.closing} onClose={back} onExited={props.onExited} processing={!!progress} status={progress?<ImportPhaseStatus progress={progress}/>:undefined}>
    {progress?<ImportProcessing progress={progress}/>:result&&source?<ImportReview onPhotoBusyChange={setPhotoBusy} onRemoveItem={removeItem} result={result} source={source} onChange={recipe=>setResult({...result,recipe})} onSubmit={()=>void save()} error={error} acknowledged={acknowledged} onAcknowledge={setAcknowledged}/>:<div className="import-form">
      {props.allowDemo&&<div className="import-mode" role="group" aria-label="取り込み方法"><button aria-pressed={!demo} onClick={()=>{setDemo(false);setError('');}}>レシピを読み取る</button><button aria-pressed={demo} onClick={()=>{setDemo(true);setError('');}}>デモで試す</button></div>}
      {demo?<div className="import-demo-sample"><span className="import-demo-badge"><Sparkles size={13}/>デモ · staging限定</span><h3>レシピメモを読み取る</h3><p>読み取りから内容の確認・修正までを体験できます。</p><div className="import-sample-paper"><FileText size={24}/><strong>鶏肉ときのこのクリーム煮</strong><div><span>鶏もも肉</span><b>250 g</b></div><div><span>しめじ</span><b>1/2 パック</b></div><div><span>牛乳</span><b>200 ml</b></div><div><span>バター</span><b>？</b></div></div><small>保存するまでレシピは追加されません。</small></div>:<>
        <div className="mode-options">{([{value:'url',label:'URL'},{value:'image',label:'画像'},{value:'text',label:'本文'}] as const).map(item=><button key={item.value} aria-pressed={mode===item.value} className={mode===item.value?'selected':''} onClick={()=>{setMode(item.value);setValue('');setError('');}}>{item.label}</button>)}</div>
        {mode==='url'&&!props.local&&!value.trim()&&<ClipboardLink disabled={props.closing} onUse={setValue}/>}
        {mode==='url'?<label className="field">レシピのURL<input type="url" maxLength={2048} placeholder="https://" value={value} onChange={event=>setValue(event.target.value)}/></label>:mode==='text'?<label className="field">レシピの本文<textarea rows={10} maxLength={30000} placeholder="材料・分量・作り方を貼り付け" value={value} onChange={event=>setValue(event.target.value)}/></label>:<label className="import-upload"><ImagePlus size={30}/><strong>{imageName||'画像を選択'}</strong><small>PNG・JPEG・WebP / 6MBまで</small><input aria-label="レシピ画像を選択" type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>void selectImage(event)}/></label>}
        {image&&mode==='image'&&<img className="import-preview" src={image} alt="選択したレシピ画像"/>}
        {props.local?<p className="subtle">取り込みにはGoogleログインが必要です。手入力はこの端末でも使えます。</p>:mode!=='url'&&!props.ai?<p className="subtle">AI取り込みは準備中です。URLか手入力で追加できます。</p>:<p className="subtle">{mode==='url'?'レシピページやYouTubeの公開動画から取り込みます。動画は概要欄・音声・映像を読み取るため、数分かかることがあります。':'読み取り結果は、保存前に確認・修正できます。'}</p>}
      </>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      {error&&diagnostics&&<details className="import-error-details"><summary>エラーの詳細</summary><pre>{JSON.stringify(diagnostics,null,2)}</pre></details>}
      <button className="import-manual" onClick={props.onManual}><Pencil size={15}/>手入力で追加する</button>
    </div>}
  </Panel>:null;
  return {context,panel};
}
