import {Timer} from 'lucide-react';
import {splitStepTimes,startTimer} from './cook-timers';
import {haptic} from './haptics';

// A step's times become chips that start a kitchen timer for that step.
export function StepText({text,label}:{text:string;label:string}){
  return <>{splitStepTimes(text).map((part,index)=>part.seconds?<button type="button" key={index} className="step-timer" aria-label={`${part.text}のタイマーを開始`} onClick={()=>{haptic();startTimer(`${label}・${part.text}`,part.seconds!);}}><Timer size={14} strokeWidth={2.2} aria-hidden="true"/>{part.text}</button>:part.text)}</>;
}
