// Each photo's average colour, remembered on this device, so a card shows its
// photo's tone at once and the picture resolves out of it instead of out of grey.
const KEY='uchino-photo-tones',LIMIT=400;
let tones:Record<string,string>|null=null;
const load=()=>{if(tones)return tones;try{tones=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{tones={};}return tones!;};
export const photoTone=(src:string)=>load()[src];
export function rememberTone(src:string,image:HTMLImageElement){
  const all=load();if(all[src]||!image.naturalWidth)return;
  try{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=6;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;
    context.drawImage(image,0,0,6,6);
    const data=context.getImageData(0,0,6,6).data;let r=0,g=0,b=0;
    for(let i=0;i<data.length;i+=4){r+=data[i];g+=data[i+1];b+=data[i+2];}
    const n=data.length/4;all[src]=`rgb(${Math.round(r/n)} ${Math.round(g/n)} ${Math.round(b/n)})`;
    const keys=Object.keys(all);if(keys.length>LIMIT)for(const key of keys.slice(0,keys.length-LIMIT))delete all[key];
    localStorage.setItem(KEY,JSON.stringify(all));
  }catch{/* A tainted or unreadable image simply keeps the neutral tone. */}
}
