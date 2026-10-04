import {Timer,X,Check} from 'lucide-react';
import {formatClock,stopTimer,useCookTimers,useNow} from './cook-timers';
import type {CSSProperties,ReactNode} from 'react';

// Floating just above the dock, within thumb reach: running kitchen timers,
// plus any quiet status from the partner passed in as children.
export function FloatingStatus({children}:{children?:ReactNode}){
  const timers=useCookTimers();useNow(timers.some(t=>!t.done));
  if(!timers.length&&!children)return null;
  return <div className="floating-status" aria-live="polite">
    {children}
    {timers.map(timer=>{const left=timer.endsAt-Date.now();return <div key={timer.id} className="cook-timer" data-done={timer.done||undefined} role="timer" aria-label={`${timer.label} ${timer.done?'時間です':`残り${formatClock(left)}`}`}>
      <span className="cook-timer-ring" aria-hidden="true" style={{'--progress':timer.done?1:1-left/timer.duration} as CSSProperties}>{timer.done?<Check size={14} strokeWidth={2.6}/>:<Timer size={14} strokeWidth={2.2}/>}</span>
      <span className="cook-timer-label">{timer.label}</span>
      <strong>{timer.done?'時間です':formatClock(left)}</strong>
      <button type="button" aria-label={timer.done?'タイマーを閉じる':'タイマーを止める'} onClick={()=>stopTimer(timer.id)}><X size={16}/></button>
    </div>;})}
  </div>;
}
