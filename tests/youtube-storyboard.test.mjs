import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {photoFixture} from './photo-fixture.mjs';
import {videoId,videoUrl,description,videoRecipe,playerHtml,watchHtml,geminiResponse,storyboardSpec} from './youtube-fixture.mjs';
const built=await build({stdin:{contents:"export * from './worker/youtube-storyboard';export * from './worker/youtube-metadata';export * from './worker/import-youtube';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {youtubeStoryboard,storyboardFrame,importYouTubeStepPhotos,youtubeMetadata,fetchYouTubeMetadata,fetchYouTubeSource,importYouTube}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
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
 assert.equal(result.stepPhotoSheets,undefined);assert.match(result.warnings[0],/0 \/ 2件/);assert.deepEqual(result.stepPhotoDiagnostics,{total:2,attached:0,failures:[{step:1,code:'http_error',httpStatus:403},{step:2,code:'http_error',httpStatus:403}]});
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

test('page descriptions and player preview data merge in either order, including a player without text',async t=>{
 const partialPlayer=`<script>var ytInitialPlayerResponse = ${JSON.stringify({storyboards:{playerStoryboardSpecRenderer:{spec:storyboardSpec}}})};</script>`;
 for(const chunks of [[watchHtml(),partialPlayer],[partialPlayer,watchHtml()]]){
  await t.test(chunks[0]===partialPlayer?'preview first':'description first',async t=>{
   let cancelled=false;
   t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(new TextEncoder().encode(chunk));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/html'}}));
   const result=await fetchYouTubeMetadata({id:videoId,url:videoUrl},AbortSignal.timeout(1000),undefined,true);
   assert.equal(result.description,description);assert.deepEqual(result.storyboard,board);assert.equal(cancelled,true);
   assert.deepEqual(youtubeMetadata(chunks.join(''),videoId).storyboard,board);
  });
 }
 assert.equal(youtubeMetadata(watchHtml()+partialPlayer.replace(videoId,'differentID'),videoId).storyboard,undefined);
});

test('metadata survives an interrupted preview search instead of losing a readable description',async t=>{
 const encoder=new TextEncoder();let reads=0,cancelled=false;
 t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({pull(c){if(reads++===0)c.enqueue(encoder.encode(watchHtml()));else c.error(new Error('private network text'));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/html'}}));
 let diagnostic;
 const result=await fetchYouTubeMetadata({id:videoId,url:videoUrl},new AbortController().signal,value=>{diagnostic=value;},true);
 assert.equal(result.description,description);assert.equal(result.storyboard,undefined);assert.equal(diagnostic,undefined);
});

test('image content and missing timestamps produce specific step failures without URLs',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('<html>private upstream text</html>',{headers:{'content-type':'text/html'}}));
 const result=await importYouTubeStepPhotos(board,[12,null,65],[17,null,68],new URL(videoUrl),new AbortController().signal,180);
 assert.deepEqual(result.stepPhotoDiagnostics.failures,[{step:1,code:'not_image',httpStatus:200},{step:2,code:'time_unknown'},{step:3,code:'not_image',httpStatus:200}]);
 assert.ok(!JSON.stringify(result.stepPhotoDiagnostics).includes('private'));assert.ok(!JSON.stringify(result.stepPhotoDiagnostics).includes('https:'));
});

test('advertised numbered YouTube CDNs work without accepting lookalike or unrelated image URLs',()=>{
 for(const host of ['i.ytimg.com','i1.ytimg.com','i9.ytimg.com']){
  const spec=storyboardSpec.replace('i.ytimg.com',host);
  assert.equal(new URL(youtubeStoryboard(spec,videoId).template).hostname,host);
  assert.ok(youtubeStoryboard(spec.replace('https:',''),videoId));
 }
 for(const host of ['i9.ytimg.com.evil.test','evil.ytimg.com','i0.ytimg.com','localhost','127.0.0.1'])assert.equal(youtubeStoryboard(storyboardSpec.replace('i.ytimg.com',host),videoId),undefined);
});

test('bootstrap and config responses support object and JSON-string forms without executing scripts',()=>{
 const player={videoDetails:{videoId,title:'正しい動画',shortDescription:description},storyboards:{playerStoryboardSpecRenderer:{spec:storyboardSpec}}};
 for(const serialized of [JSON.stringify(player),JSON.stringify(JSON.stringify(player))]){
  for(const assignment of ['window.ytplayer.bootstrapPlayerResponse = VALUE;','ytplayer.config={args:{raw_player_response: VALUE}};', 'ytplayer.config={"args":{"player_response": VALUE}};']){
   const html='<script>'+assignment.replace('VALUE',serialized)+';globalThis.shouldNeverExecute=true;</script>';
   assert.deepEqual(youtubeMetadata(html,videoId).storyboard,board);
   assert.equal(youtubeMetadata(html,'otherVideo1'),null);assert.equal(globalThis.shouldNeverExecute,undefined);
  }
 }
});

const publicConfig=`<script>ytcfg.set(${JSON.stringify({INNERTUBE_CONTEXT:{client:{clientName:'WEB',clientVersion:'2.20261002.01.00',hl:'ja',gl:'JP',visitorData:'private-visitor'},user:{accessToken:'private-token'}},INNERTUBE_API_KEY:'private-key'})});</script>`;
const deferredPage=()=>watchHtml().replace('<script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"UNPLAYABLE"}};</script>','')+publicConfig;
const playerResponse=()=>({videoDetails:{videoId,title:'Player title',shortDescription:'Player text',lengthSeconds:'180'},playabilityStatus:{status:'OK'},storyboards:{playerStoryboardSpecRenderer:{spec:storyboardSpec.replace('i.ytimg.com','i9.ytimg.com')}}});

test('deferred previews come from one normal public player request using only the page WEB context',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls.push(String(url));assert.equal(options.redirect,'manual');
  if(String(url)===videoUrl)return new Response(deferredPage(),{headers:{'content-type':'text/html'}});
  assert.equal(String(url),'https://www.youtube.com/youtubei/v1/player');assert.equal(options.method,'POST');
  assert.deepEqual(JSON.parse(options.body),{context:{client:{clientName:'WEB',clientVersion:'2.20261002.01.00',hl:'ja',gl:'JP'}},videoId});
  assert.ok(!JSON.stringify(options).includes('private'));return Response.json(playerResponse());
 });
 const result=await fetchYouTubeSource({id:videoId,url:videoUrl},AbortSignal.timeout(1000));
 assert.equal(calls.length,2);assert.equal(result.metadata.description,description);assert.equal(result.seconds,180);
 assert.equal(new URL(result.storyboard.template).hostname,'i9.ytimg.com');assert.equal(result.storyboardDiagnostics,undefined);
});

test('preview-only metadata still reaches step image importing when the description is absent',async t=>{
 const partial=`<script>window.ytplayer.bootstrapPlayerResponse=${JSON.stringify({storyboards:{playerStoryboardSpecRenderer:{spec:storyboardSpec}}})};</script>`;
 t.mock.method(globalThis,'fetch',async url=>String(url)===videoUrl?new Response(partial,{headers:{'content-type':'text/html'}}):new Response(Buffer.from(photoFixture().split(',')[1],'base64'),{headers:{'content-type':'image/jpeg'}}));
 const result=await importYouTube(videoUrl,{AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{gateway:()=>({run:async()=>Response.json(geminiResponse())})}});
 assert.equal(result.sourceDiagnostics.code,'metadata_missing');assert.equal(result.stepPhotoDiagnostics.attached,2);assert.equal(result.stepPhotoSheets.length,2);
});

test('page refusals never trigger a different client or alternate request',async t=>{
 for(const status of ['LOGIN_REQUIRED','UNPLAYABLE','CONTENT_CHECK_REQUIRED'])await t.test(status,async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(deferredPage()+`<script>var ytInitialPlayerResponse=${JSON.stringify({playabilityStatus:{status,reason:'private denial text'}})}</script>`,{headers:{'content-type':'text/html'}});});
  const result=await fetchYouTubeSource({id:videoId,url:videoUrl},AbortSignal.timeout(1000));
  assert.equal(calls,1);assert.equal(result.metadata.description,description);assert.equal(result.storyboardDiagnostics.code,'player_unavailable');assert.equal(result.storyboardDiagnostics.playabilityStatus,status);
  assert.ok(!JSON.stringify(result.storyboardDiagnostics).includes('private'));
 });
});

