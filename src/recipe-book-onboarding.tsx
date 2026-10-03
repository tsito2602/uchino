import {useEffect,useState} from 'react';
import {BookOpen,ChevronRight,KeyRound,Plus,LogOut} from 'lucide-react';
import {Brand,type Session} from './auth';
import {useSpaceControls} from './space-controls';
import type {SpacesController} from './use-spaces';
import {FloatingViewport} from './floating-viewport';
import {Dock} from './dock';
import './recipe-book-onboarding.css';

export function RecipeBookOnboarding({session,spaces}:{session:Session;spaces:SpacesController}){
 const [online,setOnline]=useState(navigator.onLine),[error,setError]=useState('');
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 const controls=useSpaceControls({controller:spaces,userId:session.user.id,disabled:!online,onSelect:async id=>{spaces.select(id);}});
 return <>
  <main className="shell book-onboarding">
   <Brand small/>
   <div className="book-onboarding-content">
    <BookOpen className="book-onboarding-symbol" size={40} strokeWidth={1.3} aria-hidden="true"/>
    <h1>レシピ帳をはじめよう</h1>
    <p>家族と使うレシピ帳を、ここから。</p>
    <div className="book-onboarding-choices">
     <button type="button" disabled={!online||controls.isOpen} onClick={event=>controls.openCreate(event.currentTarget)} aria-haspopup="dialog"><Plus size={23}/><span><strong>レシピ帳を作る</strong><small>新しく作って、家族を招待する</small></span><ChevronRight size={18}/></button>
     <button type="button" disabled={!online||controls.isOpen} onClick={event=>controls.openJoin(event.currentTarget)} aria-haspopup="dialog"><KeyRound size={23}/><span><strong>招待されたレシピ帳に参加する</strong><small>招待コードを入力して参加する</small></span><ChevronRight size={18}/></button>
    </div>
    {!online&&<p className="book-onboarding-status" role="status">作成・参加するにはインターネットに接続してください。</p>}
    {error&&<p className="form-error" role="alert">{error}</p>}
   </div>
   <button className="text-action book-onboarding-logout" onClick={()=>void session.logout().catch(cause=>setError(cause.message))}><LogOut size={16}/>ログアウト</button>
  </main>
  <FloatingViewport>{controls.panel}{controls.context&&<Dock tab="recipes" onTab={()=>{}} context={controls.context}/>}</FloatingViewport>
 </>;
}
