import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['worker/import.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {parseRecipeSchema,importUrl}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('JSON-LD recipe sections retain ingredients and source',()=>{
 const data={'@graph':[{'@type':'Recipe',name:'Test',recipeYield:'4人分',recipeIngredient:['卵 2個'],recipeInstructions:[{'@type':'HowToSection',itemListElement:[{text:'焼く'}]}],totalTime:'PT1H10M'}]};
 const result=parseRecipeSchema(`<script type="application/ld+json">${JSON.stringify(data)}</script>`,'https://www.kurashiru.com/recipes/test');assert.equal(result.title,'Test');assert.equal(result.servings,4);assert.equal(result.minutes,70);assert.deepEqual(result.steps,['焼く']);assert.equal(result.ingredients[0].name,'卵 2個');
});
test('untrusted or private URL destinations cannot be fetched',async()=>{
 for(const url of ['http://localhost/','https://127.0.0.1/','https://example.com/','https://user:pass@www.kurashiru.com/','https://www.kurashiru.com:444/'])await assert.rejects(importUrl(url));
});
test('URL import keeps source evidence and flags unsplit quantities for review',async()=>{
 const previous=globalThis.fetch,phases=[];
 const schema={'@type':'Recipe',name:'卵焼き',recipeIngredient:['卵 2個'],recipeInstructions:['焼く']};
 globalThis.fetch=async()=>new Response(`<script type="application/ld+json">${JSON.stringify(schema)}</script>`,{headers:{'content-type':'text/html'}});
 try{
  const result=await importUrl('https://www.kurashiru.com/recipes/test',{onPhase:phase=>phases.push(phase)});
  assert.deepEqual(phases,['sorting','checking']);assert.match(result.source.text,/卵 2個/);
  assert.ok(result.issues.some(i=>i.field==='servings'));assert.ok(result.issues.some(i=>i.field==='ingredients.0.quantity'));
 }finally{globalThis.fetch=previous;}
});
