import {Hono} from 'hono';
import {stream} from 'hono/streaming';
import {demoImport} from './import-demo';
import type {ImportEvent,ImportPhase} from '../src/import-model';
import {authRoutes,sessionUser,type AuthBindings,type AuthUser} from './auth';
import {validateRecord,type Kind,type Recipe} from '../src/domain';
import {photoOwner,photoReference} from '../src/photo-ref';
import {storeRecipePhotos,PhotoStorageFailure,type PhotoBindings} from './recipe-photos';
import {importUrl,importAI,aiConfigured,type ImportBindings} from './import';
import {importFailurePayload} from './import-errors';
import {embeddedAssets} from './generated-assets';
import {ensureDataSchema} from './data-schema';
type Bindings=AuthBindings&ImportBindings&PhotoBindings&{APP_ENV?:string};
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
app.get('/api/config',c=>c.json({ai:aiConfigured(c.env),demoImport:c.env.APP_ENV==='staging',photoStorage:c.env.RECIPE_PHOTOS?'r2':'inline'}));
app.route('/api/auth',authRoutes);
app.get('/api/photos/:owner/:file',async c=>{
  const user=await sessionUser(c);if(!user)return c.json({error:'ログインしてください。'},401);
  const reference=photoReference(c.req.path);
  if(!reference||reference.owner!==await photoOwner(user.id))return c.notFound();
  if(!c.env.RECIPE_PHOTOS)return c.json({error:'写真の保存先が設定されていません。'},503);
  try{
    const photo=await c.env.RECIPE_PHOTOS.get(reference.key);if(!photo)return c.notFound();
    c.header('Content-Type','image/jpeg');c.header('Content-Length',String(photo.size));c.header('ETag',photo.httpEtag);
    return c.body(photo.body);
  }catch{return c.json({error:'写真を取得できませんでした。'},503);}
});
app.use('/api/data/*',async(c,next)=>{const user=await sessionUser(c);if(!user)return c.json({error:'ログインしてください。'},401);c.set('user',user);if(!c.env.DB)return c.json({error:'クラウドの保存先が設定されていません。',code:'storage_unconfigured'},503);try{await ensureDataSchema(c.env.DB);}catch{console.error(JSON.stringify({event:'data_sync_failed',code:'storage_initialization_failed'}));return c.json({error:'クラウドの保存先に接続できませんでした。',code:'storage_unavailable'},503);}await next();});
app.get('/api/data',async c=>{
  const result=await c.env.DB!.prepare('SELECT kind,id,data,revision,deleted FROM user_data WHERE user_id = ?').bind(c.get('user').id).all<{kind:Kind;id:string;data:string;revision:number;deleted:number}>();
  return c.json({records:result.results.map(r=>({...r,data:JSON.parse(r.data),deleted:!!r.deleted})),...(c.env.RECIPE_PHOTOS?{photoStorage:'r2'}:{})});
});
async function body(request:Request,limit=100000){const length=Number(request.headers.get('content-length')||0);if(length>limit)throw new Error('入力が大きすぎます。');const reader=request.body?.getReader();if(!reader)throw new Error('入力がありません。');const chunks:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw new Error('入力が大きすぎます。');}chunks.push(part.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));}
app.put('/api/data/:kind/:id',async c=>{
  const kind=c.req.param('kind');if(kind!=='recipe'&&kind!=='shopping')return c.json({error:'対象が見つかりません。'},404);
  let input;try{input=await body(c.req.raw,kind==='recipe'?1_810_000:100_000);}catch{return c.json({error:'入力内容を確認してください。'},400);}
  let data=validateRecord(kind,input?.data);
  if(!data||data.id!==c.req.param('id')||!Number.isInteger(input.revision)||input.revision<0||typeof input.deleted!=='boolean'||typeof input.editId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(input.editId))return c.json({error:'入力内容を確認してください。'},400);
  const db=c.env.DB!,user=c.get('user').id;
  const previous=await db.prepare('SELECT revision, edit_id, data FROM user_data WHERE user_id=? AND kind=? AND id=?').bind(user,kind,data.id).first<{revision:number;edit_id:string;data:string}>();
  if(previous&&previous.edit_id===input.editId)return c.json({revision:previous.revision,...(c.env.RECIPE_PHOTOS?{data:JSON.parse(previous.data)}:{})});
  if((previous?.revision??0)!==input.revision)return c.json({error:'他の端末で変更されています。'},409);
  if(kind==='recipe'){
    try{data=await storeRecipePhotos(c.env.RECIPE_PHOTOS,user,data as Recipe,previous?JSON.parse(previous.data):undefined);}
    catch(error){if(error instanceof PhotoStorageFailure)return c.json({error:error.message,code:error.code},error.code==='photo_reference_invalid'?400:503);throw error;}
  }
  const reply=(revision:number)=>c.json({revision,...(c.env.RECIPE_PHOTOS?{data}:{})});
  const result=await db.prepare(`INSERT INTO user_data(user_id,kind,id,data,revision,deleted,edit_id) SELECT ?,?,?,?,1,?,? WHERE ?=0
    ON CONFLICT(user_id,kind,id) DO UPDATE SET data=excluded.data, revision=user_data.revision+1, deleted=excluded.deleted, edit_id=excluded.edit_id, updated_at=CURRENT_TIMESTAMP WHERE user_data.revision=? RETURNING revision`).bind(user,kind,data.id,JSON.stringify(data),Number(input.deleted),input.editId,input.revision,input.revision).first<{revision:number}>();
  // Existing rows need UPDATE when INSERT's revision-zero guard does not select a row.
  if(result)return reply(result.revision);
  if(input.revision>0){const updated=await db.prepare('UPDATE user_data SET data=?,revision=revision+1,deleted=?,edit_id=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND kind=? AND id=? AND revision=? RETURNING revision').bind(JSON.stringify(data),Number(input.deleted),input.editId,user,kind,data.id,input.revision).first<{revision:number}>();if(updated)return reply(updated.revision);}
  return c.json({error:'他の端末で変更されています。'},409);
});
app.post('/api/import/demo',c=>c.env.APP_ENV==='staging'?c.json(demoImport()):c.json({error:'見つかりません。'},404));
app.post('/api/import',async c=>{
  if(!await sessionUser(c))return c.json({error:'取り込みにはGoogleログインが必要です。'},401);
  let input;try{input=await body(c.req.raw,8_100_000);}catch{return c.json({error:'ファイルが大きすぎるか、読み取れませんでした。'},400);}
  if(!input||typeof input!=='object'||Array.isArray(input)||input.url!==undefined&&(typeof input.url!=='string'||!input.url.trim()||input.url.length>2048||input.text!==undefined||input.image!==undefined))return c.json({error:'レシピのURL・本文・画像のいずれかを指定してください。'},400);
  const execute=(signal:AbortSignal,onPhase?:(phase:ImportPhase)=>void)=>input.url!==undefined?importUrl(input.url.trim(),{signal,onPhase},c.env):importAI(c.env,input,{signal,onPhase});
  if(c.req.header('Accept')==='application/x-ndjson'){
    c.header('Content-Type','application/x-ndjson; charset=utf-8');
    return stream(c,async output=>{
      const controller=new AbortController();output.onAbort(()=>controller.abort());
      const send=(event:ImportEvent)=>output.writeln(JSON.stringify(event));
      // Video analysis can take minutes. Blank NDJSON lines keep the stream alive.
      const heartbeat=setInterval(()=>{void output.writeln('').catch(()=>controller.abort());},15000);
      try{await send({type:'phase',phase:'reading'});const result=await execute(AbortSignal.any([c.req.raw.signal,controller.signal]),phase=>{void send({type:'phase',phase});});await send({type:'result',result});}
      catch(error){if(!controller.signal.aborted)await send({type:'error',...importFailurePayload(error)});}
      finally{clearInterval(heartbeat);}
    });
  }
  try{return c.json(await execute(c.req.raw.signal));}catch(error){return c.json(importFailurePayload(error),422);}
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
