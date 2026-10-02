import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({stdin:{contents:"export * from './worker/import-photo';export {importUrl} from './worker/import';export {importedPhotoBlob} from './src/import-photo';export {readImport} from './src/import-client';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {recipeImageCandidates,importRecipePhoto,importUrl,importedPhotoBlob,readImport}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const source=new URL('https://www.kikkoman.co.jp/homecook/recipe/test.html');
const bytes=Uint8Array.from([255,216,255,0,0,255,217]);
const image=()=>new Response(bytes,{headers:{'content-type':'image/jpeg'}});

test('recipe image metadata accepts strings, arrays, ImageObject and OG fallback',()=>{
 const html='<meta content="/fallback.jpg?a=1&amp;b=2" property="og:image">';
 for(const value of ['/dish.jpg',['/dish.jpg'],{'@type':'ImageObject',url:'/dish.jpg'},[{contentUrl:'/dish.jpg'}]])assert.deepEqual(recipeImageCandidates(html,value),['/dish.jpg','/fallback.jpg?a=1&b=2']);
 assert.deepEqual(recipeImageCandidates(html,null),['/fallback.jpg?a=1&b=2']);
});

test('the visible recipe photo wins over a cropped sharing image without rewriting source URLs',()=>{
 const html=`<meta property="og:image" content="https://images.example.org/dish.jpg?impolicy=cropwm&amp;w=1200&amp;h=630">
 <nav><img src="https://images.example.org/dish.jpg?w=100&amp;h=100"></nav>
 <div class="RecipeMainImage-module__modalImage"><img width="500" height="500" src="https://images.example.org/dish.jpg?impolicy=cropwm&amp;w=500&amp;h=500" srcset="https://images.example.org/dish.jpg?impolicy=cropwm&amp;w=800&amp;h=800 800w, https://images.example.org/dish.jpg?impolicy=cropwm&amp;w=1280&amp;h=1280 1280w, https://images.example.org/dish.jpg?impolicy=cropwm&amp;w=2560&amp;h=2560 2560w"></div>
 <div class="CookingProcess__image"><img alt="料理の工程1" src="https://images.example.org/step.jpg"></div>`;
 assert.deepEqual(recipeImageCandidates(html,null,source),[
  'https://images.example.org/dish.jpg?impolicy=cropwm&w=1280&h=1280',
  'https://images.example.org/dish.jpg?impolicy=cropwm&w=500&h=500',
 ]);
});

test('semantic recipe images are supported while proxy image identities and unrelated pictures stay distinct',()=>{
 assert.equal(recipeImageCandidates('<article itemtype="https://schema.org/Recipe"><img itemprop="image" src="/original.jpg"></article>',null,source)[0],'/original.jpg');
 const html='<img src="/image?id=advert&w=800"><img src="/image?id=dish&w=800"><meta property="og:image" content="/image?id=dish&w=1200&h=630">';
 assert.equal(recipeImageCandidates(html,null,source)[0],'/image?id=dish&w=800');
 assert.deepEqual(recipeImageCandidates('<img src="/advert.jpg"><img alt="工程1" src="/step.jpg">',null,source),[]);
});

test('a URL import carries the source photo as bounded transient image data',async t=>{
 const schema={'@type':'Recipe',name:'たれ焼き',recipeYield:'2人分',recipeIngredient:['A 砂糖 小さじ2'],recipeInstructions:['Aを混ぜる。'],image:[{url:'/dish.jpg'}]};
 const requests=[];
 t.mock.method(globalThis,'fetch',async url=>{requests.push(String(url));return String(url).endsWith('dish.jpg')?image():new Response(`<script type="application/ld+json">${JSON.stringify(schema)}</script>`,{headers:{'content-type':'text/html'}});});
 const result=await importUrl(source.href);
 assert.deepEqual(requests,[source.href,'https://www.kikkoman.co.jp/dish.jpg']);
 assert.equal(result.recipe.photo,'','Only browser-compressed data belongs in the saved recipe');
 assert.equal(result.recipe.ingredients[0].group,'A');assert.equal(importedPhotoBlob(result.photo).type,'image/jpeg');assert.equal(result.warnings,undefined);
});

test('private, credentialed and redirected image URLs are never fetched',async t=>{
 const requests=[];
 t.mock.method(globalThis,'fetch',async url=>{requests.push(String(url));return new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}});});
 for(const candidate of ['https://127.0.0.1/','file:///a.jpg','https://www.kikkoman.co.jp.evil.test/a.jpg','https://user:pass@www.kikkoman.co.jp/a.jpg','https://www.kikkoman.co.jp:999/a.jpg']){
  const result=await importRecipePhoto([candidate],source);assert.equal(result.photo,undefined);assert.ok(result.warnings.length);
 }
 assert.equal(requests.length,0);
 await importRecipePhoto(['/redirect.jpg'],source);assert.deepEqual(requests,['https://www.kikkoman.co.jp/redirect.jpg']);
});

