import {UsersRound,ChevronRight} from 'lucide-react';
import {Database,Info,LogOut,RefreshCw,Smartphone,Sparkles,UserRound} from 'lucide-react';
import type {CSSProperties} from 'react';
import type {DataMode} from './data-mode';
import {Brand,type Session} from './auth';
import {AppearanceSettings} from './appearance-settings';

type Props={onSpaceSettings:()=>void;session:Session;pending:number;updateReady:boolean;dataMode:DataMode;changingData:boolean;onDataMode:(mode:DataMode)=>void;onSync:()=>void;onUpdate:()=>void;onLogout:()=>void};
export function SettingsPage({onSpaceSettings,session,pending,updateReady,dataMode,changingData,onDataMode,onSync,onUpdate,onLogout}:Props){
  return <div className="settings-page">
    <section className="section settings-section">
      <h2 className="section-heading">{session.local?<Smartphone size={20}/>:<UserRound size={20}/>}アカウント・保存先</h2>
      <div className="account-details">
        {session.local?<span className="account-avatar"><Smartphone size={20}/></span>:session.user.avatarUrl?<img className="account-avatar" src={session.user.avatarUrl} referrerPolicy="no-referrer" alt="Googleアカウントのアイコン"/>:<span className="account-avatar" aria-hidden="true">{(session.user.name||session.user.email).slice(0,1)}</span>}
        <div><strong>{session.local?'この端末':session.user.name}</strong><p>{session.local?'このブラウザに保存':session.user.email}</p></div>
      </div>
      <p className="subtle">{session.local?'このブラウザだけに保存しています。':pending?`${pending}件の変更を同期待ちです。`:'選択中のレシピ帳に保存・同期します。'}</p>
      {!session.local&&<button className="settings-add-card" onClick={onSync}><RefreshCw size={18}/>今すぐ同期</button>}
    </section>
    {!session.local&&<section className="section settings-section"><h2 className="section-heading"><UsersRound size={20}/>レシピ帳</h2><button className="settings-add-card" onClick={onSpaceSettings}><UsersRound size={18}/>レシピ帳の設定<ChevronRight size={18}/></button></section>}
    <AppearanceSettings/>
    <section className="section settings-section">
      <h2 className="section-heading"><Database size={20} aria-hidden="true"/>表示するデータ</h2>
      <div className="appearance-control data-mode-control" role="group" aria-label="表示するデータ" style={{'--appearance-index':dataMode==='demo'?1:0} as CSSProperties}>
        <span className="appearance-selection" aria-hidden="true"/>
        <button type="button" aria-pressed={dataMode==='real'} disabled={changingData} onClick={()=>onDataMode('real')}><Database size={20} aria-hidden="true"/>実データ</button>
        <button type="button" aria-pressed={dataMode==='demo'} disabled={changingData} onClick={()=>onDataMode('demo')}><Sparkles size={20} aria-hidden="true"/>デモデータ</button>
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
