import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {videoId,videoUrl,description,videoRecipe,playerHtml,watchHtml,watchData,geminiResponse} from './youtube-fixture.mjs';
import {photoFixture} from './photo-fixture.mjs';
const built=await build({stdin:{contents:"export * from './worker/import';export * from './worker/import-youtube';export * from './worker/youtube-metadata';export * from './src/youtube';export * from './src/domain';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {importUrl,importYouTube,youtubeMetadata,fetchYouTubeMetadata,youtubeVideo,youtubeStepUrl,geminiOutput,validateRecord,removeRecipeStep}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const env=respond=>({AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{
 run:async()=>{assert.fail('YouTube must use the provider-native Generate Content endpoint');},
 gateway(id){assert.equal(id,'uchino');return {async run(request,options){
  assert.equal(request.provider,'google-ai-studio');assert.equal(request.endpoint,'v1beta/models/gemini-3.8-flash:generateContent');
  assert.deepEqual(request.headers,{'Content-Type':'application/json'});assert.deepEqual(options.gateway,{skipCache:true,collectLog:false});
  assert.ok(options.signal instanceof AbortSignal);
  const result=await respond(request.query,options);return result instanceof Response?result:Response.json(result);
 }};},
}});
function source(t,html=playerHtml()){
 const requests=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  requests.push(String(url));assert.equal(options.redirect,'manual');
  if(String(url)===videoUrl)return new Response(html,{headers:{'content-type':'text/html'}});
  if(String(url)===`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`)return new Response(null,{status:404});
  if(String(url)===`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`)return new Response(Buffer.from(photoFixture().split(',')[1],'base64'),{headers:{'content-type':'image/jpeg'}});
  throw new Error('Unexpected URL');
 });
 return requests;
}

test('YouTube watch, shared, mobile, Shorts and embed links normalize without tracking or start offsets',()=>{
 for(const url of [videoUrl+'&t=20&list=xyz',`https://youtu.be/${videoId}?si=tracking`,`https://m.youtube.com/watch?v=${videoId}`,`https://www.youtube.com/shorts/${videoId}`,`http://youtube.com/live/${videoId}`,`https://www.youtube-nocookie.com/embed/${videoId}`])assert.deepEqual(youtubeVideo(url),{id:videoId,url:videoUrl});
 for(const url of ['https://youtube.com.evil.test/watch?v=abcdefghijk','https://youtube.com@evil.test/watch?v=abcdefghijk','https://user:pass@youtube.com/watch?v=abcdefghijk','https://youtube.com:444/watch?v=abcdefghijk','https://youtube.com/playlist?list=abcdefghijk','https://youtube.com/@chef','https://youtu.be/short','javascript:alert(1)'])assert.equal(youtubeVideo(url),null,url);
 assert.equal(youtubeStepUrl(videoUrl,0),videoUrl+'&t=0s');assert.equal(youtubeStepUrl(videoUrl,65),videoUrl+'&t=65s');assert.equal(youtubeStepUrl(videoUrl,-1),null);assert.equal(youtubeStepUrl('https://elsewhere.test/',65),null);
});

test('metadata reads only the requested video and safely handles braces and escaped quotes in descriptions',()=>{
 const text='材料 {A}\n卵 "2個"\n工程の説明';assert.deepEqual(youtubeMetadata(playerHtml(text),videoId),{title:'卵焼きの作り方',description:text,seconds:180});
 assert.equal(youtubeMetadata(playerHtml(text,'differentID'),videoId),null);
 assert.equal(youtubeMetadata(playerHtml().slice(0,80),videoId),null);
 assert.equal(youtubeMetadata('<html>Consent or blocked</html>',videoId),null);
});

