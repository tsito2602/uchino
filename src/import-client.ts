import {validateRecord} from './domain';
import {importIssues,type ImportEvent,type ImportPhase,type ImportResult} from './import-model';
import {ImportFailure,type ImportDiagnostics} from './import-errors';

export async function readImport(input:object,demo:boolean,signal:AbortSignal,onPhase:(phase:ImportPhase)=>void):Promise<ImportResult> {
  const response=await fetch(demo?'/api/import/demo':'/api/import',{method:'POST',headers:{'Content-Type':'application/json',Accept:demo?'application/json':'application/x-ndjson'},body:JSON.stringify(input),signal});
  if(!response.ok){const error=await response.json() as {error?:string;diagnostics?:ImportDiagnostics};throw new ImportFailure(error.error||'読み取れませんでした。',error.diagnostics);}
  let result:ImportResult|undefined;
  if(demo)result=await response.json() as ImportResult;
  else {
    const reader=response.body?.getReader();if(!reader)throw new Error('読み取り結果を受信できませんでした。');
    const decoder=new TextDecoder();let pending='';
    const receive=(line:string)=>{if(!line.trim())return;const event=JSON.parse(line) as ImportEvent;if(event.type==='error')throw new ImportFailure(event.error,event.diagnostics);if(event.type==='phase')onPhase(event.phase);if(event.type==='result')result=event.result;};
    try{while(true){const {value,done}=await reader.read();pending+=done?decoder.decode():decoder.decode(value,{stream:true});if(pending.length>1_000_000)throw new Error('読み取り結果が大きすぎます。');const lines=pending.split('\n');pending=lines.pop()!;lines.forEach(receive);if(done){receive(pending);break;}}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  signal.throwIfAborted();
  const recipe=validateRecord('recipe',result?.recipe);
  if(!recipe||!result||demo&&result.demo!==true)throw new Error('読み取った内容を確認できませんでした。');
  return {...result,recipe:recipe as ImportResult['recipe'],issues:importIssues(recipe as ImportResult['recipe'],result.issues)};
}

export function importPause(ms:number,signal:AbortSignal){
  signal.throwIfAborted();
  return new Promise<void>((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
    signal.addEventListener('abort',abort,{once:true});
  });
}
