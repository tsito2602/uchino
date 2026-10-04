import {useEffect,useRef,useState} from 'react';

type Active={name:string;activity:string};
// While a shared book is open, report whether this member is shopping and
// learn whether the partner is, so either can see the other at the store.
export function usePartnerPresence({enabled,api,spaceId,shopping}:{enabled:boolean;api:<T>(path:string,options?:RequestInit)=>Promise<T>;spaceId?:string;shopping:boolean}){
  const [active,setActive]=useState<Active[]>([]);
  const state=useRef({shopping,spaceId});state.current={shopping,spaceId};
  useEffect(()=>{
    if(!enabled||!spaceId){setActive([]);return;}
    let alive=true;
    const report=()=>{
      if(document.visibilityState!=='visible'||!navigator.onLine)return;
      void api<{active:Active[]}>(`/${encodeURIComponent(spaceId)}/presence`,{method:'POST',body:JSON.stringify({activity:state.current.shopping?'shopping':''})})
        .then(result=>{if(alive)setActive(result.active.filter(a=>a.activity==='shopping'));}).catch(()=>{});
    };
    report();const timer=setInterval(report,6000);document.addEventListener('visibilitychange',report);
    return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',report);};
  },[enabled,spaceId,shopping,api]);
  // Leaving the list (or the app) clears this member's mark right away.
  useEffect(()=>{
    if(!enabled||!spaceId||!shopping)return;
    const leave=()=>{if(document.visibilityState==='hidden')void api(`/${encodeURIComponent(spaceId)}/presence`,{method:'POST',body:'{}',keepalive:true}).catch(()=>{});};
    document.addEventListener('visibilitychange',leave);
    return()=>{document.removeEventListener('visibilitychange',leave);void api(`/${encodeURIComponent(spaceId)}/presence`,{method:'POST',body:'{}'}).catch(()=>{});};
  },[enabled,spaceId,shopping,api]);
  return active;
}

export function PartnerPresence({active}:{active:Active[]}){
  if(!active.length)return null;
  const names=active.map(a=>`${a.name}さん`).join('と');
  return <div className="partner-presence" role="status"><span className="partner-presence-dot" aria-hidden="true"/><span>{names}が買い物中</span></div>;
}
