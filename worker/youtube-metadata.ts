import {abortable} from './import-ai';
import type {YouTubeVideo} from '../src/youtube';

export type YouTubeMetadata={title:string;description:string;seconds?:number};
// Read the public page's own player metadata, never unrelated videos or script code.
export function youtubeMetadata(html:string,id:string):YouTubeMetadata|null {
  for(const match of html.matchAll(/(?:\bytInitialPlayerResponse\s*=|["']ytInitialPlayerResponse["']\s*:)\s*\{/g)){
    const start=match.index!+match[0].lastIndexOf('{');let depth=0,quoted=false,escaped=false;
    for(let i=start;i<html.length;i++){
      const char=html[i];
      if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
      if(char==='"'){quoted=true;continue;}
      if(char==='{')depth++;
      if(char==='}'&&--depth===0){
        try{
          const data=JSON.parse(html.slice(start,i+1)),details=data.videoDetails;
          if(details?.videoId===id&&typeof details.title==='string'&&typeof details.shortDescription==='string'){
            const seconds=Number(details.lengthSeconds);
            return {title:details.title.slice(0,200),description:details.shortDescription.slice(0,20000),...(Number.isInteger(seconds)&&seconds>0?{seconds}:{})};
          }
        }catch{/* A changed page format must not prevent direct video analysis. */}
        break;
      }
    }
  }
  return null;
}

export async function fetchYouTubeMetadata(video:YouTubeVideo,parent:AbortSignal):Promise<YouTubeMetadata|null> {
  const signal=AbortSignal.any([parent,AbortSignal.timeout(10000)]);
  try{
    const response=await fetch(video.url,{redirect:'manual',signal,headers:{Accept:'text/html','User-Agent':'uchino recipe importer'}});
    if(!response.ok||!response.headers.get('content-type')?.includes('text/html')){await response.body?.cancel();return null;}
    const reader=response.body?.getReader();if(!reader)return null;
    const decoder=new TextDecoder();let html='',size=0;
    const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
    try{
      while(true){
        const {done,value}=await abortable(reader.read(),signal);signal.throwIfAborted();
        if(done){html+=decoder.decode();break;}
        size+=value.length;if(size>2_000_000)return null;html+=decoder.decode(value,{stream:true});
      }
      return youtubeMetadata(html,video.id);
    }finally{signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
  }catch{parent.throwIfAborted();return null;}
}
