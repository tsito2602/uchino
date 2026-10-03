import {useCallback,useEffect,useState} from 'react';
import type {Session} from './auth';
import {type RecipeSpace} from './spaces';

export function useSpaces(session:Session){
  const userId=session.user.id,cacheKey=`uchino-spaces-${userId}`,selectionKey=`uchino-space-${userId}`;
  const [spaces,setSpaces]=useState<RecipeSpace[]>(()=>{try{const value=JSON.parse(localStorage.getItem(cacheKey)||'[]');return Array.isArray(value)?value:[];}catch{return [];}});
  const [selectedId,setSelectedId]=useState(()=>{try{return localStorage.getItem(selectionKey)||'';}catch{return '';}});
  const [ready,setReady]=useState(session.local),[error,setError]=useState('');
  const api=useCallback(async<T,>(path:string,options:RequestInit={}):Promise<T>=>{
    const response=await fetch(`/api/spaces${path}`,{...options,cache:'no-store',headers:{'Content-Type':'application/json','X-Uchino-User':userId,...options.headers},signal:AbortSignal.timeout(15000)});
    const result=await response.json().catch(()=>null) as {error?:string}|null;
    if(!response.ok)throw new Error(result?.error||'スペースを取得できませんでした。');
    return result as T;
  },[userId]);
  const refresh=useCallback(async()=>{
    if(session.local)return;
    try{
      const result=await api<{spaces:RecipeSpace[]}>('');
      if(!Array.isArray(result.spaces))throw new Error('スペースを確認できませんでした。');
      setSpaces(result.spaces);setError('');
      try{localStorage.setItem(cacheKey,JSON.stringify(result.spaces));}catch{}
    }catch(cause){setError(cause instanceof Error?cause.message:'スペースを取得できませんでした。');throw cause;}
    finally{setReady(true);}
  },[session.local,api,userId,cacheKey]);
  useEffect(()=>{let active=true;const load=()=>{if(active)void refresh().catch(()=>{});};load();window.addEventListener('online',load);window.addEventListener('focus',load);window.addEventListener('uchino:spaces-refresh',load);const timer=setInterval(load,30000);return()=>{active=false;clearInterval(timer);window.removeEventListener('online',load);window.removeEventListener('focus',load);window.removeEventListener('uchino:spaces-refresh',load);};},[refresh]);
  const select=(id:string)=>{setSelectedId(id);try{localStorage.setItem(selectionKey,id);}catch{}};
  const space=spaces.find(s=>s.id===selectedId)??spaces.find(s=>s.is_home&&s.owner_id===userId)??spaces[0];
  return {spaces,space,ready,error,refresh,select,api};
}
export type SpacesController=ReturnType<typeof useSpaces>;
