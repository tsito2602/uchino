export async function syncFailure(response:Response):Promise<Error>{
  if(response.status===401)return new Error('ログインの有効期限が切れています。再ログインすると、端末に保存した変更を同期できます。');
  if(response.status===409)return new Error('他の端末で変更されています。設定から未同期データを書き出して保管してください。');
  if(response.status===503){
    const body=await response.json().catch(()=>null) as {code?:string}|null;
    if(body?.code==='storage_unconfigured')return new Error('クラウドの保存先が未設定のため同期できません。端末のデータは保持されています。');
    return new Error('クラウドの保存先に接続できませんでした。時間をおいて「今すぐ同期」をお試しください。');
  }
  return new Error('クラウドとの同期に失敗しました。端末のデータは保持されています。「今すぐ同期」で再試行してください。');
}
