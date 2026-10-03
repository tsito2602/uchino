import {useEffect,useState} from 'react';
import {Check,ShieldCheck} from 'lucide-react';
import type {Recipe} from './domain';
import type {ImportPhase} from './import-model';
import {ImportThinking} from './import-thinking';
import {ImportBowl} from './import-bowl';

export type ImportProgress={phase:ImportPhase;started:number;demo:boolean;ingredients:Recipe['ingredients'];total:number|null};
export function ImportPhaseStatus({progress}:{progress:ImportProgress}) {
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{const update=()=>setElapsed(Math.floor((Date.now()-progress.started)/1000));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[progress.started]);
  const {phase,demo,ingredients,total}=progress;
  const title=phase==='video'?'動画の音声・映像を読み取っています':phase==='photos'?'手順の場面画像を取得しています':phase==='reading'?'レシピを読み取っています':phase==='sorting'?'材料・作り方を整理しています':'確認する項目をまとめています';
  return <div className="import-phase-status"><div className="import-phase-title"><div className="import-phase-title-content" key={phase}><ImportThinking text={title}/></div>{demo&&<small>デモ</small>}<span className="import-elapsed" aria-label={`経過${elapsed}秒`}>{elapsed}秒</span></div>
    <ol className="import-tasks">{(['reading','sorting'] as const).map((task,i)=>{const done=task==='reading'?!['reading','video'].includes(phase):['checking','photos'].includes(phase);const current=task===phase||task==='reading'&&phase==='video';const fraction=task==='sorting'&&total?ingredients.length/total:null;return <li key={task} data-state={done?'done':current?'current':'pending'} data-indeterminate={current&&fraction===null}><span className="import-task-marker">{done?<Check size={12}/>:i+1}</span><span>{i===0?'読み取り':'材料・手順の整理'}</span><small>{done?'完了':current?'処理中':'待機中'}</small><span className="import-task-track" role="progressbar" aria-label={i===0?'読み取り':'整理'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={done?100:fraction!==null?Math.round(fraction*100):undefined}><i style={current&&fraction!==null?{transform:`scaleX(${fraction})`}:undefined}/></span></li>;})}</ol>
    <div className="import-verification" data-active={phase==='checking'}><ShieldCheck size={13}/><span>人数・分量・読み取りが曖昧な箇所を確認</span><small>{phase==='photos'?'確認済み':phase==='checking'?'確認中':'待機中'}</small></div>
    <div className="import-phase-summary"><span>{demo?'サンプルの読み取りを再現しています':'処理が完了すると確認画面に進みます'}</span><b>{total===null?'材料を確認中':`${ingredients.length} / ${total} 材料`}</b></div>
  </div>;
}

export function ImportProcessing({progress}:{progress:ImportProgress}) {
  return <div className="import-processing"><ImportBowl progress={progress}/></div>;
}
