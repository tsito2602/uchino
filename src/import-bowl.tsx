import {useEffect,useId,useRef,useState,type CSSProperties} from 'react';
import type {ImportProgress} from './import-progress';

// A prep bowl that fills as the import advances. AI work has no known end, so
// each phase owns a band of the gauge and eases toward its top without ever
// claiming it; ingredient counts drive the sorting band, and only the real
// result fills the bowl to the brim.
const bands={reading:[.06,.36,18],video:[.06,.42,70],sorting:[.38,.8,14],checking:[.8,.9,6],photos:[.9,.97,8]} as const;
export function importGauge(progress:Pick<ImportProgress,'phase'|'ingredients'|'total'>,phaseSeconds:number){
  const [from,to,pace]=bands[progress.phase];
  const share=progress.phase==='sorting'&&progress.total?Math.min(1,progress.ingredients.length/progress.total):1-Math.exp(-phaseSeconds/pace);
  return from+(to-from)*share;
}
const ambient={reading:['材料','分量','手順','人数','下ごしらえ','コツ'],video:['音声','テロップ','映像','概要欄','手元'],sorting:['大さじ','小さじ','g','ml','少々'],checking:['人数','分量','確認'],photos:['写真','場面']} as const;

export function BowlFigure({level,mixing=false}:{level:number;mixing?:boolean}) {
  const clip=useId();
  // Interior spans y=78 (brim) to y=178 (bottom).
  const y=178-100*Math.max(0,Math.min(1,level));
  return <svg className="import-bowl-figure" viewBox="0 0 240 200" aria-hidden="true" data-mixing={mixing||undefined}>
    <defs>
      <clipPath id={`${clip}-level`}><rect className="import-bowl-level" x="0" width="240" height="200" style={{transform:`translateY(${y+2}px)`}}/></clipPath>
      <clipPath id={`${clip}-in`}><path d="M28 78 C34 140 74 178 120 178 C166 178 206 140 212 78 Z"/></clipPath>
      <linearGradient id={`${clip}-fill`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#f6b98a"/><stop offset=".18" stopColor="#f6b98a"/><stop offset=".18" stopColor="#efd27e"/><stop offset=".36" stopColor="#efd27e"/>
        <stop offset=".36" stopColor="#b9d98f"/><stop offset=".54" stopColor="#b9d98f"/><stop offset=".54" stopColor="#8fd3c8"/><stop offset=".72" stopColor="#8fd3c8"/>
        <stop offset=".72" stopColor="#9fb4f2"/><stop offset=".86" stopColor="#9fb4f2"/><stop offset=".86" stopColor="#d5a6ec"/><stop offset="1" stopColor="#d5a6ec"/>
      </linearGradient>
    </defs>
    <ellipse className="import-bowl-shadow" cx="120" cy="188" rx="70" ry="7"/>
    <path className="import-bowl-body" d="M22 78 C28 146 72 184 120 184 C168 184 212 146 218 78 Z"/>
    <g clipPath={`url(#${clip}-in)`}>
      <g clipPath={`url(#${clip}-level)`}><rect x="0" y="78" width="240" height="110" fill={`url(#${clip}-fill)`}/></g>
      <g className="import-bowl-surface" style={{transform:`translateY(${y-78}px)`}}><path className="import-bowl-wave" d="M-120 80 q30 -9 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 V86 H-120 Z"/></g>
    </g>
    <ellipse className="import-bowl-rim" cx="120" cy="78" rx="98" ry="14"/>
    <path className="import-bowl-lip" d="M22 78 C28 146 72 184 120 184 C168 184 212 146 218 78"/>
  </svg>;
}

type Piece={id:number;text:string;x:number;y:number;turn:number};
export function ImportBowl({progress}:{progress:ImportProgress}) {
  const [pieces,setPieces]=useState<Piece[]>([]),[level,setLevel]=useState(0);
  const phaseStart=useRef({phase:progress.phase,at:Date.now()}),shown=useRef(0),next=useRef(0),latest=useRef(progress);
  latest.current=progress;
  if(phaseStart.current.phase!==progress.phase)phaseStart.current={phase:progress.phase,at:Date.now()};
  const reduced=typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(()=>{
    let frame=0,current=0,last=performance.now();
    const tick=(now:number)=>{
      const p=latest.current,target=importGauge(p,(Date.now()-phaseStart.current.at)/1000),step=1-Math.exp(-(now-last)/450);last=now;
      // Never drain; glide toward each new target over about half a second.
      current=Math.max(current,reduced?target:current+(target-current)*step);
      setLevel(value=>Math.abs(value-current)>.002?current:value);
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[reduced]);
  useEffect(()=>{
    if(reduced)return;
    const toss=(text:string)=>{
      const id=++next.current,angle=Math.random()*Math.PI*2;
      setPieces(list=>[...list.slice(-10),{id,text,x:Math.cos(angle)*190,y:Math.min(-40,Math.sin(angle)*170-60),turn:Math.round(Math.random()*40-20)}]);
      setTimeout(()=>setPieces(list=>list.filter(piece=>piece.id!==id)),1100);
    };
    const timer=setInterval(()=>{
      const p=latest.current;
      if(p.ingredients.length>shown.current){toss(p.ingredients[shown.current].name);shown.current++;return;}
      const words=ambient[p.phase];toss(words[Math.floor(Math.random()*words.length)]);
    },650);
    return()=>clearInterval(timer);
  },[reduced]);
  return <div className="import-bowl" role="img" aria-label={`取り込みの進み具合 ${Math.round(level*100)}%`}>
    {pieces.map(piece=><span key={piece.id} className="import-bowl-piece" style={{'--from-x':`${piece.x}px`,'--from-y':`${piece.y}px`,'--turn':`${piece.turn}deg`} as CSSProperties}>{piece.text}</span>)}
    <BowlFigure level={level}/>
  </div>;
}