test('invalid or oversized images fall back without failing recipe import',async t=>{
 let response;
 t.mock.method(globalThis,'fetch',async()=>response());
 for(response of [()=>new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}),()=>new Response('<html/>',{headers:{'content-type':'image/jpeg'}}),()=>new Response(bytes,{headers:{'content-type':'image/jpeg','content-length':'3000001'}}),()=>new Response(new Uint8Array(3000001),{headers:{'content-type':'image/jpeg'}}),()=>new Response(null,{status:404})]){
  const result=await importRecipePhoto(['/dish.jpg'],source);assert.equal(result.photo,undefined);assert.ok(result.warnings.length);
 }
 let count=0;response=()=>++count===1?new Response(null,{status:404}):image();
 assert.ok((await importRecipePhoto(['/missing.jpg','/fallback.jpg'],source)).photo);
});

test('photo cancellation cancels an in-progress body and discards late results',async t=>{
 const controller=new AbortController();let entered,cancelled=false;
 const reading=new Promise(resolve=>entered=resolve);
 t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({pull(){entered();return new Promise(()=>{});},cancel(){cancelled=true;}},{highWaterMark:0}),{headers:{'content-type':'image/jpeg'}}));
 const operation=importRecipePhoto(['/dish.jpg'],source,controller.signal);await reading;controller.abort();
 await assert.rejects(operation,{name:'AbortError'});assert.equal(cancelled,true);
});

test('streamed imports accept larger source photos and reject unsafe photo representations',async t=>{
 const photoBytes=new Uint8Array(900000);photoBytes.set(bytes.subarray(0,3));photoBytes.set([255,217],photoBytes.length-2);
 const photo='data:image/jpeg;base64,'+Buffer.from(photoBytes).toString('base64');
 const recipe={id:'test',title:'料理',category:'主菜',servings:2,minutes:null,ingredients:[{name:'醤油',quantity:'1',unit:'大さじ',group:'A'}],steps:['Aを混ぜる'],memo:'',sourceUrl:source.href,favorite:false,createdAt:new Date().toISOString(),photo:''};
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({type:'result',result:{recipe,photo,issues:[]}})+'\n'));
 const result=await readImport({url:source.href},false,new AbortController().signal,()=>{});
 assert.equal(importedPhotoBlob(result.photo).size,900000);assert.equal(result.recipe.ingredients[0].group,'A');
 for(const value of ['https://127.0.0.1/a.jpg','data:image/svg+xml;base64,PHN2Zy8+','data:image/jpeg;base64,PGh0bWwvPg=='])assert.throws(()=>importedPhotoBlob(value));
});

test('images and image redirects can use any public CDN without registration',async t=>{
 const requests=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(options.redirect,'manual');requests.push(String(url));return String(url).endsWith('redirect.jpg')?new Response(null,{status:302,headers:{Location:'https://images.example.org/dish.jpg'}}):image();});
 const result=await importRecipePhoto(['https://asset.oceans-nadia.com/redirect.jpg'],new URL('https://oceans-nadia.com/user/22780/recipe/186141'));
 assert.equal(importedPhotoBlob(result.photo).type,'image/jpeg');assert.deepEqual(requests,['https://asset.oceans-nadia.com/redirect.jpg','https://images.example.org/dish.jpg']);
});
