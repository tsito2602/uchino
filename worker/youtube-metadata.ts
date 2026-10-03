import {abortable} from './import-ai';
import type {YouTubeVideo} from '../src/youtube';
import type {SourceDiagnostics} from '../src/import-model';
import {Parser} from 'htmlparser2';
import {youtubeStoryboard,type YouTubeStoryboard} from './youtube-storyboard';

export type YouTubeMetadata={title:string;description:string;seconds?:number;storyboard?:YouTubeStoryboard};
type ObjectValue=Record<string,unknown>;
const object=(value:unknown):ObjectValue=>value&&typeof value==='object'&&!Array.isArray(value)?value as ObjectValue:{};
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
function richText(value:unknown):string|undefined {
  const data=object(value);
  if(typeof data.content==='string')return data.content;
  if(typeof data.simpleText==='string')return data.simpleText;
  if(Array.isArray(data.runs)&&data.runs.every(run=>typeof object(run).text==='string'))return data.runs.map(run=>object(run).text).join('');
}
function playerMetadata(value:unknown,id:string):YouTubeMetadata|null {
  const data=object(value),details=object(data.videoDetails),microformat=object(object(data.microformat).playerMicroformatRenderer);
  const description=typeof details.shortDescription==='string'?details.shortDescription:richText(microformat.description);
  if(details.videoId!==id||typeof details.title!=='string'||description===undefined)return null;
  const seconds=Number(details.lengthSeconds),storyboard=youtubeStoryboard(object(object(data.storyboards).playerStoryboardSpecRenderer).spec,id);
  return {title:details.title.slice(0,200),description:description.slice(0,20000),...(storyboard?{storyboard}:{}),...(Number.isInteger(seconds)&&seconds>0?{seconds}:{})};
}
function pageMetadata(value:unknown,id:string):YouTubeMetadata|null {
  const data=object(value);
  // Never recursively search recommendations/comments for an unrelated description.
  if(object(object(data.currentVideoEndpoint).watchEndpoint).videoId!==id)return null;
  const watch=object(object(data.contents).twoColumnWatchNextResults);
  const contents=list(object(object(watch.results).results).contents).map(object);
  let title=richText(object(contents.find(item=>item.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer).title);
  const secondary=object(contents.find(item=>item.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer);
  let description=richText(secondary.attributedDescription)??richText(secondary.description);
  for(const panel of list(data.engagementPanels)){
    const renderer=object(object(object(panel).engagementPanelSectionListRenderer).content);
    const items=list(object(renderer.structuredDescriptionContentRenderer).items).map(object);
    title??=richText(object(items.find(item=>item.videoDescriptionHeaderRenderer)?.videoDescriptionHeaderRenderer).title);
    const body=object(items.find(item=>item.expandableVideoDescriptionBodyRenderer)?.expandableVideoDescriptionBodyRenderer);
    description??=richText(body.attributedDescriptionBodyText)??richText(body.descriptionBodyText);
  }
  return title&&description!==undefined?{title:title.slice(0,200),description:description.slice(0,20000)}:null;
}

// Parse JSON values without executing the page's JavaScript. Support both legacy
// assignments and the application/json script elements used by current pages.
function* assignedData(script:string):Generator<{kind:'player'|'page';value:unknown}> {
  const pattern=/(?:\b(ytInitialPlayerResponse|ytInitialData)\s*=|["'](ytInitialPlayerResponse|ytInitialData)["']\s*\]?\s*[:=])\s*\{/g;
  for(const match of script.matchAll(pattern)){
    const start=match.index!+match[0].lastIndexOf('{');let depth=0,quoted=false,escaped=false;
    for(let i=start;i<script.length;i++){
      const char=script[i];
      if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
      if(char==='"'){quoted=true;continue;}
      if(char==='{')depth++;
      if(char==='}'&&--depth===0){
        try{yield {kind:(match[1]||match[2])==='ytInitialData'?'page':'player',value:JSON.parse(script.slice(start,i+1))};}catch{/* Ignore malformed page data. */}
        break;
      }
    }
  }
}
function scriptMetadata(script:string,id:string,scriptId='',found?:(kind:'player'|'page')=>void):YouTubeMetadata|null {
  if(scriptId==='yt-initial-data'||scriptId==='yt-initial-player-response'){
    const kind=scriptId==='yt-initial-data'?'page':'player';found?.(kind);
    try{return kind==='page'?pageMetadata(JSON.parse(script),id):playerMetadata(JSON.parse(script),id);}catch{return null;}
  }
  for(const {kind,value} of assignedData(script)){
    found?.(kind);
    const result=kind==='page'?pageMetadata(value,id):playerMetadata(value,id);
    if(result)return result;
  }
  return null;
}
function metadataParser(id:string,onMetadata:(value:YouTubeMetadata)=>void,found?:(kind:'player'|'page')=>void,onOversized?:()=>void) {
  let script:string|null=null,scriptId='',scriptTooLarge=false;
  return new Parser({
    onopentag(name,attrs){if(name==='script'){script='';scriptId=attrs.id||'';scriptTooLarge=false;}},
    ontext(text){if(script!==null&&!scriptTooLarge){if(script.length+text.length>2_000_000){script='';scriptTooLarge=true;onOversized?.();}else script+=text;}},
    onclosetag(name){if(name==='script'){if(script&&!scriptTooLarge){const result=scriptMetadata(script,id,scriptId,found);if(result)onMetadata(result);}script=null;}},
  },{decodeEntities:false});
}
export function youtubeMetadata(html:string,id:string):YouTubeMetadata|null {
  let metadata:YouTubeMetadata|null=null;
  const parser=metadataParser(id,value=>{metadata??=value;});parser.end(html);
  return metadata;
}

export async function fetchYouTubeMetadata(video:YouTubeVideo,parent:AbortSignal,onFailure?:(diagnostics:SourceDiagnostics)=>void):Promise<YouTubeMetadata|null> {
  const signal=AbortSignal.any([parent,AbortSignal.timeout(10000)]);
  let httpStatus:number|undefined,bytes=0,playerDataFound=false,pageDataFound=false,scriptTooLarge=false;
  const fail=(code:SourceDiagnostics['code'])=>{onFailure?.({code,...(httpStatus?{httpStatus}:{}),bytes,playerDataFound,pageDataFound});return null;};
  try{
    signal.throwIfAborted();
    const response=await abortable(fetch(video.url,{redirect:'manual',signal,headers:{Accept:'text/html','User-Agent':'uchino recipe importer'}}),signal);
    httpStatus=response.status;
    if(!response.ok||!response.headers.get('content-type')?.includes('text/html')){
      await response.body?.cancel();return fail(response.status>=300&&response.status<400?'redirect':!response.ok?'http_error':'not_html');
    }
    const reader=response.body?.getReader();if(!reader)return fail('empty_response');
    const decoder=new TextDecoder();let metadata:YouTubeMetadata|null=null;
    const parser=metadataParser(video.id,value=>{metadata??=value;},kind=>{if(kind==='player')playerDataFound=true;else pageDataFound=true;},()=>{scriptTooLarge=true;});
    const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
    try{
      while(true){
        const {done,value}=await abortable(reader.read(),signal);signal.throwIfAborted();
        if(done){parser.end(decoder.decode());return metadata??fail(scriptTooLarge?'script_too_large':'metadata_missing');}
        for(let offset=0;offset<value.length;offset+=65536){
          const chunk=value.subarray(offset,Math.min(offset+65536,value.length));
          const remaining=4_000_000-bytes,part=chunk.subarray(0,Math.max(0,remaining));
          bytes+=part.length;parser.write(decoder.decode(part,{stream:true}));
          if(metadata)return metadata;
          if(bytes>=4_000_000)return fail('page_too_large');
        }
      }
    }finally{signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
  }catch{parent.throwIfAborted();return fail(signal.aborted?'timeout':'network_error');}
}
