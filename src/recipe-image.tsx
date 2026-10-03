import {useEffect,useState,type ImgHTMLAttributes} from 'react';
import {photoReference} from './photo-ref';
import {loadRecipePhoto} from './photo-cache';

export function RecipeImage({src='',...props}:ImgHTMLAttributes<HTMLImageElement>){
  const [resolved,setResolved]=useState<{source:string;url:string}>();
  const stored=!!photoReference(src);
  useEffect(()=>{
    if(!stored)return;
    let active=true,url='';
    void loadRecipePhoto(src).then(blob=>{
      if(active){url=URL.createObjectURL(blob);setResolved({source:src,url});}
    }).catch(()=>{if(active)setResolved({source:src,url:src});});
    return()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[src,stored]);
  return <img {...props} src={stored?(resolved?.source===src?resolved.url:undefined):src}/>;
}
