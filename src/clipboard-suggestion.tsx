import {useCallback,useEffect,useRef,useState} from 'react';
import {ClipboardPaste,Link} from 'lucide-react';
import {StudioActionLabel} from './studio-action-label';

type Suggestion={url:string}|{paste:true};
const DISMISSED='uchino-clipboard-dismissed',RETURN_AFTER_MS=10_000;
export function clipboardRecipeUrl(text:string):string|null {
  const candidate=text.trim().match(/https?:\/\/\S+/)?.[0];if(!candidate||candidate.length>2048)return null;
  try{const url=new URL(candidate);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname!==location.hostname?url.href:null;}catch{return null;}
}
const dismissed=()=>{try{const value=JSON.parse(localStorage.getItem(DISMISSED)||'[]');return Array.isArray(value)?value as string[]:[];}catch{return [];}};
async function readGranted(){
  try{const status=await navigator.permissions?.query({name:'clipboard-read' as PermissionName});return status?.state==='granted';}catch{return false;}
}
// Browsers that already allow clipboard reads get the copied URL proactively.
// Others (iPhone PWAs) show a paste action, because reading needs a tap there.
export function useClipboardSuggestion({enabled,knownUrls}:{enabled:boolean;knownUrls:string[]}){
  const [suggestion,setSuggestion]=useState<Suggestion|null>(null),hiddenAt=useRef(0);
  const known=useRef(knownUrls);known.current=knownUrls;
  const fresh=useCallback((url:string)=>!known.current.includes(url)&&!dismissed().includes(url),[]);
  const check=useCallback(async()=>{
    if(!navigator.clipboard?.readText)return;
    if(await readGranted()){try{const url=clipboardRecipeUrl(await navigator.clipboard.readText());setSuggestion(url&&fresh(url)?{url}:null);}catch{setSuggestion(null);}return;}
    setSuggestion({paste:true});
  },[fresh]);
  useEffect(()=>{
    if(!enabled){setSuggestion(null);return;}
    void check();
    const visibility=()=>{if(document.hidden){hiddenAt.current=Date.now();return;}if(hiddenAt.current&&Date.now()-hiddenAt.current>=RETURN_AFTER_MS)void check();};
    document.addEventListener('visibilitychange',visibility);
    return()=>document.removeEventListener('visibilitychange',visibility);
  },[enabled,check]);
  const dismiss=()=>{if(suggestion&&'url' in suggestion){try{localStorage.setItem(DISMISSED,JSON.stringify([suggestion.url,...dismissed()].slice(0,20)));}catch{}}setSuggestion(null);};
  return {suggestion:enabled?suggestion:null,dismiss};
}
export function ClipboardSuggestion({suggestion,onImport,onDismiss,onMissing}:{suggestion:Suggestion;onImport:(url:string)=>void;onDismiss:()=>void;onMissing:(message:string)=>void}){
  const url='url' in suggestion?suggestion.url:null;
  async function paste(){
    try{const found=clipboardRecipeUrl(await navigator.clipboard.readText());if(found){onImport(found);return;}onMissing('コピーしたレシピのURLが見つかりませんでした');}
    catch{onMissing('クリップボードを読み取れませんでした');}
  }
  return <section className="clipboard-suggestion" aria-label="コピーしたリンクの取り込み">
    <div className="clipboard-suggestion-copy"><span className="clipboard-suggestion-icon" aria-hidden="true">{url?<Link size={20}/>:<ClipboardPaste size={20}/>}</span><div><h2>{url?'コピーしたリンクを取り込む？':'コピーしたレシピを取り込む？'}</h2><p>{url?url.replace(/^https?:\/\/(www\.)?/,''):'レシピのURLをコピーしていれば、そのまま取り込めます'}</p></div></div>
    <div className="clipboard-suggestion-actions"><button type="button" className="studio-action" onClick={()=>url?onImport(url):void paste()}><StudioActionLabel label={url?'AIで取り込む':'ペーストして取り込む'}/></button><button type="button" className="clipboard-suggestion-later" onClick={onDismiss}>あとで</button></div>
  </section>;
}
