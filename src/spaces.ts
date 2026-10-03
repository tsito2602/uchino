export type Space={id:string;name:string;owner_id:string;is_home:boolean;member_count:number};
export type Member={user_id:string;name:string;active:boolean;avatarUrl?:string};
export type Invite={code:string;expires_at:number};
export type InvitePreview={space_id:string;name:string;inviter:string|null};
export type RecipeSpace=Space;
export type SpaceMember=Member;
export type SpaceInvite=Invite;
// Retain home cache keys exactly, including pending edits and demo preferences.
export const spaceScope=(userId:string,space:Space)=>space.is_home&&space.owner_id===userId?`user-${userId}`:`shared:${encodeURIComponent(userId)}:${encodeURIComponent(space.id)}`;
export function scopeRequest(scope:string,suffix=''){
 if(scope.startsWith('user-'))return {url:`/api/data${suffix}`,userId:scope.slice(5)};
 const parts=scope.split(':');
 if(parts.length!==3||parts[0]!=='shared')throw new Error('保存先を確認してください。');
 return {url:`/api/data${suffix}?space=${encodeURIComponent(decodeURIComponent(parts[2]))}`,userId:decodeURIComponent(parts[1])};
}
export function invitationText(space:Space,invite:Invite,origin:string){return `「uchino」の「${space.name}」に招待します。\n招待コード：${invite.code}\nアプリを開き、「招待されたレシピ帳に参加する」で入力してください。レシピ帳がある場合は、右上のレシピ帳アイコン →「招待コードで参加」から参加できます。\n48時間以内・1人用です。\n\n${origin}/`;}
