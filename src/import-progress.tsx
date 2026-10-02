import {useEffect,useRef,useState} from 'react';
import {Check,ChefHat,ScanLine,ShieldCheck} from 'lucide-react';
import type {Recipe} from './domain';
import type {ImportPhase} from './import-model';
import {ImportThinking} from './import-thinking';
import {scrollImportToLatest} from './import-follow-scroll';

export type ImportProgress={phase:ImportPhase;started:number;demo:boolean;ingredients:Recipe['ingredients'];total:number|null};
export function ImportPhaseStatus({progress}:{progress:ImportProgress}) {
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{const update=()=>setElapsed(Math.floor((Date.now()-progress.started)/1000));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[progress.started]);
  const {phase,demo,ingredients,total}=progress;
  const title=phase==='video'?'動画の音声・映像を読み取っています':phase==='reading'?'レシピを読み取っています':phase==='sorting'?'材料・作り方を整理しています':'確認する項目をまとめています';
  return <div className="import-phase-status"><div className="import-phase-title"><span className="import-phase-title-content" key={phase}><ScanLine size={18}/><strong>{title}</strong></span>{demo&&<small>デモ</small>}</div>
    <ol className="import-tasks">{(['reading','sorting'] as const).map((task,i)=>{const done=task==='reading'?!['reading','video'].includes(phase):phase==='checking';const current=task===phase||task==='reading'&&phase==='video';const fraction=task==='sorting'&&total?ingredients.length/total:null;return <li key={task} data-state={done?'done':current?'current':'pending'} data-indeterminate={current&&fraction===null}><span className="import-task-marker">{done?<Check size={12}/>:i+1}</span><span>{i===0?'読み取り':'材料・手順の整理'}</span><small>{done?'完了':current?'処理中':'待機中'}</small><span className="import-task-track" role="progressbar" aria-label={i===0?'読み取り':'整理'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={done?100:fraction!==null?Math.round(fraction*100):undefined}><i style={current&&fraction!==null?{transform:`scaleX(${fraction})`}:undefined}/></span></li>;})}</ol>
    <div className="import-verification" data-active={phase==='checking'}><ShieldCheck size={13}/><span>人数・分量・読み取りが曖昧な箇所を確認</span><small>{phase==='checking'?'確認中':'待機中'}</small></div>
    <div className="import-live-status"><ImportThinking text={title}/><span className="import-elapsed" aria-label={`経過${elapsed}秒`}>{elapsed}秒</span></div>
    <div className="import-phase-summary"><span>{demo?'サンプルの読み取りを再現しています':'処理が完了すると確認画面に進みます'}</span><b>{total===null?'材料を確認中':`${ingredients.length} / ${total} 材料`}</b></div>
  </div>;
}

export function ImportProcessing({progress}:{progress:ImportProgress}) {
  const list=useRef<HTMLDivElement>(null);
  useEffect(()=>{const viewport=list.current?.parentElement;if(viewport)scrollImportToLatest(viewport,window.matchMedia('(prefers-reduced-motion: reduce)').matches);},[progress.ingredients.length]);
  return <div ref={list} className="import-processing"><div className="import-sorting-list" aria-label="読み取り中の材料">{progress.ingredients.length?progress.ingredients.map((item,index)=><div className="import-sorted-entry" key={index}><ChefHat size={21}/><div className="import-entry-copy"><strong>{item.name}</strong><small>{item.quantity?'分量を読み取りました':'分量は要確認'}</small></div><b>{[item.quantity,item.unit].filter(Boolean).join(' ')||'要確認'}</b></div>):<div className="import-skeleton" aria-hidden="true">{[0,1,2].map(i=><div key={i}><i/><span/><b/></div>)}</div>}</div></div>;
}
