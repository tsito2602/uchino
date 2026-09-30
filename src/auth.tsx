import {useEffect,useState,type ReactNode} from 'react';
import {Smartphone} from 'lucide-react';
export type User={id:string;email:string;name:string;avatarUrl?:string};
export type Session={user:User;local:boolean;logout:()=>Promise<void>};
export function Brand({small=false}:{small?:boolean}){return <div className={`uchino-brand${small?' small':''}`}><img src="/icon.svg" alt="うと鍋のアイコン"/><span>uchino</span></div>;}
export function AuthGate({children}:{children:(session:Session)=>ReactNode}){
  const [user,setUser]=useState<User|null>(null),[local,setLocal]=useState(false),[loading,setLoading]=useState(true),[configured,setConfigured]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();
    void fetch('/api/auth/session',{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])}).then(async response=>{if(!response.ok)throw new Error();const session=await response.json() as {configured:boolean;user:User|null};setConfigured(session.configured);setUser(session.user);if(session.user)localStorage.setItem('uchino-last-user',JSON.stringify(session.user));else setLocal(localStorage.getItem('uchino-device-mode')==='true');}).catch(()=>{if(controller.signal.aborted)return;try{const cached=localStorage.getItem('uchino-last-user');if(!navigator.onLine&&cached)setUser(JSON.parse(cached));else setLocal(localStorage.getItem('uchino-device-mode')==='true');}catch{}setError('通信を確認してください。端末に保存したレシピはオフラインでも使えます。');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    const reason=new URL(location.href).searchParams.get('auth_error');if(reason){setError(reason==='not_allowed'?'このアカウントには利用権限がありません。':'ログインできませんでした。もう一度お試しください。');history.replaceState(null,'','/');}
    return()=>controller.abort();
  },[]);
  async function logout(){if(user){const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error('ログアウトできませんでした。');}localStorage.removeItem('uchino-last-user');localStorage.removeItem('uchino-device-mode');setUser(null);setLocal(false);}
  if(loading)return <main className="login"><Brand/><p className="login-status" role="status">読み込んでいます…</p></main>;
  if(user||local)return <>{children({user:user??{id:'guest',email:'',name:'この端末'},local:!user,logout})}</>;
  return <main className="login"><div className="login-panel"><Brand/><div className="login-actions"><button className="google-sign-in" disabled={!configured} onClick={()=>location.assign('/api/auth/google')}><span className="google-letter" aria-hidden="true">G</span>Googleでログイン</button><button className="secondary device-login" onClick={()=>{try{localStorage.setItem('uchino-device-mode','true');setLocal(true);}catch{setError('ブラウザの保存設定を確認してください。');}}}><Smartphone size={18}/>この端末で使う</button><p className="login-status">端末に保存して、すぐに使えます。</p>{!configured&&<p className="login-status">Googleログインは準備中です。</p>}{error&&<p className="login-error" role="alert">{error}</p>}</div></div></main>;
}
