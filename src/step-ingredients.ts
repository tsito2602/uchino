import type {Ingredient} from './domain';

import {namedIn} from './ingredient-match';

// Which ingredients a step uses: those it names (see ingredient-match), those
// in a group it names ("Aを加える") and those of an earlier step it refers
// back to ("1を加え").
const width=(text:string)=>text.normalize('NFKC');

const groupLabel=(group:string)=>width(group).replace(/[【】\[\]()（）〈〉<>]/g,'').trim();
const groupPattern=(label:string)=>new RegExp(/^[A-Za-z]$/.test(label)?`(?<![A-Za-z])${label}(?![A-Za-z])`:label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');
// "1を加え" / "2と合わせる": a number that refers back to an earlier step.
const STEP_REF=/(?<![0-9.])([1-9][0-9]?)(?=を|と|に|へ|も|の(?:鍋|フライパン|ボウル|器))/g;

const named=(ingredients:Ingredient[],text:string)=>namedIn(ingredients.map(ingredient=>ingredient.name),text);
const groupsIn=(ingredients:Ingredient[],text:string)=>[...new Set(ingredients.map(i=>i.group?groupLabel(i.group):'').filter(label=>label&&groupPattern(label).test(text)))];

export type StepReference={kind:'step';label:string;step:number;items:number[]}|{kind:'group';label:string;items:number[]};
export type StepUsage={direct:number[];references:StepReference[]};

// What a step uses: ingredients it names, and those it refers to through an
// earlier step's number or a group's label, each kept apart so the cook can
// see what "1" or "A" means.
export function stepUsage(ingredients:Ingredient[],steps:string[],index:number):StepUsage{
  const text=width(steps[index]??'');
  const direct=named(ingredients,text).flatMap((hit,i)=>hit?[i]:[]),seen=new Set(direct),references:StepReference[]=[];
  for(const label of groupsIn(ingredients,text)){
    const items=ingredients.flatMap((ingredient,i)=>ingredient.group&&groupLabel(ingredient.group)===label&&!seen.has(i)?[i]:[]);
    items.forEach(i=>seen.add(i));if(items.length)references.push({kind:'group',label,items});
  }
  for(const match of text.matchAll(STEP_REF)){
    const step=Number(match[1])-1;if(step<0||step>=index||references.some(r=>r.kind==='step'&&r.step===step))continue;
    const items=stepIngredients(ingredients,steps,step).filter(i=>!seen.has(i));
    items.forEach(i=>seen.add(i));references.push({kind:'step',label:String(step+1),step,items});
  }
  return {direct,references};
}

// Indexes into ingredients that a step names or groups, in recipe order (no step references).
function own(ingredients:Ingredient[],steps:string[],index:number){
  const text=width(steps[index]??''),groups=groupsIn(ingredients,text),hits=named(ingredients,text);
  return ingredients.flatMap((ingredient,i)=>hits[i]||ingredient.group&&groups.includes(groupLabel(ingredient.group))?[i]:[]);
}
export function stepIngredients(ingredients:Ingredient[],steps:string[],index:number){
  const used=new Set(own(ingredients,steps,index));
  for(const match of width(steps[index]??'').matchAll(STEP_REF)){const step=Number(match[1])-1;if(step>=0&&step<index)own(ingredients,steps,step).forEach(i=>used.add(i));}
  return [...used].sort((a,b)=>a-b);
}

// The step's text with its references marked, for showing them as badges.
export type ReferencePart={text:string;reference?:{kind:'step'|'group';label:string}};
export function splitReferences(text:string,usage:StepUsage):ReferencePart[]{
  const marks:{start:number;end:number;kind:'step'|'group';label:string}[]=[];
  for(const reference of usage.references){
    const pattern=reference.kind==='step'?new RegExp(`(?<![0-9.])${reference.label}(?=を|と|に|へ|も|の(?:鍋|フライパン|ボウル|器))`,'g'):groupPattern(reference.label);
    for(const match of text.matchAll(pattern))marks.push({start:match.index,end:match.index+match[0].length,kind:reference.kind,label:reference.label});
  }
  marks.sort((a,b)=>a.start-b.start);
  const parts:ReferencePart[]=[];let last=0;
  for(const mark of marks){if(mark.start<last)continue;if(mark.start>last)parts.push({text:text.slice(last,mark.start)});parts.push({text:text.slice(mark.start,mark.end),reference:{kind:mark.kind,label:mark.label}});last=mark.end;}
  if(last<text.length)parts.push({text:text.slice(last)});
  return parts;
}
