import {useEffect,useState} from 'react';
import {validateRecord,type Kind,type RecordData} from './domain';
export type Row = {key:string;kind:Kind;id:string;data:RecordData;revision:number;deleted:boolean;pending:boolean;editId:string};
type RemoteRow=Omit<Row,'key'|'pending'|'editId'>;
const eventName='uchino:data';
let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('uchino',1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=undefined;reject(new Error('端末に保存できません。ブラウザの保存設定を確認してください。'));};});}
function key(scope:string,kind:Kind,id:string){return `${scope}:${kind}:${id}`;}
export async function rows(scope:string):Promise<Row[]>{const database=await db();return new Promise((resolve,reject)=>{const r=database.transaction('records').objectStore('records').getAll();r.onsuccess=()=>resolve((r.result as Row[]).filter(v=>v.key.startsWith(`${scope}:`)));r.onerror=()=>reject(r.error);});}
async function write(row:Row){const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction('records','readwrite');tx.objectStore('records').put(row);tx.oncomplete=()=>{window.dispatchEvent(new Event(eventName));resolve();};tx.onerror=()=>reject(new Error('端末に保存できませんでした。空き容量を確認してください。'));});}
// Serialize local writes and sync reconciliation, preventing an older network reply
// from replacing a newer edit made while that request was in flight.
let operations=Promise.resolve();
function exclusive<T>(operation:()=>Promise<T>):Promise<T>{const next=operations.then(operation);operations=next.then(()=>undefined,()=>undefined);return next;}
export async function saveRecord(scope:string,kind:Kind,data:RecordData,deleted=false){
  if(!validateRecord(kind,data))throw new Error('入力内容を確認してください。');
  return exclusive(async()=>{const old=(await rows(scope)).find(r=>r.key===key(scope,kind,data.id));await write({key:key(scope,kind,data.id),kind,id:data.id,data,deleted,revision:old?.revision??0,pending:scope!=='guest',editId:crypto.randomUUID()});});
}
let syncing:Promise<void>|null=null;
export function synchronize(scope:string):Promise<void>{
  if(scope==='guest'||!navigator.onLine)return Promise.resolve();
  if(syncing)return syncing;
  syncing=(async()=>{
    const local=await rows(scope);
    for(const row of local.filter(r=>r.pending)){
      const response=await fetch(`/api/data/${row.kind}/${row.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:row.data,deleted:row.deleted,revision:row.revision,editId:row.editId}),signal:AbortSignal.timeout(15000)});
      if(response.status===401)throw new Error('再ログインすると、端末に保存した変更を同期できます。');
      if(response.status===409)throw new Error('他の端末で変更されています。設定から未同期データを書き出して保管してください。');
      if(!response.ok)throw new Error('端末に保存済みです。通信が戻ったら同期します。');
      const remote=await response.json() as {revision:number};
      await exclusive(async()=>{const current=(await rows(scope)).find(r=>r.key===row.key);if(current)await write({...current,revision:remote.revision,pending:current.editId!==row.editId});});
    }
    const response=await fetch('/api/data',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('保存済みのデータを表示しています。同期を再試行してください。');
    const result=await response.json() as {records:RemoteRow[]};
    await exclusive(async()=>{const current=await rows(scope);for(const remote of result.records){const k=key(scope,remote.kind,remote.id);if(!current.find(r=>r.key===k)?.pending&&validateRecord(remote.kind,remote.data))await write({...remote,key:k,pending:false,editId:crypto.randomUUID()});}});
  })().finally(()=>{syncing=null;});return syncing;
}
export function useRecords(scope:string){
  const [data,setData]=useState<Row[]>([]),[ready,setReady]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;const load=()=>{void rows(scope).then(v=>{if(active){setData(v);setReady(true);}}).catch(e=>{if(active)setError(String(e.message));});};load();window.addEventListener(eventName,load);return()=>{active=false;window.removeEventListener(eventName,load);};},[scope]);
  useEffect(()=>{let active=true;const sync=()=>{void synchronize(scope).then(()=>{if(active)setError('');}).catch(e=>{if(active)setError(e.message);});};sync();window.addEventListener('online',sync);const timer=setInterval(sync,30000);return()=>{active=false;clearInterval(timer);window.removeEventListener('online',sync);};},[scope]);
  async function save(kind:Kind,record:RecordData,deleted=false){await saveRecord(scope,kind,record,deleted);void synchronize(scope).catch(e=>setError(e.message));}
  return {rows:data.filter(r=>!r.deleted),allRows:data,ready,error,setError,save,pending:data.filter(r=>r.pending).length};
}
