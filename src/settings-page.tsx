import {Download,Info,LogOut,RefreshCw,Smartphone,UserRound} from 'lucide-react';
import {Brand,type Session} from './auth';
import {AppearanceSettings} from './appearance-settings';

type Props={session:Session;pending:number;updateReady:boolean;onSync:()=>void;onExport:()=>void;onUpdate:()=>void;onLogout:()=>void};
export function SettingsPage({session,pending,updateReady,onSync,onExport,onUpdate,onLogout}:Props){
  return <div className="settings-page">
    <section className="section settings-section">
      <h2 className="section-heading">{session.local?<Smartphone size={20}/>:<UserRound size={20}/>}アカウント・保存先</h2>
      <div className="account-details">
        {session.local?<span className="account-avatar"><Smartphone size={20}/></span>:session.user.avatarUrl?<img className="account-avatar" src={session.user.avatarUrl} referrerPolicy="no-referrer" alt="Googleアカウントのアイコン"/>:<span className="account-avatar" aria-hidden="true">{(session.user.name||session.user.email).slice(0,1)}</span>}
        <div><strong>{session.local?'この端末':session.user.name}</strong><p>{session.local?'このブラウザに保存':session.user.email}</p></div>
      </div>
      <p className="subtle">{session.local?'機種変更の前にデータを書き出してください。':pending?`${pending}件の変更を同期待ちです。`:'Googleアカウントごとに保存・同期します。'}</p>
      {!session.local&&<button className="settings-add-card" onClick={onSync}><RefreshCw size={18}/>今すぐ同期</button>}
    </section>
    <AppearanceSettings/>
    <section className="section settings-section">
      <h2 className="section-heading"><Download size={20}/>データ</h2>
      <button className="settings-add-card" onClick={onExport}><Download size={18}/>データを書き出す</button>
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
