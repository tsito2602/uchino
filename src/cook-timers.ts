import {useSyncExternalStore} from 'react';

// Kitchen timers started from a step's time ("10分煮る"). They outlive the
// panel that started them and survive a reload, so a simmering pot is never
// forgotten because the recipe was closed.
export type CookTimer={id:string;label:string;duration:number;endsAt:number;done:boolean};
const KEY='uchino-cook-timers',MAX=3;
const read=():CookTimer[]=>{try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value.filter(t=>t&&typeof t.endsAt==='number'&&typeof t.label==='string'):[];}catch{return [];}};
let timers:CookTimer[]=typeof localStorage==='undefined'?[]:read(),ticker=0,audio:AudioContext|null=null;
const listeners=new Set<()=>void>();
function emit(){
  try{localStorage.setItem(KEY,JSON.stringify(timers));}catch{/* Timers still run without storage. */}
  for(const listener of listeners)listener();
  schedule();
}
function chime(){
  try{
    if(typeof navigator.vibrate==='function')navigator.vibrate([180,90,180,90,260]);
    if(!audio)return;
    const now=audio.currentTime;
    [0,.32,.64].forEach((offset,index)=>{
      const tone=audio!.createOscillator(),gain=audio!.createGain();
      tone.type='sine';tone.frequency.value=index===2?1046.5:880;
      gain.gain.setValueAtTime(0,now+offset);gain.gain.linearRampToValueAtTime(.22,now+offset+.02);gain.gain.exponentialRampToValueAtTime(.001,now+offset+.6);
      tone.connect(gain).connect(audio!.destination);tone.start(now+offset);tone.stop(now+offset+.62);
    });
  }catch{/* Sound is a nicety only. */}
}
function check(){
  const now=Date.now();let finished=false;
  timers=timers.map(t=>{if(!t.done&&t.endsAt<=now){finished=true;return {...t,done:true};}return t;});
  if(finished){chime();emit();}else for(const listener of listeners)listener();
}
function schedule(){
  const running=timers.some(t=>!t.done);
  if(running&&!ticker)ticker=window.setInterval(check,250);
  if(!running&&ticker){clearInterval(ticker);ticker=0;}
}
if(typeof window!=='undefined'){schedule();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});}

export function startTimer(label:string,seconds:number){
  // The tap that starts a timer is the user gesture that lets it ring later.
  try{audio??=new AudioContext();void audio.resume();}catch{audio=null;}
  const timer:CookTimer={id:crypto.randomUUID(),label,duration:seconds*1000,endsAt:Date.now()+seconds*1000,done:false};
  timers=[...timers.filter(t=>!t.done),timer].slice(-MAX);emit();
}
export function stopTimer(id:string){timers=timers.filter(t=>t.id!==id);emit();}
export function useCookTimers(){
  return useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener);},()=>timers,()=>timers);
}
// Re-render once a second while timers run, for the countdown text.
export function useNow(active:boolean){
  return useSyncExternalStore(listener=>{if(!active)return()=>{};const id=setInterval(listener,500);return()=>clearInterval(id);},()=>active?Math.floor(Date.now()/500):0,()=>0);
}
export const formatClock=(ms:number)=>{const total=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;};

// "10分", "1時間半", "30秒", "5〜6分" (the shorter end, so nothing overcooks).
// Units written back to back in falling order ("1分30秒", "1時間30分") are one
// duration, so they make one timer rather than two.
const NUM='[0-9０-９]+(?:[.．][0-9０-９]+)?',SEG=`(${NUM})(?:\\s*[〜~～\\-－]\\s*${NUM})?\\s*(時間|分|秒)(半)?`;
const TIME=new RegExp(`${SEG}(?:\\s*${SEG})*`,'g'),PART=new RegExp(SEG,'g');
const UNIT={時間:3600,分:60,秒:1} as const;
const number=(text:string)=>Number(text.replace(/[０-９．]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)));
export type StepPart={text:string;seconds?:number};
export function splitStepTimes(step:string):StepPart[]{
  const parts:StepPart[]=[];let last=0;
  const push=(index:number,text:string,seconds:number)=>{
    if(!(seconds>=5&&seconds<=12*3600))return;
    if(index>last)parts.push({text:step.slice(last,index)});
    parts.push({text,seconds});last=index+text.length;
  };
  for(const match of step.matchAll(TIME)){
    // Group the pieces of a run while each unit is smaller than the one before.
    let group:{index:number;end:number;seconds:number;unit:number}|null=null;
    for(const piece of match[0].matchAll(PART)){
      const unit=UNIT[piece[2] as keyof typeof UNIT],seconds=number(piece[1])*unit+(piece[3]?unit/2:0),index=match.index+piece.index,end=index+piece[0].length;
      if(group&&unit<group.unit&&!/半/.test(step.slice(group.index,group.end)))group={index:group.index,end,seconds:group.seconds+seconds,unit};
      else{if(group)push(group.index,step.slice(group.index,group.end),Math.round(group.seconds));group={index,end,seconds,unit};}
    }
    if(group)push(group.index,step.slice(group.index,group.end),Math.round(group.seconds));
  }
  if(last<step.length)parts.push({text:step.slice(last)});
  return parts;
}
