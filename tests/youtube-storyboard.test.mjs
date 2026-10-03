import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {photoFixture} from './photo-fixture.mjs';
import {videoId,videoUrl,description,videoRecipe,playerHtml,geminiResponse,storyboardSpec} from './youtube-fixture.mjs';
const built=await build({stdin:{contents:"export * from './worker/youtube-storyboard';export * from './worker/youtube-metadata';export * from './worker/import-youtube';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {youtubeStoryboard,storyboardFrame,importYouTubeStepPhotos,youtubeMetadata,importYouTube}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const board=youtubeStoryboard(storyboardSpec,videoId);

test('preview specification selects usable resolution and verifies the selected video and host',()=>{
 assert.equal(board.frameWidth,320);assert.equal(board.interval,5);assert.match(board.template,/storyboard3_L1\/M\$M.jpg\?sqp=test&sigh=signature$/);
 assert.deepEqual(youtubeMetadata(playerHtml(description,videoId,storyboardSpec),videoId).storyboard,board);
 for(const spec of [storyboardSpec.replace('i.ytimg.com','evil.test'),storyboardSpec.replace(videoId,'differentID'),storyboardSpec.replace('https:','http:'),storyboardSpec.replace('320#180','9000#180'),storyboardSpec.replace('5000#M$M','0#M$M')])assert.equal(youtubeStoryboard(spec,videoId),undefined);
});

test('frame coordinates use time within the correct sheet and never cross into the next step',()=>{
 assert.deepEqual(storyboardFrame(board,17,12,65),{url:board.template.replace('$M','0'),x:0,y:180,width:320,height:180});
 assert.deepEqual(storyboardFrame(board,68,65,180),{url:board.template.replace('$M','1'),x:640,y:180,width:320,height:180});
 assert.equal(storyboardFrame(board,44,40,44).url,board.template.replace('$M','0'));
 assert.equal(storyboardFrame(board,14,12,14),null); // No sampled frame inside this short step.
 assert.equal(storyboardFrame(board,999,170,180).y,360);
});

test('sheets are downloaded once and missing steps never shift later photos',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push(String(url));assert.equal(options.redirect,'manual');return new Response(Buffer.from(photoFixture().split(',')[1],'base64'),{headers:{'content-type':'image/jpeg'}});});
 const result=await importYouTubeStepPhotos(board,[12,null,25,65],[17,null,28,68],new URL(videoUrl),new AbortController().signal,180);
 assert.equal(calls.length,2);assert.deepEqual(result.stepPhotoSheets.map(s=>s.frames.map(f=>f.index)),[[0,2],[3]]);
 assert.equal(result.stepPhotoSheets[1].frames[0].x,640);assert.ok(result.warnings.length);
});

test('image refusal leaves the recipe usable and does not retry the video or invent images',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:403}));
 const result=await importYouTubeStepPhotos(board,[12,65],[17,68],new URL(videoUrl),new AbortController().signal,180);
 assert.equal(result.stepPhotoSheets,undefined);assert.ok(result.warnings.length);
 const controller=new AbortController();controller.abort();await assert.rejects(()=>importYouTubeStepPhotos(board,[12],[17],new URL(videoUrl),controller.signal),{name:'AbortError'});
});

test('text and timestamps come from the same scene even with a missing middle time or stale parallel arrays',async t=>{
 t.mock.method(globalThis,'fetch',async url=>String(url)===videoUrl?new Response(playerHtml(),{headers:{'content-type':'text/html'}}):new Response(null,{status:404}));
 const recipe={...videoRecipe,steps:[{text:'肉を切る。',startSeconds:12,photoSeconds:17},{text:'塩を振る。',startSeconds:null,photoSeconds:null},{text:'焼く。',startSeconds:65,photoSeconds:68}],stepVideoSeconds:[65,99,12]};
 const result=await importYouTube(videoUrl,{AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{run:async()=>assert.fail(),gateway:()=>({run:async request=>{
  const schema=request.query.generationConfig.responseJsonSchema.properties.recipe.anyOf[0];assert.equal(schema.properties.steps.items.type,'object');assert.equal(schema.properties.stepVideoSeconds,undefined);
  return Response.json(geminiResponse(recipe));
 }})}});
 assert.deepEqual(result.recipe.steps,['肉を切る。','塩を振る。','焼く。']);assert.deepEqual(result.recipe.stepVideoSeconds,[12,null,65]);
});

test('unknown or out-of-step photo times do not substitute an unrelated frame',async t=>{
 t.mock.method(globalThis,'fetch',async()=>assert.fail('No valid scene to download'));
 const result=await importYouTubeStepPhotos(board,[12,65],[68,null],new URL(videoUrl),new AbortController().signal,180);
 assert.equal(result.stepPhotoSheets,undefined);assert.ok(result.warnings.length);
});
