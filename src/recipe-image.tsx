import {useEffect,useState,type ImgHTMLAttributes} from 'react';
import {photoReference} from './photo-ref';
import {loadRecipePhoto} from './photo-cache';

// One object URL per stored photo, shared by every <img> showing it. Page and
// photo transitions clone the outgoing DOM, so a URL must outlive the component
// that resolved it: revoking on unmount left the clone a broken-image glyph.
// Only the oldest URLs beyond the limit are released, well after any motion.
const LIMIT=160,urls=new Map<string,string>(),pending=new Map<string,Promise<string>>();
function resolvePhoto(src:string){
  const known=urls.get(src);if(known)return Promise.resolve(known);
  let request=pending.get(src);
  if(!request){
    request=loadRecipePhoto(src).then(blob=>{
      const url=URL.createObjectURL(blob);urls.set(src,url);
      for(const [key,old] of urls){if(urls.size<=LIMIT)break;urls.delete(key);window.setTimeout(()=>URL.revokeObjectURL(old),10000);}
      return url;
    }).finally(()=>pending.delete(src));
    pending.set(src,request);
  }
  return request;
}

export function RecipeImage({src='',...props}:ImgHTMLAttributes<HTMLImageElement>){
  const stored=!!photoReference(src);
  const [resolved,setResolved]=useState<{source:string;url:string}|undefined>(()=>{const url=urls.get(src);return url?{source:src,url}:undefined;});
  useEffect(()=>{
    if(!stored||urls.has(src)&&resolved?.source===src)return;
    let active=true;
    void resolvePhoto(src).then(url=>{if(active)setResolved({source:src,url});},()=>{if(active)setResolved({source:src,url:src});});
    return()=>{active=false;};
  },[src,stored]);// eslint-disable-line react-hooks/exhaustive-deps
  return <img {...props} src={stored?(resolved?.source===src?resolved.url:undefined):src}/>;
}
