import type {ImportPhotoSheet} from '../src/import-model';
import {importRecipePhoto} from './import-photo';

export type YouTubeStoryboard={template:string;frameWidth:number;frameHeight:number;columns:number;rows:number;count:number;interval:number};
// These are the public preview sheets advertised by the selected video's player.
// Do not guess URLs or fetch video streams, signing code, cookies or other hosts.
export function youtubeStoryboard(spec:unknown,id:string):YouTubeStoryboard|undefined {
  if(typeof spec!=='string'||spec.length>20000)return;
  const [base,...levels]=spec.split('|');let selected:YouTubeStoryboard|undefined;
  levels.forEach((level,index)=>{
    const parts=level.split('#');if(parts.length!==8)return;
    const [frameWidth,frameHeight,count,columns,rows,interval]=parts.slice(0,6).map(Number);
    if(![frameWidth,frameHeight,count,columns,rows,interval].every(n=>Number.isInteger(n)&&n>0)||frameWidth<160||frameWidth>640||frameHeight<90||frameHeight>640||count>20000||columns>10||rows>10||frameWidth*columns>4096||frameHeight*rows>4096||interval>30000)return;
    if(!/^M\$M$/.test(parts[6])||!/^[\w$-]+$/.test(parts[7]))return;
    const template=base.replaceAll('$L',String(index)).replaceAll('$N',parts[6]);
    try{
      const url=new URL(template.replace('$M','0'));
      if(url.protocol!=='https:'||url.hostname!=='i.ytimg.com'||url.port||url.username||url.password||!url.pathname.startsWith(`/sb/${id}/`)||!url.pathname.endsWith('/M0.jpg')||url.hash)return;
      if((template.match(/\$M/g)||[]).length!==1)return;
      const signed=new URL(template);signed.searchParams.set('sigh',parts[7]);
      const candidate={template:signed.href.replace('%24M','$M'),frameWidth,frameHeight,columns,rows,count,interval:interval/1000};
      if(!selected||frameWidth>selected.frameWidth||frameWidth===selected.frameWidth&&interval/1000<selected.interval)selected=candidate;
    }catch{/* Not a recognized public preview URL. */}
  });
  return selected;
}
export function storyboardFrame(board:YouTubeStoryboard,seconds:number,start:number,end?:number){
  const first=Math.max(0,Math.ceil(start/board.interval));
  const last=Math.min(board.count-1,end===undefined?board.count-1:Math.ceil(end/board.interval)-1);
  if(first>last)return null;
  const frame=Math.max(first,Math.min(last,Math.round(seconds/board.interval))),perSheet=board.columns*board.rows,cell=frame%perSheet;
  return {url:board.template.replace('$M',String(Math.floor(frame/perSheet))),x:(cell%board.columns)*board.frameWidth,y:Math.floor(cell/board.columns)*board.frameHeight,width:board.frameWidth,height:board.frameHeight};
}
export async function importYouTubeStepPhotos(board:YouTubeStoryboard|undefined,starts:(number|null)[],photos:(number|null)[],source:URL,parent:AbortSignal,seconds?:number):Promise<{stepPhotoSheets?:ImportPhotoSheet[];warnings?:string[]}> {
  parent.throwIfAborted();
  const warning='一部の手順の場面画像を取得できませんでした。手順の動画リンクから確認できます。';
  if(!board)return {warnings:[warning]};
  const requests=new Map<string,ImportPhotoSheet['frames']>();let missing=false;
  starts.forEach((start,index)=>{
    if(start===null){missing=true;return;}
    const end=starts.slice(index+1).find((value):value is number=>value!==null&&value>start)??seconds;
    const photo=photos[index];
    if(typeof photo!=='number'||!Number.isFinite(photo)||photo<start||end!==undefined&&photo>=end){missing=true;return;}
    const frame=storyboardFrame(board,photo,start,end);if(!frame){missing=true;return;}
    const {url,...crop}=frame;const frames=requests.get(url)||[];frames.push({index,...crop});requests.set(url,frames);
  });
  const signal=AbortSignal.any([parent,AbortSignal.timeout(15000)]),stepPhotoSheets:ImportPhotoSheet[]=[];let size=0,attempts=0;
  // Deduplicate sheets: several steps often share one image. Bound the response
  // independently of the number of recipe steps (the client has an 18MB limit).
  for(const [url,frames] of requests){
    parent.throwIfAborted();if(signal.aborted||attempts++>=16){missing=true;break;}
    try{
      const result=await importRecipePhoto([url],source,signal);
      if(!result.photo||size+result.photo.length>8_000_000){missing=true;continue;}
      size+=result.photo.length;stepPhotoSheets.push({photo:result.photo,width:board.frameWidth*board.columns,height:board.frameHeight*board.rows,frames});
    }catch{parent.throwIfAborted();missing=true;break;}
  }
  return {...(stepPhotoSheets.length?{stepPhotoSheets}:{}),...(missing?{warnings:[warning]}:{})};
}
