import {readBody} from './request-body';
import {Hono,type Context} from 'hono';
import {sessionUser,type AuthBindings,type AuthUser} from './auth';
import {googleAvatar} from './profile';
import {photoOwner,photoHash} from '../src/photo-ref';
import type {Space,Member} from '../src/spaces';
import {ensureSpaceSchema} from './space-schema';
export type StoredSpace=Omit<Space,'member_count'>&{data_owner:string;photo_owner:string;member_count?:number};
type Env={Bindings:AuthBindings;Variables:{user:AuthUser;space:StoredSpace}};
const fail=(error:string,status=400)=>Response.json({error},{status});
const cleanName=(value:unknown)=>typeof value==='string'&&value.trim().length<=40&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():'';
export const publicSpace=(space:StoredSpace):Space=>({id:space.id,name:space.name,owner_id:space.owner_id,is_home:!!space.is_home,member_count:space.member_count??1});
// Only pre-space cloud data needs an automatic home. A new account stays empty
// until the user explicitly creates a book or confirms an invitation.
export async function bootstrapSpaces(db:D1Database,user:AuthUser){
 await ensureSpaceSchema(db);
 const owner=await photoOwner(user.id),id=`home-${owner}`;
 await db.prepare(`INSERT INTO recipe_spaces(id,name,owner_id,data_owner,photo_owner,is_home)
 SELECT ?,'うちのレシピ',?,?,?,1 WHERE EXISTS (SELECT 1 FROM user_data WHERE user_id=?)
 ON CONFLICT DO NOTHING`).bind(id,user.id,user.id,owner,user.id).run();
 await db.prepare(`INSERT INTO recipe_space_members(space_id,user_id,name) SELECT id,?,? FROM recipe_spaces WHERE id=? AND owner_id=? AND deleted_at IS NULL ON CONFLICT DO NOTHING`).bind(user.id,user.name,id,user.id).run();
 await db.prepare(`UPDATE recipe_space_members SET name=? WHERE user_id=? AND ?<>''`).bind(user.name,user.id,user.name).run();
 return id;
}
export function membership(db:D1Database,id:string,userId:string){return db.prepare(`SELECT s.* FROM recipe_spaces s JOIN recipe_space_members m ON m.space_id=s.id WHERE s.id=? AND m.user_id=? AND m.active=1 AND s.deleted_at IS NULL`).bind(id,userId).first<StoredSpace>();}
export async function photoMembership(db:D1Database,owner:string,userId:string){return db.prepare(`SELECT s.id FROM recipe_spaces s JOIN recipe_space_members m ON m.space_id=s.id WHERE s.photo_owner=? AND m.user_id=? AND m.active=1 AND s.deleted_at IS NULL`).bind(owner,userId).first();}
export async function membersFor(db:D1Database,id:string):Promise<Member[]>{
 const result=await db.prepare(`SELECT m.user_id,COALESCE(NULLIF(p.display_name,''),NULLIF(m.name,''),'メンバー') name,m.active,p.avatar_url FROM recipe_space_members m LEFT JOIN user_profiles p ON p.user_id=m.user_id WHERE m.space_id=? ORDER BY m.joined_at,m.rowid`).bind(id).all<{user_id:string;name:string;active:number;avatar_url:string|null}>();
 return result.results.map(m=>({user_id:m.user_id,name:m.name,active:!!m.active,avatarUrl:googleAvatar(m.avatar_url)}));
}
const hashCode=(code:string)=>photoHash(new TextEncoder().encode(code));
const normalizeCode=(raw:unknown)=>typeof raw==='string'?raw.toUpperCase().replace(/[\s-]/g,''):'';
export const spacesRoutes=new Hono<Env>();
spacesRoutes.use('*',async(c,next)=>{
 const user=await sessionUser(c);if(!user)return fail('ログインしてください。',401);
 if(c.req.header('X-Uchino-User')&&c.req.header('X-Uchino-User')!==user.id)return fail('ログインし直してください。',401);
 if(!c.env.DB)return fail('クラウドの保存先が設定されていません。',503);
 c.set('user',user);await bootstrapSpaces(c.env.DB,user);await next();
});
spacesRoutes.get('/',async c=>{
 const result=await c.env.DB!.prepare(`SELECT s.*,(SELECT COUNT(*) FROM recipe_space_members a WHERE a.space_id=s.id AND a.active=1) AS member_count FROM recipe_spaces s JOIN recipe_space_members m ON m.space_id=s.id WHERE m.user_id=? AND m.active=1 AND s.deleted_at IS NULL ORDER BY s.created_at,s.id`).bind(c.get('user').id).all<StoredSpace>();
 return c.json({spaces:result.results.map(publicSpace)});
});
spacesRoutes.post('/',async c=>{
 const input=await readBody(c.req.raw,4096).catch(()=>null),name=cleanName(input?.name);if(!name)return fail('レシピ帳名は1〜40文字で入力してください');
 const user=c.get('user'),db=c.env.DB!,owner=await photoOwner(user.id),home=`home-${owner}`;
 const existingHome=await db.prepare('SELECT id FROM recipe_spaces WHERE data_owner=?').bind(user.id).first<{id:string}>();
 if(input.initial===true&&existingHome){const existing=await membership(db,existingHome.id,user.id);if(existing)return c.json({space:publicSpace(existing)},200);return fail('レシピ帳の状態が変わりました。再読み込みしてください。',409);}
 // The initial explicit creation reuses the account's storage namespace, so
 // pre-existing device edits retain their revisions and photo references.
 const initial=!existingHome,id=initial?home:crypto.randomUUID(),dataOwner=initial?user.id:`space:${id}`;
 await db.batch([
  db.prepare('INSERT INTO recipe_spaces(id,name,owner_id,data_owner,photo_owner,is_home) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(id,name,user.id,dataOwner,initial?owner:await photoOwner(dataOwner),Number(initial)),
  db.prepare('INSERT INTO recipe_space_members(space_id,user_id,name) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(id,user.id,user.name)
 ]);
 const created=await membership(db,id,user.id);if(!created)return fail('レシピ帳を作成できませんでした。もう一度お試しください。',409);
 return c.json({space:publicSpace(created)},201);
});
async function checkInvite(c:Context<Env>,raw:unknown){
 const user=c.get('user'),window=Math.floor(Date.now()/600000);
 const attempt=await c.env.DB!.prepare(`INSERT INTO recipe_invite_attempts(user_id,window,attempts) VALUES (?,?,1) ON CONFLICT(user_id) DO UPDATE SET window=excluded.window,attempts=CASE WHEN recipe_invite_attempts.window=excluded.window THEN recipe_invite_attempts.attempts+1 ELSE 1 END RETURNING attempts`).bind(user.id,window).first<{attempts:number}>();
 if((attempt?.attempts??0)>20)return {error:fail('試行回数が多いため、10分後にもう一度お試しください',429)};
 const code=normalizeCode(raw);if(!/^[A-HJ-NP-Z2-9]{12}$/.test(code))return {error:fail('招待コードを確認してください')};
 const hash=await hashCode(code);
 const invite=await c.env.DB!.prepare(`SELECT i.space_id,s.name,COALESCE(NULLIF(p.display_name,''),NULLIF(m.name,'')) inviter FROM recipe_space_invites i JOIN recipe_spaces s ON s.id=i.space_id JOIN recipe_space_members m ON m.space_id=s.id AND m.user_id=i.created_by LEFT JOIN user_profiles p ON p.user_id=i.created_by WHERE i.code_hash=? AND i.expires_at>? AND i.revoked=0 AND (i.consumed_by IS NULL OR i.consumed_by=?) AND s.deleted_at IS NULL AND m.active=1`).bind(hash,Date.now(),user.id).first<{space_id:string;name:string;inviter:string|null}>();
 return invite?{invite,hash}:{error:fail('招待コードが無効か、有効期限が切れています',404)};
}
spacesRoutes.post('/invite-preview',async c=>{const input=await readBody(c.req.raw,4096).catch(()=>null),result=await checkInvite(c,input?.code);return result.error??c.json(result.invite!);});
spacesRoutes.post('/join',async c=>{
 const input=await readBody(c.req.raw,4096).catch(()=>null),result=await checkInvite(c,input?.code);if(result.error)return result.error;
 const user=c.get('user'),invite=result.invite!;if(input?.space_id!==invite.space_id)return fail('参加先を確認してください');
 // Consume and add membership in the same transaction. Exactly one user wins.
 await c.env.DB!.batch([
  c.env.DB!.prepare(`UPDATE recipe_space_invites SET consumed_by=? WHERE code_hash=? AND consumed_by IS NULL AND revoked=0 AND expires_at>? AND EXISTS (SELECT 1 FROM recipe_spaces WHERE id=space_id AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM recipe_space_members m WHERE m.space_id=id AND m.user_id=recipe_space_invites.created_by AND m.active=1))`).bind(user.id,result.hash!,Date.now()),
  c.env.DB!.prepare(`INSERT INTO recipe_space_members(space_id,user_id,name) SELECT i.space_id,?,? FROM recipe_space_invites i JOIN recipe_spaces s ON s.id=i.space_id WHERE i.code_hash=? AND i.consumed_by=? AND i.revoked=0 AND i.expires_at>? AND s.deleted_at IS NULL ON CONFLICT(space_id,user_id) DO UPDATE SET active=1,name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE recipe_space_members.name END`).bind(user.id,user.name,result.hash!,user.id,Date.now())
 ]);
 const space=await membership(c.env.DB!,invite.space_id,user.id);if(!space)return fail('招待コードは使用済みです',409);
 return c.json({space:publicSpace(space)});
});
spacesRoutes.use('/:id/*',async(c,next)=>{
 const space=await membership(c.env.DB!,c.req.param('id')!,c.get('user').id);if(!space)return fail('レシピ帳が見つかりません',404);c.set('space',space);await next();
});
spacesRoutes.get('/:id/details',async c=>c.json({space:publicSpace(c.get('space')),members:await membersFor(c.env.DB!,c.get('space').id)}));
// Who else in the book is doing something right now (only shopping, for now).
// Each open client reports every few seconds; silence for 20s means gone.
spacesRoutes.post('/:id/presence',async c=>{
 const space=c.get('space'),user=c.get('user'),db=c.env.DB!,now=Date.now();
 const input=await readBody(c.req.raw,1024).catch(()=>null),activity=input?.activity==='shopping'?'shopping':'';
 if(activity)await db.prepare('INSERT INTO recipe_space_presence(space_id,user_id,activity,updated_at) VALUES (?,?,?,?) ON CONFLICT(space_id,user_id) DO UPDATE SET activity=excluded.activity,updated_at=excluded.updated_at').bind(space.id,user.id,activity,now).run();
 else await db.prepare('DELETE FROM recipe_space_presence WHERE space_id=? AND user_id=?').bind(space.id,user.id).run();
 const result=await db.prepare(`SELECT COALESCE(NULLIF(p.display_name,''),NULLIF(m.name,''),'メンバー') name,r.activity FROM recipe_space_presence r JOIN recipe_space_members m ON m.space_id=r.space_id AND m.user_id=r.user_id AND m.active=1 LEFT JOIN user_profiles p ON p.user_id=r.user_id WHERE r.space_id=? AND r.user_id<>? AND r.updated_at>?`).bind(space.id,user.id,now-20000).all<{name:string;activity:string}>();
 return c.json({active:result.results});
});
spacesRoutes.post('/:id/invites',async c=>{
 const space=c.get('space'),user=c.get('user');if(space.owner_id!==user.id)return fail('招待できるのは作成者だけです',403);
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=[...crypto.getRandomValues(new Uint8Array(12))].map(b=>alphabet[b%32]).join(''),expires=Date.now()+48*60*60*1000;
 await c.env.DB!.prepare('INSERT INTO recipe_space_invites(code_hash,space_id,created_by,expires_at) SELECT ?,id,?,? FROM recipe_spaces WHERE id=? AND deleted_at IS NULL').bind(await hashCode(code),user.id,expires,space.id).run();
 return c.json({code:code.match(/.{4}/g)!.join('-'),expires_at:expires},201);
});
spacesRoutes.put('/:id/name',async c=>{
 const space=c.get('space');if(space.owner_id!==c.get('user').id)return fail('変更できるのは作成者だけです',403);
 const input=await readBody(c.req.raw,4096).catch(()=>null),name=cleanName(input?.name);if(!name)return fail('レシピ帳名は1〜40文字で入力してください');
 await c.env.DB!.prepare('UPDATE recipe_spaces SET name=? WHERE id=? AND deleted_at IS NULL').bind(name,space.id).run();return c.json({ok:true});
});
spacesRoutes.delete('/:id/space',async c=>{
 const space=c.get('space');if(space.is_home||space.owner_id!==c.get('user').id)return fail('削除できるのは作成者だけです',403);
 await c.env.DB!.batch([c.env.DB!.prepare('UPDATE recipe_spaces SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').bind(space.id),c.env.DB!.prepare('UPDATE recipe_space_invites SET revoked=1 WHERE space_id=?').bind(space.id)]);return c.json({ok:true});
});
spacesRoutes.delete('/:id/members/:userId',async c=>{
 const space=c.get('space'),userId=c.req.param('userId');if((space.owner_id!==c.get('user').id&&userId!==c.get('user').id)||userId===space.owner_id)return fail('このメンバーは削除できません',403);
 await c.env.DB!.batch([c.env.DB!.prepare('UPDATE recipe_space_members SET active=0 WHERE space_id=? AND user_id=?').bind(space.id,userId),c.env.DB!.prepare('UPDATE recipe_space_invites SET revoked=1 WHERE space_id=?').bind(space.id)]);return c.json({ok:true});
});
