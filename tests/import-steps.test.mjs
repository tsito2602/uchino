import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {newRecipe,validateRecord,removeRecipeStep} from '../src/domain.ts';
import {photoFixture} from './photo-fixture.mjs';
const built=await build({stdin:{contents:"export * from './worker/import-steps';export {importUrl,importAI} from './worker/import';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {schemaSteps,pageSteps,importUrl,importAI,importStepPhotos}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const first=photoFixture(10),third=photoFixture(20);
const recipe={...newRecipe(),title:'卵焼き',ingredients:[{name:'卵',quantity:'2',unit:'個',group:'A'}],steps:['混ぜる。','熱する。','焼く。']};
const schema={'@type':'Recipe',name:recipe.title,recipeYield:'2人分',recipeIngredient:['卵 2個'],recipeInstructions:[{'@type':'HowToSection',itemListElement:[{text:'混ぜる。',image:{url:'/1.jpg'}},{text:'熱する。'},{text:'焼く。',image:['/3.jpg']}]}]};
const raw=value=>({status:'completed',output_text:JSON.stringify({recipe:value,error:null})});
const env=run=>({AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{run}});
const image=photo=>new Response(Buffer.from(photo.split(',')[1],'base64'),{headers:{'content-type':'image/jpeg'}});
const html=()=>new Response(`<script type="application/ld+json">${JSON.stringify(schema)}</script>`,{headers:{'content-type':'text/html'}});

test('step photos round-trip with empty slots, preserve old records and follow deleted steps',()=>{
 assert.equal(validateRecord('recipe',recipe).stepPhotos,undefined);
 const value={...recipe,stepPhotos:[first,'',third]},saved=validateRecord('recipe',value);
 assert.deepEqual(saved.stepPhotos,value.stepPhotos);
 const removed=removeRecipeStep(saved,1);assert.deepEqual(removed.steps,['混ぜる。','焼く。']);assert.deepEqual(removed.stepPhotos,[first,third]);
 assert.deepEqual(removeRecipeStep(saved,0).stepPhotos,['',third]);assert.equal(removeRecipeStep(recipe,1).stepPhotos,undefined);
 for(const stepPhotos of [[first],null,[first,'','https://example.com/3.jpg'],[first,17,third]])assert.equal(validateRecord('recipe',{...recipe,stepPhotos}),null);
});

test('JSON-LD sections retain each step image without shifting across unillustrated steps',async t=>{
 assert.deepEqual(schemaSteps(schema.recipeInstructions).map(s=>s.images),[['/1.jpg'],[],['/3.jpg']]);
 t.mock.method(globalThis,'fetch',async url=>String(url).endsWith('/1.jpg')?image(first):String(url).endsWith('/3.jpg')?image(third):html());
 const result=await importUrl('https://example.com/recipe');
 assert.deepEqual(result.recipe.steps,recipe.steps);assert.deepEqual(result.stepPhotos.sort((a,b)=>a.index-b.index),[{index:0,photo:first},{index:2,photo:third}]);assert.equal(result.warnings,undefined);
});

test('semantic and Nadia-style HTML keep number, text and best observed image together',()=>{
 const html=`<nav><ol class="instructions"><li>広告<img src="/advert.jpg"></li></ol></nav>
 <section><h2>作り方</h2><ol class="CookingProcess-module__list">
 <li><div><span>1</span></div><div class="step-text"><p>200gの肉を切る。</p><img alt="レシピの工程1" src="/small.jpg" srcset="/small.jpg 1x, /large.jpg?a=1&amp;b=2 2x"></div></li>
 <li><span>2</span><p>混ぜる。</p><ul><li>粉を加える。</li></ul></li>
 <li><span>3</span><p>焼く。</p><img data-src="/3.jpg" src="data:image/gif;base64,aaa"></li>
 </ol></section>`;
 const steps=pageSteps(html);assert.equal(steps.length,3);assert.equal(steps[0].text,'200gの肉を切る。');assert.deepEqual(steps[0].images,['/large.jpg?a=1&b=2','/small.jpg']);assert.deepEqual(steps[1].images,[]);assert.match(steps[1].text,/粉を加える/);assert.deepEqual(steps[2].images,['/3.jpg']);
 assert.equal(pageSteps('<div itemtype="https://schema.org/HowToStep"><p itemprop="text">焼く。</p><img src="/step.jpg"></div>')[0].images[0],'/step.jpg');
});

test('AI source references attach photos correctly even if output steps are reordered',async t=>{
 t.mock.method(globalThis,'fetch',async url=>String(url).endsWith('/1.jpg')?image(first):String(url).endsWith('/3.jpg')?image(third):html());
 const result=await importUrl('https://example.com/recipe',{},env(async(_model,input)=>{
  assert.match(input.input[0].content[2].text,/1: 混ぜる。\n2: 熱する。\n3: 焼く。/);
  assert.ok(input.text.format.schema.properties.recipe.anyOf[0].required.includes('stepSources'));
  return raw({...recipe,steps:['焼く。','混ぜる。','熱する。'],stepSources:[3,1,2],issues:[]});
 }));
 assert.deepEqual(result.stepPhotos,[{index:0,photo:third},{index:1,photo:first}]);assert.equal(result.stepSources,undefined);
});

test('unknown, repeated and absent source references do not guess image associations',async t=>{
 const result=await importAI(env(async()=>raw({...recipe,stepSources:[3,3,999],issues:[]})),{text:'卵を混ぜて焼く'},{sourceSteps:schemaSteps(schema.recipeInstructions)});
 assert.deepEqual(result.stepSources,[3,null,null]);
 t.mock.method(globalThis,'fetch',async url=>String(url).endsWith('.jpg')?image(first):html());
 const missing=await importUrl('https://example.com/recipe',{},env(async()=>raw({...recipe,issues:[]})));
 assert.deepEqual(missing.stepPhotos,[]);assert.match(missing.warnings.join(''),/手順写真/);
});

test('a broken image does not lose text or shift the next image; private image URLs stay blocked',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async url=>{calls.push(String(url));return String(url).endsWith('/3.jpg')?image(third):new Response(null,{status:404});});
 const result=await importStepPhotos([{text:'a',images:['/1.jpg']},{text:'b',images:['https://127.0.0.1/private.jpg']},{text:'c',images:['/3.jpg']}],new URL('https://example.com/recipe'));
 assert.deepEqual([...result.results],[[3,third]]);assert.deepEqual(result.failed.sort(),[1,2]);assert.ok(calls.every(url=>!url.includes('127.0.0.1')));
 const controller=new AbortController();controller.abort();await assert.rejects(importStepPhotos([{text:'a',images:['/1.jpg']}],new URL('https://example.com'),controller.signal),{name:'AbortError'});
});
