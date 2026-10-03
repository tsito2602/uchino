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
function playerMetadata(value:unknown,id:string):Partial<YouTubeMetadata> {
  const data=object(value),details=object(data.videoDetails),microformat=object(object(data.microformat).playerMicroformatRenderer);
  if(details.videoId!==undefined&&details.videoId!==id)return {};
  // Preview URLs carry the exact video ID even when this player omits its text.
  const storyboard=youtubeStoryboard(object(object(data.storyboards).playerStoryboardSpecRenderer).spec,id);
  const description=typeof details.shortDescription==='string'?details.shortDescription:richText(microformat.description);
  const seconds=Number(details.lengthSeconds);
  return {...(details.videoId===id&&typeof details.title==='string'&&description!==undefined?{title:details.title.slice(0,200),description:description.slice(0,20000)}:{}),...(storyboard?{storyboard}:{}),...(details.videoId===id&&Number.isInteger(seconds)&&seconds>0?{seconds}:{})};
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
function scriptMetadata(script:string,id:string,scriptId:string,accept:(value:Partial<YouTubeMetadata>)=>void,found?:(kind:'player'|'page')=>void) {
  const read=(kind:'player'|'page',value:unknown)=>{found?.(kind);accept((kind==='page'?pageMetadata(value,id):playerMetadata(value,id))||{});};
  if(scriptId==='yt-initial-data'||scriptId==='yt-initial-player-response'){
    const kind=scriptId==='yt-initial-data'?'page':'player';
    try{read(kind,JSON.parse(script));}catch{/* Ignore malformed page data. */}return;
  }
  for(const {kind,value} of assignedData(script))read(kind,value);
}
function metadataParser(id:string,onMetadata:(value:Partial<YouTubeMetadata>)=>void,found?:(kind:'player'|'page')=>void,onOversized?:()=>void) {
  let script:string|null=null,scriptId='',scriptTooLarge=false;
  return new Parser({
    onopentag(name,attrs){if(name==='script'){script='';scriptId=attrs.id||'';scriptTooLarge=false;}},
    ontext(text){if(script!==null&&!scriptTooLarge){if(script.length+text.length>2_000_000){script='';scriptTooLarge=true;onOversized?.();}else script+=text;}},
    onclosetag(name){if(name==='script'){if(script&&!scriptTooLarge){scriptMetadata(script,id,scriptId,onMetadata,found);}script=null;}},
  },{decodeEntities:false});
}
function metadataCollector(){
  let data:Partial<YouTubeMetadata>={};
  return {accept(value:Partial<YouTubeMetadata>){data={...value,...data};},get(){return typeof data.title==='string'&&typeof data.description==='string'?data as YouTubeMetadata:null;}};
}
export function youtubeMetadata(html:string,id:string):YouTubeMetadata|null {
  const collector=metadataCollector();metadataParser(id,collector.accept).end(html);return collector.get();
}

export async function fetchYouTubeMetadata(video:YouTubeVideo,parent:AbortSignal,onFailure?:(diagnostics:SourceDiagnostics)=>void,includeStoryboard=false):Promise<YouTubeMetadata|null> {
  const signal=AbortSignal.any([parent,AbortSignal.timeout(10000)]);
  const collector=metadataCollector();
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
    const decoder=new TextDecoder();let previewDeadline:AbortSignal|undefined;
    const parser=metadataParser(video.id,collector.accept,kind=>{if(kind==='player')playerDataFound=true;else pageDataFound=true;},()=>{scriptTooLarge=true;});
    const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
    try{
      while(true){
        const {done,value}=await abortable(reader.read(),previewDeadline?AbortSignal.any([signal,previewDeadline]):signal);signal.throwIfAborted();
        if(done){parser.end(decoder.decode());return collector.get()??fail(scriptTooLarge?'script_too_large':'metadata_missing');}
        for(let offset=0;offset<value.length;offset+=65536){
          const chunk=value.subarray(offset,Math.min(offset+65536,value.length));
          const remaining=4_000_000-bytes,part=chunk.subarray(0,Math.max(0,remaining));
          bytes+=part.length;parser.write(decoder.decode(part,{stream:true}));
          const metadata=collector.get();
          if(metadata&&(!includeStoryboard||metadata.storyboard))return metadata;
          if(metadata)previewDeadline??=AbortSignal.timeout(2500);
          if(bytes>=4_000_000)return metadata??fail('page_too_large');
        }
      }
    }finally{signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
  }catch{parent.throwIfAborted();return collector.get()??fail(signal.aborted?'timeout':'network_error');}
}