test('a missing spec, rejected format, and player HTTP error are distinguishable without response contents',async t=>{
 for(const [html,code] of [[playerHtml(),'spec_missing'],[playerHtml(description,videoId,storyboardSpec.replace('i.ytimg.com','evil.test')),'spec_unsupported']])await t.test(code,async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(html,{headers:{'content-type':'text/html'}}));
  const result=await fetchYouTubeSource({id:videoId,url:videoUrl},AbortSignal.timeout(1000));assert.equal(result.storyboardDiagnostics.code,code);
 });
 await t.test('HTTP failure',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>++calls===1?new Response(deferredPage(),{headers:{'content-type':'text/html'}}):new Response('private upstream text',{status:403}));
  const result=await fetchYouTubeSource({id:videoId,url:videoUrl},AbortSignal.timeout(1000));
  assert.equal(calls,2);assert.equal(result.storyboardDiagnostics.stage,'player');assert.equal(result.storyboardDiagnostics.code,'http_error');assert.equal(result.storyboardDiagnostics.httpStatus,403);
  assert.equal(result.metadata.description,description);assert.ok(!JSON.stringify(result.storyboardDiagnostics).includes('private'));
 });
});

test('player responses for another video and refused playback never attach images or retry',async t=>{
 for(const [body,code] of [[{...playerResponse(),videoDetails:{videoId:'differentID'}},'invalid_response'],[{playabilityStatus:{status:'LOGIN_REQUIRED',reason:'private'}},'player_unavailable']])await t.test(code,async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>++calls===1?new Response(deferredPage(),{headers:{'content-type':'text/html'}}):Response.json(body));
  const result=await fetchYouTubeSource({id:videoId,url:videoUrl},AbortSignal.timeout(1000));assert.equal(calls,2);assert.equal(result.storyboard,undefined);assert.equal(result.storyboardDiagnostics.code,code);
 });
});
