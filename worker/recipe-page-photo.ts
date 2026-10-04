import {parseDocument,DomUtils} from 'htmlparser2';
type Element=ReturnType<typeof DomUtils.getElementsByTagName>[number];

// Compare the asset, not a CDN's resize/crop parameters. Return only URLs that
// actually occur in the page; never invent an uncropped URL by stripping them.
function asset(url:string,source?:URL):string {
  try{
    const value=new URL(url,source||'https://recipe.invalid');
    for(const key of ['w','h','width','height','fit','crop','impolicy','q','quality','format','fm','auto','dpr'])value.searchParams.delete(key);
    value.hash='';value.searchParams.sort();return value.href;
  }catch{return '';}
}
function sources(node:Element):string[]{
  const a=node.attribs,baseWidth=Number(a.width)||1;
  const variants=(a['data-srcset']||a.srcset||'').split(',').map(value=>{
    const [url,descriptor='1x']=value.trim().split(/\s+/);
    return {url,width:parseFloat(descriptor)*(descriptor.endsWith('x')?baseWidth:1)};
  }).filter(v=>v.url&&Number.isFinite(v.width)&&v.width>0);
  const within=variants.filter(v=>v.width<=1280).sort((a,b)=>b.width-a.width);
  const larger=variants.filter(v=>v.width>1280).sort((a,b)=>a.width-b.width);
  // One suitable responsive variant and the page's ordinary image are enough
  // for fallback; repeatedly fetching every size wastes the import deadline.
  return [...new Set([(within[0]||larger[0])?.url,a['data-src'],a['data-original'],a.src].filter((v):v is string=>!!v&&!v.startsWith('data:')))];
}
export function pageRecipePhotos(html:string,references:string[],source?:URL):string[]{
  if(!html)return [];
  const doc=parseDocument(html),known=new Set(references.map(url=>asset(url,source)).filter(Boolean));
  const photos=DomUtils.getElementsByTagName('img',doc.children).map(node=>{
    const urls=sources(node);let score=urls.some(url=>known.has(asset(url,source)))?100:0;
    let parent:Element|null=node,depth=0;
    while(parent){
      const marker=[parent.attribs.class,parent.attribs.id,parent.attribs.itemtype].filter(Boolean).join(' ');
      if(['nav','footer','aside'].includes(parent.name)||/HowToStep|CookingProcess|(?:^|[\s_-])(?:steps?|instructions?|related|recommendations?)(?:[\s_-]|$)/i.test(marker))return {score:0,urls};
      if(depth<3&&/recipe[-_ ]?(?:main[-_ ]?)?(?:image|photo|hero)|main[-_ ]?recipe[-_ ]?image/i.test(marker))score+=50;
      if(/(?:^|\s)image(?:\s|$)/.test(node.attribs.itemprop||'')&&/schema\.org\/Recipe/.test(marker))score+=80;
      parent=parent.parent&&'attribs' in parent.parent?parent.parent:null;depth++;
    }
    if(/(?:工程|手順|step)\s*[0-9０-９]+/i.test(node.attribs.alt||''))score=0;
    if(score&&Number(node.attribs.width)>=300)score+=10;
    return {score,urls};
  }).filter(p=>p.score>0&&p.urls.length).sort((a,b)=>b.score-a.score);
  return photos[0]?.urls.slice(0,2)||[];
}
