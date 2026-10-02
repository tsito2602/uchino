import {useRef,useState} from 'react';
import {BookOpen,ListOrdered,NotebookPen,Plus,Trash2,Utensils} from 'lucide-react';
import {categories,recipePhoto,removeRecipeStep,MAX_STEP_PHOTO_BYTES,STEP_PHOTOS_BUDGET,type Recipe} from './domain';
import {RecipePhotoPicker} from './recipe-photo-picker';
export function RecipeEditor({value,onChange,onSubmit,error,onRemoveItem,onPhotoBusyChange}:{value:Recipe;onChange:(recipe:Recipe)=>void;onSubmit:()=>void;error:string;onPhotoBusyChange?:(busy:boolean)=>void;onRemoveItem?:(kind:'ingredients'|'steps',index:number)=>void}){
  const busyPhotos=useRef(new Set<string>()),[photoBusy,setPhotoBusy]=useState(false);
  const update=(change:Partial<Recipe>)=>onChange({...value,...change});
  const busy=(key:string,active:boolean)=>{if(active)busyPhotos.current.add(key);else busyPhotos.current.delete(key);const next=busyPhotos.current.size>0;setPhotoBusy(next);onPhotoBusyChange?.(next);};
  const updateIngredient=(index:number,change:Partial<Recipe['ingredients'][number]>)=>update({ingredients:value.ingredients.map((item,i)=>i===index?{...item,...change}:item)});
  const photoBudget=(index:number)=>Math.min(MAX_STEP_PHOTO_BYTES,STEP_PHOTOS_BUDGET-(value.stepPhotos||[]).reduce((sum,photo,i)=>sum+(i===index||!photo.startsWith('data:')?0:Math.ceil((photo.split(',')[1]?.length||0)*3/4)),0));
  return <form id="recipe-form" className="form recipe-form" onSubmit={e=>{e.preventDefault();if(!photoBusy)onSubmit();}}>
    {error&&<p role="alert" className="form-error">{error}</p>}
    <fieldset className="recipe-editor-fields" disabled={photoBusy}>
      <section className="recipe-editor-section" aria-labelledby="editor-basic-title">
        <div className="editor-heading"><h3 id="editor-basic-title"><BookOpen size={18}/>基本情報</h3></div>
        <label className="field">レシピ名<input data-import-field="title" required maxLength={200} value={value.title} placeholder="レシピ名を入力" onChange={e=>update({title:e.target.value})}/></label>
        <RecipePhotoPicker photo={recipePhoto(value)} onChange={photo=>update({photo})} onBusyChange={active=>busy('cover',active)}/>
        <div className="field-pair"><label className="field">カテゴリ<select data-import-field="category" value={value.category} onChange={e=>update({category:e.target.value as Recipe['category']})}>{categories.slice(1).map(c=><option key={c}>{c}</option>)}</select></label><label className="field">人数（人分）<input aria-label="人数" data-import-field="servings" type="number" min={1} max={100} required inputMode="numeric" value={value.servings} onChange={e=>update({servings:Number(e.target.value)})}/></label></div>
        <label className="field">調理時間（分）<input data-import-field="minutes" type="number" min={1} max={10080} inputMode="numeric" value={value.minutes??''} placeholder="未設定" onChange={e=>update({minutes:e.target.value?Number(e.target.value):null})}/></label>
      </section>
      <section className="recipe-editor-section" aria-labelledby="editor-ingredients-title">
        <div className="editor-heading"><h3 id="editor-ingredients-title"><Utensils size={18}/>材料 <small>{value.ingredients.length}品</small></h3><button className="text-action" type="button" aria-label="材料を追加" disabled={value.ingredients.length>=100} onClick={()=>update({ingredients:[...value.ingredients,{name:'',quantity:'',unit:'',group:value.ingredients.at(-1)?.group||''}]})}><Plus size={16}/>追加</button></div>
        <p className="editor-hint">A・Bや「たれ」などのまとまりは、グループに入力できます。</p>
        <div className="editor-items">{value.ingredients.map((item,index)=><div className="editor-ingredient-card" key={index}>
          <div className="editor-item-heading"><span className="editor-item-number">材料 {index+1}</span><label className="editor-group-field"><span>グループ</span><input data-import-field={`ingredients.${index}.group`} aria-label={`グループ${index+1}`} maxLength={50} value={item.group||''} placeholder="なし" onChange={e=>updateIngredient(index,{group:e.target.value})}/></label><button type="button" className="row-icon" disabled={value.ingredients.length<=1} aria-label={`材料${index+1}を削除`} onClick={()=>onRemoveItem?onRemoveItem('ingredients',index):update({ingredients:value.ingredients.filter((_,n)=>n!==index)})}><Trash2 size={16}/></button></div>
          <label className="field">材料名<input data-import-field={`ingredients.${index}.name`} aria-label={`材料${index+1}`} required maxLength={200} value={item.name} placeholder="玉ねぎ" onChange={e=>updateIngredient(index,{name:e.target.value})}/></label>
          <div className="field-pair"><label className="field">分量<input data-import-field={`ingredients.${index}.quantity`} aria-label={`分量${index+1}`} maxLength={100} value={item.quantity} placeholder="1/2" onChange={e=>updateIngredient(index,{quantity:e.target.value})}/></label><label className="field">単位<input data-import-field={`ingredients.${index}.unit`} aria-label={`単位${index+1}`} maxLength={50} value={item.unit} placeholder="個・大さじ など" onChange={e=>updateIngredient(index,{unit:e.target.value})}/></label></div>
        </div>)}</div>
      </section>
      <section className="recipe-editor-section" aria-labelledby="editor-steps-title">
        <div className="editor-heading"><h3 id="editor-steps-title"><ListOrdered size={18}/>作り方 <small>{value.steps.length}手順</small></h3><button className="text-action" type="button" aria-label="手順を追加" disabled={value.steps.length>=100} onClick={()=>update({steps:[...value.steps,''],...(value.stepPhotos?{stepPhotos:[...value.stepPhotos,'']}:{})})}><Plus size={16}/>追加</button></div>
        <div className="editor-items">{value.steps.map((step,index)=><div className="editor-step-card" key={index}>
          <div className="editor-item-heading"><span className="editor-step-number">{index+1}</span><span className="editor-item-title">手順 {index+1}</span><button type="button" className="row-icon" disabled={value.steps.length<=1} aria-label={`手順${index+1}を削除`} onClick={()=>onRemoveItem?onRemoveItem('steps',index):onChange(removeRecipeStep(value,index))}><Trash2 size={16}/></button></div>
          <label className="field"><span className="visually-hidden">手順{index+1}</span><textarea data-import-field={`steps.${index}`} aria-label={`手順${index+1}`} required maxLength={5000} value={step} rows={4} placeholder="作り方を入力" onChange={e=>update({steps:value.steps.map((v,n)=>n===index?e.target.value:v)})}/></label>
          <RecipePhotoPicker compact label={`手順${index+1}の写真`} photo={value.stepPhotos?.[index]||''} maxBytes={photoBudget(index)} onChange={photo=>update({stepPhotos:value.steps.map((_,i)=>i===index?photo:value.stepPhotos?.[i]||'')})} onBusyChange={active=>busy(`step-${index}`,active)}/>
        </div>)}</div>
      </section>
      <section className="recipe-editor-section" aria-labelledby="editor-notes-title">
        <div className="editor-heading"><h3 id="editor-notes-title"><NotebookPen size={18}/>メモ・出典</h3></div>
        <label className="field">メモ<textarea data-import-field="memo" maxLength={10000} value={value.memo} rows={3} placeholder="おいしく作るコツや、次回試したいこと" onChange={e=>update({memo:e.target.value})}/></label>
        <label className="field">参照URL<input type="url" maxLength={2048} value={value.sourceUrl} placeholder="https://" onChange={e=>update({sourceUrl:e.target.value})}/></label>
      </section>
    </fieldset>
    <button className="visually-hidden" type="submit" tabIndex={-1}>保存</button>
  </form>;
}
