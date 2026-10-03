import {abortable} from './import-ai';
import type {YouTubeVideo} from '../src/youtube';
import {Parser} from 'htmlparser2';

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
          const microformat=data.microformat?.playerMicroformatRenderer;
          const description=typeof details?.shortDescription==='string'?details.shortDescription:microformat?.description?.simpleText;
          if(details?.videoId===id&&typeof details.title==='string'&&typeof description==='string'){
            const seconds=Number(details.lengthSeconds);
            return {title:details.title.slice(0,200),description:description.slice(0,20000),...(Number.isInteger(seconds)&&seconds>0?{seconds}:{})};
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
    const decoder=new TextDecoder();let size=0,script:string|null=null,scriptTooLarge=false;
    let metadata:YouTubeMetadata|null=null;
    // Watch pages can contain megabytes of recommendations after the player.
    // Parse complete scripts as they arrive and stop as soon as this video's
    // description is found; do not wait for unrelated page content or its EOF.
    const parser=new Parser({
      onopentag(name){if(name==='script'){script='';scriptTooLarge=false;}},
      ontext(text){if(script!==null&&!scriptTooLarge){if(script.length+text.length>2_000_000){script='';scriptTooLarge=true;}else script+=text;}},
      onclosetag(name){if(name==='script'){if(script&&!scriptTooLarge&&!metadata)metadata=youtubeMetadata(script,video.id);script=null;}},
    },{decodeEntities:false});
    const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
    try{
      while(true){
        const {done,value}=await abortable(reader.read(),signal);signal.throwIfAborted();
        if(done){parser.end(decoder.decode());return metadata;}
        // Bound each parser write, even if fetch yields the entire page at once.
        for(let offset=0;offset<value.length;offset+=65536){
          const chunk=value.subarray(offset,Math.min(offset+65536,value.length));
          const remaining=4_000_000-size,part=chunk.subarray(0,Math.max(0,remaining));
          size+=part.length;parser.write(decoder.decode(part,{stream:true}));
          if(metadata)return metadata;
          if(size>=4_000_000)return null;
        }
      }
    }finally{signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
  }catch{parent.throwIfAborted();return null;}
}
