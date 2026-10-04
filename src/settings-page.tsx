import {HapticTouch} from './haptic-touch';
import {haptic} from './haptics';
import {SegmentSelection} from './segment-selection';
import {UsersRound,ChevronRight} from 'lucide-react';
import {Database,Info,LogOut,RefreshCw,Smartphone,Sparkles,UserRound} from 'lucide-react';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Check} from 'lucide-react';
import type {DataMode} from './data-mode';
import {Brand,type Session} from './auth';
import {AppearanceSettings} from './appearance-settings';

type Props={onSpaceSettings:()=>void;session:Session;pending:number;updateReady:boolean;dataMode:DataMode;changingData:boolean;onDataMode:(mode:DataMode)=>void;onSync:()=>Promise<void>;onUpdate:()=>void;onLogout:()=>void};
export function SettingsPage({onSpaceSettings,session,pending,updateReady,dataMode,changingData,onDataMode,onSync,onUpdate,onLogout}:Props){
  // Like the appearance switch, the face moves the moment it is tapped; the
  // data swaps underneath it (see SegmentSelection's memory).
  const [target,setTarget]=useState(dataMode);
  useEffect(()=>{if(!changingData)setTarget(dataMode);},[changingData,dataMode]);
  const choose=(mode:DataMode)=>{if(target===mode||changingData)return;haptic();setTarget(mode);onDataMode(mode);};
  return <div className="settings-page">
    <section className="section settings-section">
      <h2 className="section-heading">{session.local?<Smartphone size={20}/>:<UserRound size={20}/>}アカウント・保存先</h2>
      <div className="account-details">
        {session.local?<span className="account-avatar"><Smartphone size={20}/></span>:session.user.avatarUrl?<img className="account-avatar" src={session.user.avatarUrl} referrerPolicy="no-referrer" alt="Googleアカウントのアイコン"/>:<span className="account-avatar" aria-hidden="true">{(session.user.name||session.user.email).slice(0,1)}</span>}
        <div><strong>{session.local?'この端末':session.user.name}</strong><p>{session.local?'このブラウザに保存':session.user.email}</p></div>
      </div>
      <p className="subtle">{session.local?'このブラウザだけに保存しています。':pending?`${pending}件の変更を同期待ちです。`:'選択中のレシピ帳に保存・同期します。'}</p>
      {!session.local&&<SyncButton onSync={onSync}/>}
    </section>
    {!session.local&&<section className="section settings-section"><h2 className="section-heading"><UsersRound size={20}/>レシピ帳</h2><button className="settings-add-card" onClick={onSpaceSettings}><UsersRound size={18}/>レシピ帳の設定<ChevronRight size={18}/></button></section>}
    <AppearanceSettings/>
    <section className="section settings-section">
      <h2 className="section-heading"><Database size={20} aria-hidden="true"/>表示するデータ</h2>
      <div className="appearance-control data-mode-control" role="group" aria-label="表示するデータ" style={{'--appearance-index':target==='demo'?1:0} as CSSProperties}>
        <SegmentSelection index={target==='demo'?1:0} memory="data-mode"/>
        <button type="button" aria-pressed={target==='real'} onClick={()=>choose('real')}>{target!=='real'&&<HapticTouch/>}<Database size={20} aria-hidden="true"/>実データ</button>
        <button type="button" aria-pressed={target==='demo'} onClick={()=>choose('demo')}>{target!=='demo'&&<HapticTouch/>}<Sparkles size={20} aria-hidden="true"/>デモデータ</button>
      </div>
      <p className="subtle">{dataMode==='demo'?'写真付きのサンプルで試せます。デモでの編集や買い物メモは実データと別に、この端末に保存します。':'自分で保存したレシピと買い物メモを表示します。デモと切り替えても、それぞれのデータは残ります。'}</p>
    </section>
    <section className="section settings-section app-update-settings">
      <h2 className="section-heading"><Info size={20}/>アプリ</h2>
      <button className="settings-add-card" disabled={pending>0} onClick={onUpdate}><RefreshCw size={18}/>{updateReady?'更新して再読み込み':'更新を確認'}</button>
      {pending>0&&<p className="subtle">変更の同期が終わると更新できます。</p>}
    </section>
    <button className="settings-add-card settings-logout" onClick={onLogout}><LogOut size={17}/>{session.local?'ログイン画面に戻る':'ログアウト'}</button>
    <footer className="settings-app-info"><Brand small/><small>バージョン 0.1.0 · staging</small></footer>
  </div>;
}

// Syncing fills the button like the import liquid; when it lands the arrows
// become a drawn check, then the button settles back.
function SyncButton({onSync}:{onSync:()=>Promise<void>}){
  const [state,setState]=useState<'idle'|'syncing'|'done'>('idle'),fill=useRef<HTMLSpanElement>(null),alive=useRef(true);
  useEffect(()=>()=>{alive.current=false;},[]);
  useEffect(()=>{if(state!=='done')return;const timer=setTimeout(()=>setState('idle'),1800);return()=>clearTimeout(timer);},[state]);
  async function sync(){
    if(state==='syncing')return;
    setState('syncing');
    const node=fill.current,reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rising=reduced?undefined:node?.animate?.([{transform:'scaleX(0)'},{transform:'scaleX(.82)'}],{duration:1400,easing:'cubic-bezier(.3,.6,.3,1)',fill:'forwards'});
    const started=performance.now();
    try{
      await onSync();
      // A very quick sync still shows the fill reaching the end.
      await new Promise(resolve=>setTimeout(resolve,Math.max(0,520-(performance.now()-started))));
      if(!alive.current)return;
      const at=rising?Number(getComputedStyle(node!).transform.split(',')[0]?.replace('matrix(','')||0):1;
      rising?.cancel();
      if(!reduced)node?.animate?.([{transform:`scaleX(${at})`},{transform:'scaleX(1)',opacity:1},{transform:'scaleX(1)',opacity:0}],{duration:1600,easing:'cubic-bezier(.22,.72,.18,1)'});
      setState('done');
    }catch{rising?.cancel();if(alive.current)setState('idle');}
  }
  return <button className="settings-add-card sync-button" data-state={state} aria-busy={state==='syncing'||undefined} onClick={()=>void sync()}>
    <span ref={fill} className="sync-button-fill" aria-hidden="true"/>
    {state==='done'?<Check className="sync-button-check" size={18}/>:<RefreshCw className="sync-button-arrows" size={18}/>}
    <span>{state==='syncing'?'同期しています':state==='done'?'同期しました':'今すぐ同期'}</span>
  </button>;
}
