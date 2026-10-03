import {abortable} from './import-ai';
import type {YouTubeVideo} from '../src/youtube';
import type {SourceDiagnostics,StoryboardDiagnostics} from '../src/import-model';
import {Parser} from 'htmlparser2';
import {youtubeStoryboard,type YouTubeStoryboard} from './youtube-storyboard';

export type YouTubeMetadata={title:string;description:string;seconds?:number;storyboard?:YouTubeStoryboard};
export type YouTubeSource={metadata:YouTubeMetadata|null;storyboard?:YouTubeStoryboard;seconds?:number;sourceDiagnostics?:SourceDiagnostics;storyboardDiagnostics?:StoryboardDiagnostics};
type PlayerClient={clientName:'WEB';clientVersion:string;hl?:string;gl?:string};
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
function jsonValue(script:string,start:number):unknown {
  const string=script[start]==='"';let depth=0,quoted=false,escaped=false;
  for(let i=start;i<script.length;i++){
    const char=script[i];
    if(quoted){
      if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"'){
        quoted=false;if(string)return JSON.parse(script.slice(start,i+1));
      }continue;
    }
    if(char==='"'){quoted=true;continue;}
    if(char==='{')depth++;
    if(char==='}'&&--depth===0)return JSON.parse(script.slice(start,i+1));
  }
}
type PageItem={kind:'player'|'page'|'config';value:unknown};
function* assignedData(script:string):Generator<PageItem> {
  const pattern=/(?:\b(ytInitialPlayerResponse|ytInitialData|bootstrapPlayerResponse|raw_player_response|player_response)\s*[:=]|["'](ytInitialPlayerResponse|ytInitialData|raw_player_response|player_response)["']\s*\]?\s*[:=])\s*(?=[{"])/g;
  for(const match of script.matchAll(pattern)){
    try{yield {kind:(match[1]||match[2])==='ytInitialData'?'page':'player',value:jsonValue(script,match.index!+match[0].length)};}catch{/* Ignore malformed page data. */}
  }
  for(const match of script.matchAll(/\bytcfg\.set\s*\(\s*(?=\{)/g)){
    try{yield {kind:'config',value:jsonValue(script,match.index!+match[0].length)};}catch{/* Not a JSON config object. */}
  }
}
function scriptMetadata(script:string,scriptId:string,read:(item:PageItem)=>void) {
  if(scriptId==='yt-initial-data'||scriptId==='yt-initial-player-response'){
    const kind=scriptId==='yt-initial-data'?'page':'player';
    try{read({kind,value:JSON.parse(script)});}catch{/* Ignore malformed page data. */}return;
  }
  for(const item of assignedData(script))read(item);
}
function metadataParser(read:(item:PageItem)=>void,onOversized?:()=>void) {
  let script:string|null=null,scriptId='',scriptTooLarge=false;
  return new Parser({
    onopentag(name,attrs){if(name==='script'){script='';scriptId=attrs.id||'';scriptTooLarge=false;}},
    ontext(text){if(script!==null&&!scriptTooLarge){if(script.length+text.length>2_000_000){script='';scriptTooLarge=true;onOversized?.();}else script+=text;}},
    onclosetag(name){if(name==='script'){if(script&&!scriptTooLarge){scriptMetadata(script,scriptId,read);}script=null;}},
  },{decodeEntities:false});
}
function metadataCollector(id:string){
  let data:Partial<YouTubeMetadata>={};
  const state:{playerDataFound:boolean;pageDataFound:boolean;specFound:boolean;playabilityStatus?:StoryboardDiagnostics['playabilityStatus'];client?:PlayerClient}={playerDataFound:false,pageDataFound:false,specFound:false};
  const accept=({kind,value}:PageItem)=>{
    if(kind==='config'){
      const config=object(value),client=object(object(config.INNERTUBE_CONTEXT).client);
      // Use only the public WEB client advertised by this page. Never forward
      // visitor IDs, cookies, access tokens, signatures or arbitrary endpoints.
      if(client.clientName==='WEB'&&typeof client.clientVersion==='string'&&/^[\w.-]{1,100}$/.test(client.clientVersion)){
        state.client={clientName:'WEB',clientVersion:client.clientVersion,...(typeof client.hl==='string'&&/^[a-zA-Z-]{2,20}$/.test(client.hl)?{hl:client.hl}:{}),...(typeof client.gl==='string'&&/^[A-Z]{2}$/.test(client.gl)?{gl:client.gl}:{})};
      }return;
    }
    if(typeof value==='string'){try{value=JSON.parse(value);}catch{return;}}
    if(kind==='player'){
      const player=object(value),videoId=object(player.videoDetails).videoId;
      if(videoId!==undefined&&videoId!==id)return;
      state.playerDataFound=true;
      const status=object(player.playabilityStatus).status;
      if(typeof status==='string')state.playabilityStatus=(['OK','ERROR','UNPLAYABLE','LOGIN_REQUIRED','CONTENT_CHECK_REQUIRED','AGE_CHECK_REQUIRED','LIVE_STREAM_OFFLINE'].includes(status)?status:'UNKNOWN') as StoryboardDiagnostics['playabilityStatus'];
      const spec=object(object(player.storyboards).playerStoryboardSpecRenderer).spec;
      if(typeof spec==='string'&&spec.length)state.specFound=true;
    }else state.pageDataFound=true;
    data={...(kind==='page'?pageMetadata(value,id):playerMetadata(value,id)),...data};
  };
  return {state,accept,get(){return typeof data.title==='string'&&typeof data.description==='string'?data as YouTubeMetadata:null;},preview(){return {storyboard:data.storyboard,seconds:data.seconds};}};
}
export function youtubeMetadata(html:string,id:string):YouTubeMetadata|null {
  const collector=metadataCollector(id);metadataParser(collector.accept).end(html);return collector.get();
}

async function readYouTubeSource(video:YouTubeVideo,parent:AbortSignal,includeStoryboard:boolean):Promise<YouTubeSource> {
  const signal=AbortSignal.any([parent,AbortSignal.timeout(10000)]);
  const collector=metadataCollector(video.id),state=collector.state;
  let httpStatus:number|undefined,bytes=0,scriptTooLarge=false,pageError:SourceDiagnostics['code']|undefined;
  const readPage=async()=>{try{
    signal.throwIfAborted();
    const response=await abortable(fetch(video.url,{redirect:'manual',signal,headers:{Accept:'text/html','User-Agent':'uchino recipe importer'}}),signal);
    httpStatus=response.status;
    if(!response.ok||!response.headers.get('content-type')?.includes('text/html')){
      await response.body?.cancel();pageError=response.status>=300&&response.status<400?'redirect':!response.ok?'http_error':'not_html';return;
    }
    const reader=response.body?.getReader();if(!reader){pageError='empty_response';return;}
    const decoder=new TextDecoder();
    const parser=metadataParser(collector.accept,()=>{scriptTooLarge=true;});
    const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
    try{
      while(true){
        const {done,value}=await abortable(reader.read(),signal);signal.throwIfAborted();
        if(done){parser.end(decoder.decode());if(scriptTooLarge)pageError='script_too_large';return;}
        for(let offset=0;offset<value.length;offset+=65536){
          const chunk=value.subarray(offset,Math.min(offset+65536,value.length));
          const remaining=4_000_000-bytes,part=chunk.subarray(0,Math.max(0,remaining));
          bytes+=part.length;parser.write(decoder.decode(part,{stream:true}));
          const metadata=collector.get();
          if(metadata&&(!includeStoryboard||collector.preview().storyboard))return;
          if(bytes>=4_000_000){pageError='page_too_large';return;}
        }
      }
    }finally{signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
  }catch{parent.throwIfAborted();pageError=signal.aborted?'timeout':'network_error';}};
  await readPage();parent.throwIfAborted();
  const diagnostics=(stage:StoryboardDiagnostics['stage'],code?:StoryboardDiagnostics['code']):StoryboardDiagnostics=>({stage,code:code??(state.playabilityStatus&&state.playabilityStatus!=='OK'?'player_unavailable':state.specFound?'spec_unsupported':state.playerDataFound?'spec_missing':'player_missing'),...(httpStatus?{httpStatus}:{}),bytes,playerDataFound:state.playerDataFound,specFound:state.specFound,...(state.playabilityStatus?{playabilityStatus:state.playabilityStatus}:{})});
  const sourceDiagnostics:SourceDiagnostics|undefined=collector.get()?undefined:{code:pageError||'metadata_missing',...(httpStatus?{httpStatus}:{}),bytes,playerDataFound:state.playerDataFound,pageDataFound:state.pageDataFound};
  let storyboardDiagnostics=diagnostics('page',pageError);
  // Some watch pages defer the player response. Ask the regular public player
  // once using that page's WEB context; do not retry refusals with other clients.
  if(includeStoryboard&&!collector.preview().storyboard&&!pageError&&collector.get()&&state.client&&!state.specFound&&(!state.playabilityStatus||state.playabilityStatus==='OK')){
    const playerSignal=AbortSignal.any([parent,AbortSignal.timeout(8000)]);bytes=0;httpStatus=undefined;
    let playerError:StoryboardDiagnostics['code']|undefined;
    try{
      const response=await abortable(fetch('https://www.youtube.com/youtubei/v1/player',{method:'POST',redirect:'manual',signal:playerSignal,headers:{'Content-Type':'application/json',Accept:'application/json','User-Agent':'uchino recipe importer'},body:JSON.stringify({context:{client:state.client},videoId:video.id})}),playerSignal);
      httpStatus=response.status;
      if(!response.ok){playerError=response.status>=300&&response.status<400?'redirect':'http_error';await response.body?.cancel();}
      else if(!response.headers.get('content-type')?.includes('application/json')){playerError='invalid_response';await response.body?.cancel();}
      else{
        const reader=response.body?.getReader();
        if(!reader)playerError='empty_response';
        else{
          const decoder=new TextDecoder();let text='';
          try{
            while(true){
              const {done,value}=await abortable(reader.read(),playerSignal);playerSignal.throwIfAborted();
              if(done){text+=decoder.decode();break;}
              bytes+=value.length;if(bytes>2_000_000){playerError='page_too_large';break;}
              text+=decoder.decode(value,{stream:true});
            }
            if(!playerError){
              try{
                const player=JSON.parse(text);
                const id=object(object(player).videoDetails).videoId,playability=object(object(player).playabilityStatus).status;
                if(id!==video.id&&!(id===undefined&&typeof playability==='string'&&playability!=='OK'))playerError='invalid_response';
                else collector.accept({kind:'player',value:player});
              }catch{playerError='invalid_response';}
            }
          }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        }
      }
    }catch{parent.throwIfAborted();playerError=playerSignal.aborted?'timeout':'network_error';}
    storyboardDiagnostics=diagnostics('player',playerError);
  }
  return {metadata:collector.get(),...collector.preview(),...(sourceDiagnostics?{sourceDiagnostics}:{}),...(includeStoryboard&&!collector.preview().storyboard?{storyboardDiagnostics}:{})};
}

export function fetchYouTubeSource(video:YouTubeVideo,parent:AbortSignal):Promise<YouTubeSource>{return readYouTubeSource(video,parent,true);}
export async function fetchYouTubeMetadata(video:YouTubeVideo,parent:AbortSignal,onFailure?:(diagnostics:SourceDiagnostics)=>void,includeStoryboard=false):Promise<YouTubeMetadata|null>{
  const source=await readYouTubeSource(video,parent,includeStoryboard);
  if(source.sourceDiagnostics)onFailure?.(source.sourceDiagnostics);return source.metadata;
}
