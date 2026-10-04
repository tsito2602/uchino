// Where cooking stopped, per recipe, so closing cook mode mid-way (a phone
// call, checking the shopping list) doesn't lose the place. Kept for half a
// day; finishing the recipe clears it.
const KEY='uchino-cook-progress',KEEP=12*3600*1000;
type Saved=Record<string,{step:number;at:number}>;
function read():Saved{try{const value=JSON.parse(localStorage.getItem(KEY)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}}
function write(value:Saved){try{localStorage.setItem(KEY,JSON.stringify(value));}catch{/* Resume is a nicety. */}}
export function savedStep(id:string,total:number){
  const entry=read()[id];
  return entry&&Date.now()-entry.at<KEEP&&entry.step>0&&entry.step<total?entry.step:0;
}
export function saveStep(id:string,step:number){
  const all=read(),now=Date.now();
  for(const [key,entry] of Object.entries(all))if(now-entry.at>=KEEP)delete all[key];
  if(step>0)all[id]={step,at:now};else delete all[id];
  write(all);
}
export const clearStep=(id:string)=>saveStep(id,0);
