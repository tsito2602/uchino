import {imageMime,MAX_IMPORT_PHOTO_BYTES} from '../src/import-photo';
import {publicWebUrl} from './public-web-url';
import {pageRecipePhotos} from './recipe-page-photo';
export type PhotoFailure={code:'http_error'|'not_image'|'too_large'|'invalid_image'|'network_error'|'timeout'|'redirect_error';httpStatus?:number};
const warning='料理の写真を取得できませんでした。内容は取り込めています。必要なら写真を追加してください。';
function candidates(value:unknown):string[] {
  if(typeof value==='string')return [value];
  if(Array.isArray(value))return value.slice(0,4).flatMap(item=>typeof item==='string'?[item]:item&&typeof item==='object'?candidatesObject(item):[]);
  return value&&typeof value==='object'?candidatesObject(value):[];
}
function candidatesObject(value:object):string[]{
  const item=value as Record<string,unknown>;
  return [item.contentUrl,item.url].filter((v):v is string=>typeof v==='string');
}
export function recipeImageCandidates(html:string,image:unknown,source?:URL):string[]{
  const urls=candidates(image);
  for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){
    const attributes=new Map([...tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),m[2]??m[3]]));
    if(attributes.get('property')?.toLowerCase()==='og:image'||attributes.get('name')?.toLowerCase()==='og:image'){
      const content=attributes.get('content');if(content)urls.push(content);
    }
  }
  const metadata=urls.map(v=>v.replace(/&amp;/gi,'&').replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):'').trim()).filter(Boolean);
  const visible=pageRecipePhotos(html,metadata,source);
  // Once the displayed photo is known, do not fall back to a sharing thumbnail
  // with a different crop if its download fails.
  return [...new Set(visible.length?visible:metadata)].slice(0,4);
}
export async function importRecipePhoto(urls:string[],source:URL,parent?:AbortSignal,onFailure?:(failure:PhotoFailure)=>void):Promise<{photo?:string;warnings?:string[]}>{
  if(!urls.length)return {};
  const signal=AbortSignal.any([AbortSignal.timeout(12000),...(parent?[parent]:[])]);
  for(const candidate of urls){
    try{
      signal.throwIfAborted();let url=publicWebUrl(candidate,source);
      for(let redirects=0;redirects<3;redirects++){
        const response=await fetch(url,{redirect:'manual',signal,headers:{Accept:'image/jpeg,image/png,image/webp','User-Agent':'uchino recipe importer'}});
        if(response.status>=300&&response.status<400){
          const location=response.headers.get('Location');await response.body?.cancel();
          if(!location){onFailure?.({code:'redirect_error',httpStatus:response.status});break;}url=publicWebUrl(location,url);continue;
        }
        const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if(!response.ok||!['image/jpeg','image/png','image/webp'].includes(type||'')||Number(response.headers.get('content-length'))>MAX_IMPORT_PHOTO_BYTES){onFailure?.({code:!response.ok?'http_error':Number(response.headers.get('content-length'))>MAX_IMPORT_PHOTO_BYTES?'too_large':'not_image',httpStatus:response.status});await response.body?.cancel();break;}
        const reader=response.body?.getReader();if(!reader){onFailure?.({code:'invalid_image',httpStatus:response.status});break;}
        const chunks:Uint8Array[]=[];let size=0,complete=false;
        const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
        try{
          while(true){signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done){complete=true;break;}size+=value.length;if(size>MAX_IMPORT_PHOTO_BYTES){onFailure?.({code:'too_large',httpStatus:response.status});throw new Error('Photo too large');}chunks.push(value);}
        }finally{signal.removeEventListener('abort',cancel);if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
        const bytes=new Uint8Array(size);let offset=0;
        for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        if(imageMime(bytes)!==type){onFailure?.({code:'invalid_image',httpStatus:response.status});break;}
        let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        return {photo:`data:${type};base64,${btoa(binary)}`};
      }
    }catch{parent?.throwIfAborted();onFailure?.({code:signal.aborted?'timeout':'network_error'});if(signal.aborted)break;}
  }
  parent?.throwIfAborted();return {warnings:[warning]};
}
