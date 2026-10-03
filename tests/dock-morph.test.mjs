import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/kondo-fluid-dock.tsx'],bundle:true,write:false,format:'esm',platform:'node'});
const {prepareDockMorph,morphDock,dockSlots,dockContour}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const tabs={left:0,width:140,radius:28};
const slots=add=>dockSlots(343,[tabs,null,add]).map((island,slot)=>({...island,slot,tint:add&&slot===2?1:0}));
const browse=slots({left:287,width:56,radius:28}),settings=slots(null);
test('plus merges into the fixed-width tabs and splits back without shrinking its radius',()=>{
 for(const [from,to] of [[browse,settings],[settings,browse]]){
  const plan=prepareDockMorph(from,to,true);
  for(const t of [.05,.15,.35,.6,.85,.99]){
   const state=morphDock(from,to,0,t,plan);
   assert.ok(state.tension>0,'Surface tension joins the moving material');
   for(const island of state.islands){assert.equal(island.radius,28);assert.ok(island.width>=56);}
  }
  assert.equal(dockContour(343,plan.to,0),dockContour(343,to,0),'Final shape equals the intended capsule');
 }
 assert.equal(settings[0].width,browse[0].width);
});
test('reversing a partially absorbed plus preserves the current contour',()=>{
 for(const t of [.15,.5,.85]){
  const state=morphDock(browse,settings,0,t,prepareDockMorph(browse,settings,true));
  const reverse=prepareDockMorph(state.islands,browse,true);
  assert.equal(dockContour(343,morphDock(state.islands,browse,state.tension,0,reverse).islands,state.tension),dockContour(343,state.islands,state.tension));
  assert.equal(dockContour(343,morphDock(state.islands,browse,state.tension,1,reverse).islands,0),dockContour(343,browse,0));
 }
});
