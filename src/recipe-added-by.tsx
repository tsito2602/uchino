import type {CSSProperties} from 'react';
import type {SpaceMember} from './spaces';

export function memberColor(userId:string){let hash=0;for(const c of userId)hash=(hash*31+c.charCodeAt(0))>>>0;return ['#2D99F4','#F44E9E','#F2994A','#27AE60','#9B51E0','#00A3A3'][hash%6];}
export function MemberAvatar({member,className='member-avatar'}:{member:SpaceMember;className?:string}){
  return <span className={className} style={{'--member-color':memberColor(member.user_id)} as CSSProperties} aria-hidden="true">{member.avatarUrl?<img src={member.avatarUrl} referrerPolicy="no-referrer" alt=""/>:member.name.slice(0,1)}</span>;
}
export function RecipeAddedBy({member,userId}:{member?:SpaceMember;userId:string}){
  if(!member)return null;
  return <span className="recipe-added-by"><MemberAvatar member={member}/><span className="visually-hidden">{member.user_id===userId?'あなた':member.name}が追加</span></span>;
}
