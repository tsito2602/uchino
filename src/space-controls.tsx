import {useRef,useState} from 'react';
import {UsersRound,UserRoundPlus,Plus,KeyRound,Settings,Check,Copy,Share2,RefreshCw,LogOut,Trash2} from 'lucide-react';
import {SpaceDialog} from './space-dialog';
import {Panel} from './panel';
import {panelOrigin,type PanelOrigin} from './use-panel-morph';
import type {DockContext} from './dock';
import type {SpacesController} from './use-spaces';
import {invitationText,type RecipeSpace,type SpaceMember,type SpaceInvite,type InvitePreview} from './spaces';

type View='menu'|'create'|'join'|'settings'|'invite';
export function useSpaceControls({controller,userId,disabled,onSelect}:{controller:SpacesController;userId:string;disabled:boolean;onSelect:(id:string)=>Promise<void>}){
  const {space,spaces,api,refresh}=controller;
  const [view,setView]=useState<View|null>(null),[closing,setClosing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [origin,setOrigin]=useState<PanelOrigin>();
  const [name,setName]=useState(''),[members,setMembers]=useState<SpaceMember[]>([]),[invite,setInvite]=useState<SpaceInvite|null>(null),[copied,setCopied]=useState(false);
  const [code,setCode]=useState(()=>{try{return sessionStorage.getItem('uchino-invite-code')||'';}catch{return '';}}),[preview,setPreview]=useState<InvitePreview|null>(null);
  const afterExit=useRef<()=>void>(()=>{}),inFlight=useRef(false);
  const owner=space?.owner_id===userId,blocked=busy||closing;
  const run=async(action:()=>Promise<void>)=>{if(inFlight.current||closing)return;inFlight.current=true;setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{inFlight.current=false;setBusy(false);}};
  // Opened straight from the recipe list, invite and join close back to it.
  const direct=useRef(false);
  const open=(next:View)=>{if(next==='menu'||next==='settings')direct.current=false;setError('');setClosing(false);setView(next);};
  const dismiss=(next:View|null=null,action?:()=>void)=>{if(inFlight.current)return;afterExit.current=()=>{setView(next);setClosing(false);setError('');action?.();};setClosing(true);};
  const transition=(next:View,action?:()=>void)=>dismiss(next,action);
  const loadMembers=async()=>{if(!space)return;const data=await api<{members:SpaceMember[]}>(`/${space.id}/details`);setMembers(data.members);};
  const openSettings=()=>{if(!space)return;setName(space.name);setMembers([]);open('settings');void run(loadMembers);};
  const back=()=>{if(blocked)return;if(view==='join'&&preview){setPreview(null);return;}dismiss(!space||view==='menu'||view==='settings'||direct.current?null:view==='invite'?'settings':'menu');};
  const inviteText=invite&&space?invitationText(space,invite,location.origin):'';
  const copy=()=>void run(async()=>{await navigator.clipboard.writeText(inviteText);setCopied(true);});
  const issueInvite=async()=>{if(!space)return;setInvite(await api<SpaceInvite>(`/${space.id}/invites`,{method:'POST',body:'{}'}));setCopied(false);};
  const finishSelect=async(id:string)=>{await refresh();await onSelect(id);setView(null);};
  const create=()=>void run(async()=>{const result=await api<{space:RecipeSpace}>('',{method:'POST',body:JSON.stringify({name,initial:!space})});await finishSelect(result.space.id);});
  const join=()=>void run(async()=>{
    if(!preview){setPreview(await api<InvitePreview>('/invite-preview',{method:'POST',body:JSON.stringify({code})}));return;}
    const result=await api<{space:RecipeSpace}>('/join',{method:'POST',body:JSON.stringify({code,space_id:preview.space_id})});
    try{sessionStorage.removeItem('uchino-invite-code');}catch{}await finishSelect(result.space.id);
  });
  const saveName=()=>void run(async()=>{await api(`/${space!.id}/name`,{method:'PUT',body:JSON.stringify({name})});await refresh();setName(name.trim());});
  const removeMember=(member:SpaceMember)=>{
    if(!confirm(`${member.name}さんをレシピ帳から外しますか？ 未使用の招待コードも無効になります。`))return;
    void run(async()=>{await api(`/${space!.id}/members/${encodeURIComponent(member.user_id)}`,{method:'DELETE',body:'{}'});await loadMembers();await refresh();});
  };
  const leave=()=>{if(!confirm('このレシピ帳から退出しますか？'))return;void run(async()=>{await api(`/${space!.id}/members/${encodeURIComponent(userId)}`,{method:'DELETE',body:'{}'});await refresh();setView(null);});};
  const removeSpace=()=>{if(!confirm(`「${space!.name}」を削除しますか？ メンバー全員がこのレシピ帳を開けなくなります。`))return;void run(async()=>{await api(`/${space!.id}/space`,{method:'DELETE',body:'{}'});await refresh();setView(null);});};
  let context:DockContext|undefined;
  if(view&&view!=='menu'){
    context={key:`space-${view}`,label:'レシピ帳の操作',back,disabled:blocked,commit:true};
    if(view==='create')context={...context,action:create,actionLabel:busy?'作成中…':'作成する',actionDisabled:!name.trim(),icon:Plus};
    if(view==='join')context={...context,action:join,actionLabel:busy?'確認中…':preview?'参加する':'参加先を確認',actionDisabled:!code.trim(),icon:preview?Check:KeyRound};
    if(view==='settings')context={...context,...(owner&&name.trim()!==space?.name?{action:saveName,actionLabel:'保存',actionDisabled:!name.trim(),icon:Check}:{}),...(owner&&!space?.is_home?{remove:removeSpace,removeLabel:'レシピ帳を削除'}:{})};
    if(view==='invite')context={...context,action:()=>{if(typeof navigator.share==='function')void navigator.share({text:inviteText}).catch(e=>{if(e.name!=='AbortError')setError('共有できませんでした。招待文をコピーしてください。');});else copy();},actionLabel:typeof navigator.share==='function'?'共有':copied?'コピーしました':'招待文をコピー',actionDisabled:!invite,icon:typeof navigator.share==='function'?Share2:Copy,secondary:{label:'別の招待コードを作る',text:'再発行',icon:RefreshCw,action:()=>void run(issueInvite)}};
  }
  const button=space?<button type="button" className="space-switcher" disabled={disabled||!!view} aria-label={`レシピ帳を切り替え：${space.name}`} title={space.name} aria-haspopup="dialog" aria-expanded={!!view} onClick={()=>open('menu')}>{<UsersRound size={23}/>}</button>:null;
  const settingsContent=<div className="space-management"><form onSubmit={e=>{e.preventDefault();if(owner&&!blocked&&name.trim())saveName();}}><label className="field">レシピ帳名<input value={name} maxLength={40} disabled={!owner||blocked} onChange={e=>setName(e.target.value)}/></label></form><h3><UsersRound size={19}/>メンバー</h3>
      <div className="space-members">{members.filter(member=>member.active).map(member=><div className="space-member" key={member.user_id}><span className="space-member-avatar">{member.avatarUrl?<img src={member.avatarUrl} referrerPolicy="no-referrer" alt=""/>:member.name.slice(0,1)}</span><span>{member.name}{member.user_id===userId?'（あなた）':''}<small>{member.user_id===space?.owner_id?'作成者':'メンバー'}</small></span>{owner&&member.user_id!==userId&&<button disabled={blocked} aria-label={`${member.name}をメンバーから外す`} onClick={()=>removeMember(member)}><Trash2 size={18}/></button>}</div>)}</div>
      <p className="subtle">メンバー全員がレシピと買い物リストを編集できます。</p>
      {owner?<button className="secondary space-invite-button" disabled={blocked} onClick={event=>{setOrigin(panelOrigin(event.currentTarget));void run(async()=>{await issueInvite();open('invite');});}}><UserRoundPlus size={18}/>メンバーを招待</button>:<button className="text-action space-leave" disabled={blocked} onClick={leave}><LogOut size={18}/>レシピ帳から退出</button>}
    </div>;
  const panel=view&&(space||view==='create'||view==='join')?<>{view==='menu'?<SpaceDialog title="レシピ帳" closing={closing} onClose={()=>dismiss()} onExited={()=>afterExit.current()}><div className="space-options">
    {spaces.map(s=><button key={s.id} aria-current={s.id===space?.id?'true':undefined} onClick={()=>{void run(async()=>{await onSelect(s.id);setView(null);});}}><span className="space-option-name">{s.name}<small>{`${s.member_count}人で共有`}{s.owner_id!==userId?' · 参加中':''}</small></span>{<UsersRound size={24} fill={s.id===space?.id?'currentColor':'none'}/>}</button>)}
    <hr/><button onClick={event=>{setOrigin(panelOrigin(event.currentTarget));transition('create',()=>setName('うちのレシピ'));}}><span>レシピ帳を作成</span><Plus size={24}/></button>
    <button onClick={event=>{setOrigin(panelOrigin(event.currentTarget));transition('join',()=>setPreview(null));}}><span>招待コードで参加</span><KeyRound size={23}/></button>
    <button onClick={()=>dismiss(null,openSettings)}><span>このレシピ帳の設定</span><Settings size={23}/></button>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div></SpaceDialog>:<>{(view==='settings'||view==='invite')&&<Panel key="settings" className="recipe-space-panel recipe-book-settings-panel" title="レシピ帳の設定" icon={Settings} suspended={view==='invite'} closing={view==='settings'&&closing} onClose={back} onExited={()=>afterExit.current()}>{error&&view==='settings'&&<p className="form-error" role="alert">{error}</p>}{settingsContent}</Panel>}{view!=='settings'&&<Panel origin={origin} key={view} className="recipe-space-panel" title={view==='create'?(space?'レシピ帳を作成':'レシピ帳を作る'):view==='join'?(space?'招待コードで参加':'レシピ帳に参加する'):view==='invite'?'メンバーを招待':'レシピ帳の設定'} icon={view==='create'?Plus:view==='join'?KeyRound:view==='invite'?UserRoundPlus:Settings} closing={closing} onClose={back} onExited={()=>afterExit.current()}>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {view==='create'&&<form className="form" onSubmit={e=>{e.preventDefault();if(!blocked&&name.trim())create();}}><label className="field">レシピ帳名<input maxLength={40} value={name} onChange={e=>setName(e.target.value)} disabled={blocked}/></label><p className="subtle">レシピと買い物メモをまとめます。作成後、家族を招待できます。</p></form>}
    {view==='join'&&<form className="form" onSubmit={e=>{e.preventDefault();if(!blocked&&code.trim())join();}}><label className="field">招待コード<input placeholder="XXXX-XXXX-XXXX" maxLength={64} autoCapitalize="characters" autoComplete="off" spellCheck={false} value={code} disabled={blocked} onChange={e=>{setCode(e.target.value);setPreview(null);try{sessionStorage.setItem('uchino-invite-code',e.target.value);}catch{}}}/></label>{preview&&<div className="space-join-preview"><strong>{preview.name}</strong>{preview.inviter&&<p>{preview.inviter}さんからの招待</p>}<p className="subtle">レシピ・写真・買い物リストを一緒に閲覧・編集できます。</p></div>}</form>}
    {view==='invite'&&<div className="space-invite">{invite?<><p>「{space?.name}」への招待コード</p><strong>{invite.code}</strong><small>1人用 · {new Date(invite.expires_at).toLocaleString('ja-JP')}まで</small><p className="subtle">招待文をLINEなどで相手に送ってください。<br/>参加した人は、このレシピ帳のすべてのレシピを閲覧・編集できます。</p>{typeof navigator.share==='function'&&<button className="secondary" disabled={blocked} onClick={copy}><Copy size={17}/>{copied?'コピーしました':'招待文をコピー'}</button>}</>:<p className="subtle" role="status">招待コードを作成しています…</p>}</div>}
  </Panel>}</>}</>:null;
  return {button,panel,context,openSettings,isOpen:!!view,openInvite:(source:HTMLElement)=>{setOrigin(panelOrigin(source));direct.current=true;void run(async()=>{await issueInvite();open('invite');});},openCreate:(source:HTMLElement)=>{setOrigin(panelOrigin(source));setName('うちのレシピ');open('create');},openJoin:(source:HTMLElement)=>{setOrigin(panelOrigin(source));direct.current=Boolean(space);setPreview(null);open('join');}};
}
