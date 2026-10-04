import {useEffect,useRef,useState} from 'react';
import {ImagePlus,LoaderCircle,Trash2} from 'lucide-react';
import {prepareRecipePhoto,PHOTO_INPUT_ACCEPT} from './recipe-photo';
import {RecipeImage} from './recipe-image';

export function RecipePhotoPicker({photo,onChange,onBusyChange,label='料理の写真',compact=false,maxBytes,disabled=false}:{photo:string;onChange:(photo:string)=>void;onBusyChange?:(busy:boolean)=>void;label?:string;compact?:boolean;maxBytes?:number;disabled?:boolean}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null),sequence=useRef(0),latest=useRef({onChange,onBusyChange});
  latest.current={onChange,onBusyChange};
  useEffect(()=>()=>{sequence.current++;latest.current.onBusyChange?.(false);},[]);
  async function select(file:File){
    const id=++sequence.current;setError('');setBusy(true);latest.current.onBusyChange?.(true);
    try{if(maxBytes!==undefined&&maxBytes<4000)throw new Error('手順写真の容量がいっぱいです。不要な写真を削除してください。');const result=await prepareRecipePhoto(file,maxBytes);if(sequence.current===id)latest.current.onChange(result);}
    catch(cause){if(sequence.current===id)setError(cause instanceof Error?cause.message:'写真を読み込めませんでした。');}
    finally{if(sequence.current===id){setBusy(false);latest.current.onBusyChange?.(false);}}
  }
  return <div className={`recipe-photo-field${compact?' is-compact':''}`}>
    {!compact&&<span className="recipe-photo-label">{label}</span>}
    <input ref={input} className="visually-hidden" type="file" tabIndex={-1} aria-label={`${label}を選択`} accept={PHOTO_INPUT_ACCEPT} disabled={busy||disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void select(file);}}/>
    <button type="button" className={`recipe-photo-select${photo?' has-photo':''}`} disabled={busy||disabled} onClick={()=>input.current?.click()} aria-label={`${label}を${photo?'変更':'追加'}`}>
      {photo&&<RecipeImage src={photo} alt={`選択した${label}`}/>}
      <span className="recipe-photo-select-label">{busy?<LoaderCircle className="spin" size={20}/>:<ImagePlus size={20}/>}<span>{busy?'写真を準備中…':photo?'写真を変更':'写真を追加'}</span></span>
    </button>
    {photo&&<button type="button" className="text-action recipe-photo-remove" aria-label={`${label}を削除`} disabled={busy||disabled} onClick={()=>{setError('');onChange('');}}><Trash2 size={15}/>写真を削除</button>}
    {busy&&<span className="visually-hidden" role="status">写真を準備しています</span>}
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}
