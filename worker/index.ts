import {Hono} from 'hono';
import {authRoutes,sessionUser,type AuthBindings,type AuthUser} from './auth';
import {validateRecord,type Kind} from '../src/domain';
import {importUrl,importAI,type ImportBindings} from './import';
import {embeddedAssets} from './generated-assets';
type Bindings=AuthBindings&ImportBindings&{APP_ENV?:string};
const app=new Hono<{Bindings:Bindings;Variables:{user:AuthUser}}>();
app.use('*',async(c,next)=>{
  c.header('X-Content-Type-Options','nosniff');c.header('Referrer-Policy','no-referrer');c.header('X-Frame-Options','DENY');
  c.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleusercontent.com; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if(c.req.path.startsWith('/api/'))c.header('Cache-Control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(c.req.method)){
    const origin=c.req.header('Origin');if(origin!==new URL(c.req.url).origin)return c.json({error:'ページを再読み込みしてください。'},403);
    if(!c.req.header('Content-Type')?.startsWith('application/json'))return c.json({error:'JSONが必要です。'},415);
  }
  await next();
});
app.onError((_error,c)=>c.json({error:'処理できませんでした。時間をおいて再試行してください。'},500));
app.get('/api/health',c=>c.json({ok:true,app:'uchino',environment:c.env.APP_ENV??'local',version:'0.1.0'}));
app.get('/api/config',c=>c.json({ai:Boolean(c.env.AI&&c.env.AI_GATEWAY_ID&&c.env.AI_RECIPE_MODEL)}));
app.route('/api/auth',authRoutes);
app.use('/api/data/*',async(c,next)=>{const user=await sessionUser(c);if(!user)return c.json({error:'ログインしてください。'},401);c.set('user',user);if(!c.env.DB)return c.json({error:'同期の準備中です。'},503);await next();});
app.use('/api/data',async(c,next)=>{const user=await sessionUser(c);if(!user)return c.json({error:'ログインしてください。'},401);c.set('user',user);if(!c.env.DB)return c.json({error:'同期の準備中です。'},503);await next();});
app.get('/api/data',async c=>{
  const result=await c.env.DB!.prepare('SELECT kind,id,data,revision,deleted FROM user_data WHERE user_id = ?').bind(c.get('user').id).all<{kind:Kind;id:string;data:string;revision:number;deleted:number}>();
  return c.json({records:result.results.map(r=>({...r,data:JSON.parse(r.data),deleted:!!r.deleted}))});
});
async function body(request:Request,limit=100000){const length=Number(request.headers.get('content-length')||0);if(length>limit)throw new Error('入力が大きすぎます。');const reader=request.body?.getReader();if(!reader)throw new Error('入力がありません。');const chunks:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw new Error('入力が大きすぎます。');}chunks.push(part.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));}
app.put('/api/data/:kind/:id',async c=>{
  const kind=c.req.param('kind');if(kind!=='recipe'&&kind!=='shopping')return c.json({error:'対象が見つかりません。'},404);
  let input;try{input=await body(c.req.raw);}catch{return c.json({error:'入力内容を確認してください。'},400);}
  const data=validateRecord(kind,input?.data);
  if(!data||data.id!==c.req.param('id')||!Number.isInteger(input.revision)||input.revision<0||typeof input.deleted!=='boolean'||typeof input.editId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(input.editId))return c.json({error:'入力内容を確認してください。'},400);
  const db=c.env.DB!,user=c.get('user').id;
  const previous=await db.prepare('SELECT revision, edit_id FROM user_data WHERE user_id=? AND kind=? AND id=?').bind(user,kind,data.id).first<{revision:number;edit_id:string}>();
  if(previous&&previous.edit_id===input.editId)return c.json({revision:previous.revision});
  const result=await db.prepare(`INSERT INTO user_data(user_id,kind,id,data,revision,deleted,edit_id) SELECT ?,?,?,?,1,?,? WHERE ?=0
    ON CONFLICT(user_id,kind,id) DO UPDATE SET data=excluded.data, revision=user_data.revision+1, deleted=excluded.deleted, edit_id=excluded.edit_id, updated_at=CURRENT_TIMESTAMP WHERE user_data.revision=? RETURNING revision`).bind(user,kind,data.id,JSON.stringify(data),Number(input.deleted),input.editId,input.revision,input.revision).first<{revision:number}>();
  // Existing rows need UPDATE when INSERT's revision-zero guard does not select a row.
  if(result)return c.json(result);
  if(input.revision>0){const updated=await db.prepare('UPDATE user_data SET data=?,revision=revision+1,deleted=?,edit_id=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND kind=? AND id=? AND revision=? RETURNING revision').bind(JSON.stringify(data),Number(input.deleted),input.editId,user,kind,data.id,input.revision).first<{revision:number}>();if(updated)return c.json(updated);}
  return c.json({error:'他の端末で変更されています。'},409);
});
app.post('/api/import',async c=>{
  if(!await sessionUser(c))return c.json({error:'取り込みにはGoogleログインが必要です。'},401);
  let input;try{input=await body(c.req.raw,8_100_000);}catch{return c.json({error:'ファイルが大きすぎるか、読み取れませんでした。'},400);}
  try{const recipe=input?.url?await importUrl(String(input.url)):await importAI(c.env,input??{});return c.json({recipe});}catch(error){return c.json({error:error instanceof Error?error.message:'読み取れませんでした。'},422);}
});
app.all('/api/*',c=>c.json({error:'見つかりません。'},404));
app.get('*',c=>{
  const path=new URL(c.req.url).pathname;
  const asset=embeddedAssets[path]??(!path.includes('.')?embeddedAssets['/index.html']:undefined);
  if(!asset)return c.notFound();
  c.header('Content-Type',asset.mime);c.header('Cache-Control',path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache');
  const data=asset.encoding==='base64'?Uint8Array.from(atob(asset.body),v=>v.charCodeAt(0)):asset.body;
  return c.body(data);
});
export default app;
