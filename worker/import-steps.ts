import {parseDocument,DomUtils} from 'htmlparser2';
import {recipeImageCandidates,importRecipePhoto} from './import-photo';
export type SourceStep={text:string;images:string[]};
type Element=ReturnType<typeof DomUtils.getElementsByTagName>[number];
const clean=(text:string)=>text.replace(/\s+/g,' ').trim();
const plain=(html:string)=>clean(DomUtils.textContent(parseDocument(html)));

export function schemaSteps(value:unknown):SourceStep[]{
  if(typeof value==='string')return value.split(/\n+/).filter(v=>v.trim()).map(text=>({text:plain(text),images:[]}));
  if(Array.isArray(value))return value.flatMap(schemaSteps).slice(0,100);
  if(!value||typeof value!=='object')return [];
  const item=value as Record<string,unknown>;
  if(item.itemListElement)return schemaSteps(item.itemListElement);
  return typeof item.text==='string'?[{text:plain(item.text),images:recipeImageCandidates('',item.image)}]:[];
}
const marker=(node:Element)=>[node.attribs.class,node.attribs.id,node.attribs.itemprop,node.attribs.itemtype].filter(Boolean).join(' ');
const isStep=(node:Element)=>/HowToStep/i.test(node.attribs.itemtype||'')||/(?:^|\s)(?:recipe[-_])?step(?:[-_]\d+)?(?:\s|$|__)/i.test(marker(node))||/^\d+$/.test(node.attribs['data-step']||'');
function instructionList(node:Element):boolean{
  let parent=node.parent;
  for(let depth=0;parent&&depth<4;depth++,parent=parent.parent){
    if(!('attribs' in parent))continue;
    if(/recipeInstructions|instruction|direction|cookingprocess|preparation|method|steps/i.test(marker(parent)))return true;
    if(['section','article'].includes(parent.name)){
      const headings=DomUtils.findAll(n=>/^h[1-4]$/.test(n.name),parent.children);
      if(headings.some(h=>/^(?:作り方|つくり方|手順|調理手順|方法|instructions|directions|method)/i.test(clean(DomUtils.textContent(h)))))return true;
      break;
    }
  }
  return false;
}
function imageSources(image:Element):string[]{
  const a=image.attribs;
  const srcset=(a['data-srcset']||a.srcset||'').split(',').map(v=>v.trim().split(/\s+/)).filter(v=>v[0]).sort((a,b)=>parseFloat(b[1]||'1')-parseFloat(a[1]||'1')).map(v=>v[0]);
  const link=image.parent&&'attribs' in image.parent&&image.parent.name==='a'?image.parent.attribs.href:undefined;
  return [...new Set([link&&/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(link)?link:undefined,...srcset,a['data-src'],a['data-original'],a.src].filter((v):v is string=>!!v&&!v.startsWith('data:')))];
}
function ancestor(parent:Element,node:Element){let next=node.parent;while(next){if(next===parent)return true;next=next.parent;}return false;}
export function pageSteps(html:string):SourceStep[]{
  const doc=parseDocument(html,{withStartIndices:true});
  for(const node of DomUtils.findAll(node=>['head','script','style','nav','footer','aside','form'].includes(node.name),doc.children))DomUtils.removeElement(node);
  const candidates=DomUtils.findAll(node=>isStep(node)||(node.name==='li'&&instructionList(node)),doc.children);
  // Image alt labels also identify numbered steps on pages without semantic markup.
  for(const image of DomUtils.getElementsByTagName('img',doc.children)){
    if(!/(?:工程|手順|step)\s*[0-9０-９]+/i.test(image.attribs.alt||''))continue;
    let parent=image.parent;
    for(let depth=0;parent&&depth<6;depth++,parent=parent.parent){
      if('attribs' in parent&&(parent.name==='li'||isStep(parent))){if(!candidates.includes(parent))candidates.push(parent);break;}
    }
  }
  return candidates.filter(node=>!candidates.some(other=>other!==node&&ancestor(other,node))).sort((a,b)=>(a.startIndex||0)-(b.startIndex||0)).slice(0,100).map(node=>{
    const first=node.children.find(child=>child.type!=='text'||child.data.trim());
    const number=first&&'children' in first?clean(DomUtils.textContent(first)):'';
    const raw=clean(DomUtils.textContent(node));
    const text=(/^[0-9０-９]+$/.test(number)?raw.slice(number.length):raw.replace(/^(?:(?:手順|工程|step)\s*)?[0-9０-９]+[.．、：:]\s*/i,'')).trim();
    return {text,images:[...new Set(DomUtils.getElementsByTagName('img',node.children).flatMap(imageSources))].slice(0,4)};
  }).filter(step=>!!step.text);
}

// Source IDs are one-based and assigned before AI extraction. Never infer a
// photo from the output's array position: AI may split, omit or reorder steps.
export async function importStepPhotos(steps:SourceStep[],url:URL,signal?:AbortSignal){
  const deadline=AbortSignal.any([AbortSignal.timeout(30000),...(signal?[signal]:[])]);
  const results=new Map<number,string>(),failed:number[]=[];let next=0,total=0;
  async function worker(){
    while(next<steps.length){
      const index=next++,step=steps[index];if(!step.images.length)continue;
      if(total>=12_000_000){failed.push(index+1);continue;}
      try{
        const result=await importRecipePhoto(step.images,url,deadline);
        if(!result.photo||total+result.photo.length>12_000_000){failed.push(index+1);continue;}
        total+=result.photo.length;results.set(index+1,result.photo);
      }catch{signal?.throwIfAborted();failed.push(index+1);}
    }
  }
  await Promise.all([worker(),worker(),worker()]);signal?.throwIfAborted();return {results,failed};
}