test('metadata survives a large watch page and returns before an unrelated stalled tail',async t=>{
 const encoder=new TextEncoder();let cancelled=false;
 const html=encoder.encode('<!--'+'x'.repeat(2_100_000)+'-->'+playerHtml());
 // Split a Japanese character across reads, as can happen on the network.
 const split=Buffer.from(html).indexOf(Buffer.from('卵焼き'))+1;assert.ok(split>2_100_000);
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  assert.equal(options.redirect,'manual');
  return new Response(new ReadableStream({start(controller){controller.enqueue(html.slice(0,split));controller.enqueue(html.slice(split));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/html; charset=utf-8'}});
 });
 const result=await fetchYouTubeMetadata({id:videoId,url:videoUrl},AbortSignal.timeout(1000));
 assert.equal(result.description,description);assert.equal(result.title,'卵焼きの作り方');assert.equal(cancelled,true);
});

test('metadata stops at the page budget and rejects descriptions for other videos',async t=>{
 let cancelled=false;
 t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('<!--'+'x'.repeat(4_100_000)+'-->'+playerHtml()));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/html'}}));
 assert.equal(await fetchYouTubeMetadata({id:videoId,url:videoUrl},AbortSignal.timeout(1000)),null);assert.equal(cancelled,true);
 const data={videoDetails:{videoId,title:'卵焼き'},microformat:{playerMicroformatRenderer:{description:{simpleText:description}}}};
 const html=`<script>ytInitialPlayerResponse = ${JSON.stringify(data)};</script>`;
 assert.equal(youtubeMetadata(html,videoId).description,description);assert.equal(youtubeMetadata(html,'differentID'),null);
});

test('description plus actual video use Gemini through the existing Gateway; unknown amounts need review',async t=>{
 const requests=source(t),phases=[];let calls=0;
 const result=await importUrl(`https://youtu.be/${videoId}?si=abc`,{onPhase:p=>phases.push(p)},env(async(input)=>{
  calls++;assert.deepEqual(input.contents[0].parts[0],{fileData:{fileUri:videoUrl}});
  assert.match(input.contents[0].parts[1].text,/卵 2個/);assert.match(input.systemInstruction.parts[0].text,/推定しない/);
  assert.equal(input.generationConfig.responseMimeType,'application/json');assert.ok(input.generationConfig.responseJsonSchema);
  return Response.json({success:true,result:geminiResponse()});
 }));
 assert.equal(calls,1);assert.deepEqual(phases,['video','sorting','checking']);assert.equal(result.source.kind,'video');assert.equal(result.source.text,description);assert.equal(result.source.url,videoUrl);
 assert.equal(result.recipe.sourceUrl,videoUrl);assert.deepEqual(result.recipe.stepVideoSeconds,[12,65]);assert.equal(result.recipe.ingredients[2].name,'醤油');assert.equal(result.recipe.ingredients[2].group,'A');
 assert.equal(result.recipe.ingredients[3].quantity,'');assert.equal(result.recipe.ingredients[3].unit,'');assert.ok(result.issues.some(issue=>issue.field==='ingredients.3.quantity'));
 assert.ok(result.photo.startsWith('data:image/jpeg;base64,'));assert.equal(requests.length,3);assert.ok(validateRecord('recipe',result.recipe));
});

test('complete, ingredient-only and empty descriptions all retain their original evidence',async t=>{
 for(const text of [description+'\n混ぜて焼く。',description,'']){
  await t.test(text?'description exists':'empty description',async t=>{
   source(t,playerHtml(text));let calls=0;
   const result=await importYouTube(videoUrl,env(async(input)=>{calls++;assert.ok(input.contents[0].parts[0].fileData);assert.ok(input.contents[0].parts[1].text.includes(text||'記載なし'));return geminiResponse();}));
   assert.equal(calls,1);assert.deepEqual(result.recipe.steps,videoRecipe.steps);assert.equal(result.source.text,text||undefined);
  });
 }
});

test('an unavailable page does not block supported direct-video input and never follows consent redirects',async t=>{
 t.mock.method(globalThis,'fetch',async url=>String(url)===videoUrl?new Response(null,{status:302,headers:{location:'https://consent.youtube.com/'}}):new Response(null,{status:404}));
 const result=await importYouTube(videoUrl,env(async(input)=>{assert.match(input.contents[0].parts[1].text,/概要欄は取得できません/);return geminiResponse();}));
 assert.deepEqual(result.recipe.steps,videoRecipe.steps);assert.equal(result.source.text,undefined);assert.ok(result.warnings.length);assert.equal(result.sourceDiagnostics.code,'redirect');assert.equal(result.sourceDiagnostics.httpStatus,302);
});

test('invented weights from visual counts are removed and invalid timestamps never become links',async t=>{
 source(t);
 const value={...videoRecipe,ingredients:[{name:'油',quantity:'20',unit:'ml',quantitySource:'count'}],steps:['混ぜる','焼く','盛る'],stepVideoSeconds:[0,-1,9999]};
 const result=await importYouTube(videoUrl,env(async()=>geminiResponse(value)));
 assert.equal(result.recipe.ingredients[0].quantity,'');assert.deepEqual(result.recipe.stepVideoSeconds,[0,null,null]);
 const removed=removeRecipeStep(result.recipe,0);assert.deepEqual(removed.stepVideoSeconds,[null,null]);assert.ok(validateRecord('recipe',removed));
 assert.equal(validateRecord('recipe',{...result.recipe,stepVideoSeconds:[0]}),null);assert.equal(validateRecord('recipe',{...result.recipe,stepVideoSeconds:[0,'65',null]}),null);
});

test('native Gemini results exclude thought parts and reject truncation, refusals and malformed output',()=>{
 assert.deepEqual(geminiOutput(geminiResponse()),{recipe:videoRecipe,error:null});
 for(const [value,code] of [[{candidates:[{finishReason:'MAX_TOKENS'}]},'incomplete'],[{promptFeedback:{blockReason:'SAFETY'}},'refusal'],[{candidates:[{finishReason:'SAFETY'}]},'refusal'],[{candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private'}]}}]},'invalid_response'],[null,'invalid_response'],[{candidates:[]},'invalid_response']])assert.throws(()=>geminiOutput(value),error=>error.diagnostics.code===code&&!error.message.includes('private'));
});

test('provider errors and non-recipes do not retry or expose private error text',async t=>{
 source(t);
 for(const [raw,code] of [[Response.json({error:{code:429,message:'private text'}},{status:429}),'rate_limit'],[Response.json({errors:[{code:7003,message:'private text'}]},{status:400}),'invalid_request'],[geminiResponse(null),'extraction_failed']]){
  let calls=0;await assert.rejects(importYouTube(videoUrl,env(async()=>{calls++;return raw;})),error=>error.diagnostics.code===code&&!error.message.includes('private'));assert.equal(calls,1);
 }
});

test('native Google and Gateway rejections identify the failing field without leaking provider text',async t=>{
 const requests=source(t),secret='private-token-and-recipe';
 const cases=[
  [{error:{code:400,status:'INVALID_ARGUMENT',message:`Invalid JSON payload: unknown name response_json_schema in generation_config. ${secret}`}},'schema_rejected','responseJsonSchema','INVALID_ARGUMENT','400'],
  [{errors:[{code:7003,message:`User Input Error: Required value missing: contents ${secret}`}]},'invalid_payload','contents',undefined,'7003'],
  [{error:{code:400,status:'INVALID_ARGUMENT',message:`Unable to fetch YouTube video https://youtube.com/watch?v=${secret}`}},'video_unavailable',undefined,'INVALID_ARGUMENT','400'],
  [{error:{code:400,status:secret,message:`Unsupported video mime type ${secret}`}},'unsupported_video',undefined,undefined,'400'],
 ];
 for(const [body,reason,field,providerStatus,providerCode] of cases){
  let calls=0;
  await assert.rejects(importYouTube(videoUrl,env(async()=>{calls++;return Response.json(body,{status:400});})),error=>{
   assert.equal(error.diagnostics.reason,reason);assert.equal(error.diagnostics.field,field);assert.equal(error.diagnostics.providerStatus,providerStatus);assert.equal(error.diagnostics.providerCode,providerCode);
   assert.equal(error.diagnostics.provider,'google-ai-studio');assert.equal(error.diagnostics.model,'gemini-3.8-flash');
   assert.ok(!JSON.stringify(error).includes(secret));assert.ok(!error.message.includes(secret));
   if(reason==='video_unavailable')assert.match(error.message,/動画を取得できません/);
   return true;
  });
  assert.equal(calls,1);
 }
 assert.deepEqual(requests,[videoUrl,videoUrl,videoUrl,videoUrl]);
});

test('cancelled video inference stops without downloading images or yielding a recipe',async t=>{
 const requests=source(t),controller=new AbortController();
 await assert.rejects(importYouTube(videoUrl,env(async(_input,options)=>{assert.ok(options.signal);controller.abort();return new Promise(()=>{});}),{signal:controller.signal}),{name:'AbortError'});
 assert.equal(requests.length,1);
});

test('YouTube channel/playlist URLs and missing configuration fail before any outbound request',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected fetch');});
 await assert.rejects(importUrl('https://www.youtube.com/@chef',{},env(async()=>{throw new Error('Unexpected AI');})),/動画URL/);
 await assert.rejects(importYouTube(videoUrl,{}),/接続設定/);assert.equal(calls,0);
 await assert.rejects(importYouTube(videoUrl,{AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'uchino',AI:{run:async()=>assert.fail('Unexpected proxy call')}}),/接続設定/);assert.equal(calls,0);
});

test('current watch-page JSON reaches Gemini even when player metadata is absent',async t=>{
 source(t,watchHtml());
 const result=await importYouTube(videoUrl,env(async(input)=>{
  assert.ok(input.contents[0].parts[1].text.includes(description));return geminiResponse();
 }));
 assert.equal(result.source.text,description);assert.equal(result.source.name,'卵焼きの作り方');
 assert.equal(result.sourceDiagnostics,undefined);assert.equal(result.warnings,undefined);
 assert.equal(youtubeMetadata(watchHtml(description,'differentID'),videoId),null);
 const data={videoDetails:{videoId,title:'卵焼き',shortDescription:description,lengthSeconds:'180'}};
 assert.equal(youtubeMetadata(`<script id="yt-initial-player-response" type="application/json">${JSON.stringify(data)}</script>`,videoId).description,description);
});

test('watch metadata supports old runs, window assignments and the expanded description panel',()=>{
 for(const style of ['runs','panel']){
  const data=watchData();
  const contents=data.contents.twoColumnWatchNextResults.results.results.contents;
  delete contents[1].videoSecondaryInfoRenderer.attributedDescription;
  if(style==='runs')contents[1].videoSecondaryInfoRenderer.description={runs:[{text:'材料\n'},{text:'卵 2個 & 塩'}]};
  else data.engagementPanels=[{engagementPanelSectionListRenderer:{content:{structuredDescriptionContentRenderer:{items:[{expandableVideoDescriptionBodyRenderer:{attributedDescriptionBodyText:{content:'材料\n卵 2個 & 塩'}}}]}}}}];
  for(const assignment of ['var ytInitialData =',"window['ytInitialData'] =",'window["ytInitialData"] =']){
   const html=`<script>${assignment} ${JSON.stringify(data)};</script>`;
   assert.equal(youtubeMetadata(html,videoId).description,'材料\n卵 2個 & 塩');
  }
 }
 // The selected video's absent description cannot be filled from recommendations.
 const data=watchData();data.contents.twoColumnWatchNextResults.results.results.contents.pop();
 data.contents.twoColumnWatchNextResults.secondaryResults={results:[{videoSecondaryInfoRenderer:{attributedDescription:{content:'Wrong recipe'}}}]};
 assert.equal(youtubeMetadata(`<script>var ytInitialData = ${JSON.stringify(data)};</script>`,videoId),null);
 assert.equal(youtubeMetadata('<script id="yt-initial-data">{invalid}</script>',videoId),null);
 assert.equal(youtubeMetadata(watchHtml(''),videoId).description,'');
});

test('missing metadata reports bounded diagnostics without page contents or URLs',async t=>{
 const body='<script>var ytInitialPlayerResponse={"playabilityStatus":{"status":"UNPLAYABLE","reason":"private-page-text"}};</script><script id="yt-initial-data">{"currentVideoEndpoint":{"watchEndpoint":{"videoId":"wrong"}}}</script>';
 source(t,body);const logs=[];t.mock.method(console,'warn',message=>logs.push(message));
 const result=await importYouTube(videoUrl,env(async()=>geminiResponse()));
 assert.deepEqual(result.sourceDiagnostics,{code:'metadata_missing',httpStatus:200,bytes:Buffer.byteLength(body),playerDataFound:true,pageDataFound:true});
 assert.equal(JSON.parse(logs[0]).event,'youtube_metadata_failed');
 assert.ok(!JSON.stringify(result.sourceDiagnostics).includes('private-page-text'));assert.ok(!logs[0].includes(videoId));
});

test('metadata HTTP, content type and network failures have distinct diagnostics; cancellation still propagates',async t=>{
 for(const [response,code] of [[new Response(null,{status:403}),'http_error'],[new Response('{}',{headers:{'content-type':'application/json'}}),'not_html'],[new Response(null,{headers:{'content-type':'text/html'}}),'empty_response'],[new Error('private-fetch-detail'),'network_error']]){
  await t.test(code,async t=>{
   t.mock.method(globalThis,'fetch',async()=>{if(response instanceof Error)throw response;return response;});
   let diagnostic;assert.equal(await fetchYouTubeMetadata({id:videoId,url:videoUrl},new AbortController().signal,value=>{diagnostic=value;}),null);
   assert.equal(diagnostic.code,code);assert.ok(!JSON.stringify(diagnostic).includes('private-fetch-detail'));
  });
 }
 const controller=new AbortController();controller.abort(new Error('cancelled'));let diagnostic;
 await assert.rejects(()=>fetchYouTubeMetadata({id:videoId,url:videoUrl},controller.signal,value=>{diagnostic=value;}),/cancelled/);assert.equal(diagnostic,undefined);
});
