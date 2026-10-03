import {useEffect,useState} from 'react';
import type {SpacesController} from './use-spaces';
import type {SpaceMember} from './spaces';

// Members label who added each recipe. A solo book needs no marks, so it skips the request.
export function useSpaceMembers(controller:SpacesController,local:boolean):SpaceMember[]{
  const {space,api}=controller,id=space?.id??'',shared=!local&&(space?.member_count??1)>1,cacheKey=`uchino-members-${id}`;
  const [members,setMembers]=useState<SpaceMember[]>(()=>{try{const value=JSON.parse(localStorage.getItem(cacheKey)||'[]');return Array.isArray(value)?value:[];}catch{return [];}});
  useEffect(()=>{
    if(!shared){setMembers([]);return;}
    let active=true;
    void api<{members:SpaceMember[]}>(`/${id}/details`).then(data=>{if(!active||!Array.isArray(data.members))return;setMembers(data.members);try{localStorage.setItem(cacheKey,JSON.stringify(data.members));}catch{}}).catch(()=>{});
    return()=>{active=false;};
  },[api,id,shared,space?.member_count,cacheKey]);
  return shared?members:[];
}
