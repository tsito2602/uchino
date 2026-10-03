import {useEffect,useState} from 'react';
import {ClipboardPaste,Link,Play} from 'lucide-react';

type Suggestion={url:string}|{paste:true};
export function copiedRecipeUrl(text:string):string|null {
  const candidate=text.trim().match(/https?:\/\/\S+/)?.[0];if(!candidate||candidate.length>2048)return null;
  try{const url=new URL(candidate);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname!==location.hostname?url.href:null;}catch{return null;}
}
const isVideo=(url:string)=>/(^|\.)(youtube\.com|youtu\.be)$/.test(new URL(url).hostname);
async function readAllowed(){
  try{return (await navigator.permissions?.query({name:'clipboard-read' as PermissionName}))?.state==='granted';}catch{return false;}
}
// Browsers that already allow clipboard reads show the copied URL itself.
// Others (iPhone PWAs) offer a paste action, because reading needs a tap there.
export function ClipboardLink({disabled,onUse}:{disabled:boolean;onUse:(url:string)=>void}){
  const [suggestion,setSuggestion]=useState<Suggestion|null>(null),[missing,setMissing]=useState('');
  useEffect(()=>{
    let active=true;if(!navigator.clipboard?.readText)return;
    void readAllowed().then(async allowed=>{
      if(!allowed){if(active)setSuggestion({paste:true});return;}
      const url=copiedRecipeUrl(await navigator.clipboard.readText().catch(()=>''));if(active)setSuggestion(url?{url}:null);
    });
    return()=>{active=false;};
  },[]);
  if(!suggestion)return null;
  const url='url' in suggestion?suggestion.url:null;
  async function paste(){
    try{const found=copiedRecipeUrl(await navigator.clipboard.readText());if(found){onUse(found);return;}setMissing('コピーしたレシピのURLが見つかりませんでした');}
    catch{setMissing('クリップボードを読み取れませんでした');}
  }
  return <section className="clipboard-link" aria-label="コピーしたリンクの取り込み">
    <div className="clipboard-link-copy"><span className={`clipboard-link-icon${url&&isVideo(url)?' is-video':''}`} aria-hidden="true">{url?isVideo(url)?<Play size={22} fill="currentColor"/>:<Link size={22}/>:<ClipboardPaste size={22}/>}</span><div><h3>コピーしたリンクを使う？</h3><p>{missing||(url?url.replace(/^https?:\/\/(www\.)?/,''):'コピーしたURLを貼り付けます')}</p></div></div>
    <div className="clipboard-link-actions"><button type="button" className="clipboard-link-use" disabled={disabled} onClick={()=>url?onUse(url):void paste()}>{url?'このURLを使う':'ペーストする'}</button><button type="button" className="clipboard-link-later" disabled={disabled} onClick={()=>setSuggestion(null)}>あとで</button></div>
  </section>;
}
