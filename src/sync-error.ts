// A 401 never surfaces as a sync error: local edits stay pending and the
// sign-in gate re-checks the session (showing the login screen if needed).
export const SESSION_EXPIRED='SessionExpired';
export function sessionExpired():Error{
  if(typeof window!=='undefined')window.dispatchEvent(new Event('uchino:session-expired'));
  const error=new Error('');error.name=SESSION_EXPIRED;return error;
}
export const visibleSyncError=(error:unknown)=>error instanceof Error&&error.name!==SESSION_EXPIRED?error.message:'';
export async function syncFailure(response:Response):Promise<Error>{
  if(response.status===401)return sessionExpired();
  if(response.status===403){if(typeof window!=='undefined')window.dispatchEvent(new Event('uchino:spaces-refresh'));return new Error('このレシピ帳へのアクセス権がなくなりました。レシピ帳を切り替えてください。');}
  if(response.status===409){
    const body=await response.json().catch(()=>null) as {code?:string}|null;
    if(body?.code==='recipebook_required'){if(typeof window!=='undefined')window.dispatchEvent(new Event('uchino:spaces-refresh'));return new Error('レシピ帳を作るか、招待されたレシピ帳に参加してください。端末のデータは保持されています。');}
    return new Error('他の端末で変更されています。端末の変更は保持されています。');
  }
  if(response.status===503){
    const body=await response.json().catch(()=>null) as {code?:string}|null;
    if(body?.code==='storage_unconfigured')return new Error('クラウドの保存先が未設定のため同期できません。端末のデータは保持されています。');
    if(body?.code==='photo_storage_unavailable'||body?.code==='photo_storage_unconfigured')return new Error('写真の保存先に接続できませんでした。端末の写真は保持されています。「今すぐ同期」で再試行してください。');
    return new Error('クラウドの保存先に接続できませんでした。時間をおいて「今すぐ同期」をお試しください。');
  }
  return new Error('クラウドとの同期に失敗しました。端末のデータは保持されています。「今すぐ同期」で再試行してください。');
}
