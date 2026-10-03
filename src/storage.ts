import {useEffect,useState} from 'react';
import {validateRecord,recipePhoto,type Kind,type RecordData,type Recipe} from './domain';
import {samples} from './samples';
import {syncFailure} from './sync-error';
import {demoScope,isLegacyDemoRecipe,localOnlyScope} from './data-mode';
import {cacheUploadedPhotos,cacheRemotePhotos,hasEmbeddedPhotos} from './photo-cache';
export type Row = {key:string;kind:Kind;id:string;data:RecordData;revision:number;deleted:boolean;pending:boolean;editId:string;photoMigration?:boolean};
type RemoteRow=Omit<Row,'key'|'pending'|'editId'|'photoMigration'>;
const eventName='uchino:data';
let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('uchino',1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=undefined;reject(new Error('端末に保存できません。ブラウザの保存設定を確認してください。'));};});}
function key(scope:string,kind:Kind,id:string){return `${scope}:${kind}:${id}`;}
export async function rows(scope:string):Promise<Row[]>{const database=await db();return new Promise((resolve,reject)=>{const r=database.transaction('records').objectStore('records').getAll();r.onsuccess=()=>resolve((r.result as Row[]).filter(v=>v.key.startsWith(`${scope}:`)));r.onerror=()=>reject(r.error);});}
async function writeMany(values:Row[],removeKeys:string[]=[]){
  if(!values.length&&!removeKeys.length)return;
  const database=await db();return new Promise<void>((resolve,reject)=>{
    const tx=database.transaction('records','readwrite');
    tx.oncomplete=()=>{window.dispatchEvent(new Event(eventName));resolve();};
    tx.onerror=tx.onabort=()=>reject(new Error('端末に保存できませんでした。空き容量を確認してください。'));
    try{const store=tx.objectStore('records');for(const row of values)store.put(row);for(const key of removeKeys)store.delete(key);}
    catch(error){tx.abort();reject(error);}
  });
}
async function write(row:Row){return writeMany([row]);}
// Serialize local writes and sync reconciliation, preventing an older network reply
// from replacing a newer edit made while that request was in flight.
let operations=Promise.resolve();
function exclusive<T>(operation:()=>Promise<T>):Promise<T>{const next=operations.then(operation);operations=next.then(()=>undefined,()=>undefined);return next;}
function localRow(scope:string,kind:Kind,data:RecordData):Row {
  return {key:key(scope,kind,data.id),kind,id:data.id,data,deleted:false,revision:0,pending:false,editId:crypto.randomUUID()};
}
async function separateLegacyDemos(scope:string) {
  const original=await rows(scope),target=demoScope(scope),demo=await rows(target);
  const legacy=original.filter(row=>!row.deleted&&row.kind==='recipe'&&isLegacyDemoRecipe(row.data as Recipe));
  const writes:Row[]=[],removeKeys:string[]=[];
  for(const row of legacy){
    const existing=demo.find(item=>item.kind===row.kind&&item.id===row.id);
    // In the rare case both areas were edited, retain both versions.
    if(!existing||JSON.stringify(existing.data)!==JSON.stringify(row.data)||existing.deleted){
      const data=existing?{...row.data,id:crypto.randomUUID(),photo:recipePhoto(row.data as Recipe)}:row.data;
      writes.push(localRow(target,row.kind,data));
    }
    if(scope==='guest')removeKeys.push(row.key);
    else writes.push({...row,deleted:true,pending:true,editId:crypto.randomUUID()});
  }
  // Copy and remove in one transaction, so a failed migration never loses data.
  await writeMany(writes,removeKeys);
  return legacy.length>0&&!original.some(row=>!row.deleted&&row.kind==='recipe'&&!isLegacyDemoRecipe(row.data as Recipe));
}
export function prepareData(scope:string):Promise<boolean> {
  return exclusive(async()=>{
    if(!scope.startsWith('demo-'))return separateLegacyDemos(scope);
    // Tombstones count as existing data: deleting all demos must not reseed them.
    if(!(await rows(scope)).length)await writeMany(samples.map(sample=>localRow(scope,'recipe',sample)));
    return false;
  });
}
export async function saveRecord(scope:string,kind:Kind,data:RecordData,deleted=false){
  return saveRecords(scope,kind,[data],deleted);
}
export async function saveRecords(scope:string,kind:Kind,records:RecordData[],deleted=false){
  if(records.some(data=>!validateRecord(kind,data)))throw new Error('入力内容を確認してください。');
  return exclusive(async()=>{
    const previous=new Map((await rows(scope)).map(row=>[row.key,row]));
    await writeMany(records.map(data=>({key:key(scope,kind,data.id),kind,id:data.id,data,deleted,revision:previous.get(key(scope,kind,data.id))?.revision??0,pending:!localOnlyScope(scope),editId:crypto.randomUUID()})));
  });
}
const syncing=new Map<string,Promise<void>>();
export function synchronize(scope:string):Promise<void>{
  if(localOnlyScope(scope))return Promise.resolve();
  if(!navigator.onLine)return Promise.reject(new Error('オフラインです。通信が戻ると、端末に保存したデータを同期します。'));
  const currentSync=syncing.get(scope);if(currentSync)return currentSync;
  const operation=(async()=>{
    await prepareData(scope);
    const flushPending=async()=>{
      const local=await rows(scope);
      for(const row of local.filter(r=>r.pending)){
        const response=await fetch(`/api/data/${row.kind}/${row.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:row.data,deleted:row.deleted,revision:row.revision,editId:row.editId}),signal:AbortSignal.timeout(row.kind==='recipe'?90000:15000)});
        // A storage-only migration must not overwrite a newer edit on another
        // device or trap this device in a conflict. Fetch its latest row again.
        if(response.status===409&&row.photoMigration){
          await exclusive(async()=>{const current=(await rows(scope)).find(r=>r.key===row.key);if(current?.editId===row.editId)await write({...current,pending:false,photoMigration:false});});continue;
        }
        if(!response.ok)throw await syncFailure(response);
        const remote=await response.json() as {revision:number;data?:RecordData};
        const canonical=remote.data===undefined?row.data:validateRecord(row.kind,remote.data);
        if(!canonical||canonical.id!==row.id||!Number.isInteger(remote.revision))throw new Error('同期結果を確認できませんでした。端末のデータは保持されています。');
        if(row.kind==='recipe')await cacheUploadedPhotos(row.data as Recipe,canonical as Recipe);
        await exclusive(async()=>{
          const current=(await rows(scope)).find(r=>r.key===row.key);
          if(current)await write({...current,revision:remote.revision,...(current.editId===row.editId?{data:canonical,pending:false,photoMigration:false}:{pending:true})});
        });
      }
    };
    await flushPending();
    const response=await fetch('/api/data',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw await syncFailure(response);
    const result=await response.json() as {records:RemoteRow[];photoStorage?:string};
    await exclusive(async()=>{
      const current=await rows(scope);
      for(const remote of result.records){
        const k=key(scope,remote.kind,remote.id);
        if(!current.find(r=>r.key===k)?.pending&&validateRecord(remote.kind,remote.data)){
          const photoMigration=result.photoStorage==='r2'&&remote.kind==='recipe'&&hasEmbeddedPhotos(remote.data as Recipe);
          await write({...remote,key:k,pending:photoMigration,photoMigration,editId:crypto.randomUUID()});
        }
      }
      await separateLegacyDemos(scope);
    });
    // Existing cloud photos migrate on the first successful sync, not only when
    // the user happens to edit a recipe. Guest/demo data remain entirely local.
    if(result.photoStorage==='r2')await flushPending();
    await cacheRemotePhotos((await rows(scope)).filter(row=>row.kind==='recipe').map(row=>row.data as Recipe));
  })().finally(()=>{syncing.delete(scope);});syncing.set(scope,operation);return operation;
}
export function useRecords(scope:string,autoSync=true){
  const [data,setData]=useState<Row[]>([]),[ready,setReady]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;const load=()=>{void prepareData(scope).then(()=>rows(scope)).then(v=>{if(active){setData(v);setReady(true);}}).catch(e=>{if(active)setError(String(e.message));});};load();window.addEventListener(eventName,load);return()=>{active=false;window.removeEventListener(eventName,load);};},[scope]);
  useEffect(()=>{if(!autoSync)return;let active=true;const sync=()=>{void synchronize(scope).then(()=>{if(active)setError('');}).catch(e=>{if(active)setError(e.message);});};sync();window.addEventListener('online',sync);const timer=setInterval(sync,30000);return()=>{active=false;clearInterval(timer);window.removeEventListener('online',sync);};},[scope,autoSync]);
  async function save(kind:Kind,record:RecordData,deleted=false){await saveRecord(scope,kind,record,deleted);void synchronize(scope).then(()=>setError('')).catch(e=>setError(e.message));}
  async function saveMany(kind:Kind,records:RecordData[],deleted=false){await saveRecords(scope,kind,records,deleted);void synchronize(scope).then(()=>setError('')).catch(e=>setError(e.message));}
  return {rows:data.filter(r=>!r.deleted),allRows:data,ready,error,setError,save,saveMany,pending:data.filter(r=>r.pending).length};
}
