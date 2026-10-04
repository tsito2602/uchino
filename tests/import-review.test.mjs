import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['src/import-model.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {fieldAfterRemoval,importIssues}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('review reasons and acknowledgements follow their ingredient after deletion',()=>{
 assert.equal(fieldAfterRemoval('ingredients.5.quantity','ingredients',2),'ingredients.4.quantity');
 assert.equal(fieldAfterRemoval('ingredients.5.quantity','ingredients',5),null);
 assert.equal(fieldAfterRemoval('servings','ingredients',0),'servings');
 assert.equal(fieldAfterRemoval('steps.2','steps',0),'steps.1');
});
test('missing quantities and provisional servings retain bounded review reasons',()=>{
 const recipe={memo:'人数を仮設定',category:'主菜',ingredients:[{name:'バター',quantity:'',unit:''}],steps:['焼く']};
 assert.deepEqual(importIssues(recipe,[{field:'ingredients.0.quantity',reason:'元資料は「？」です。'},{field:'steps.88',reason:'invalid'}]).map(i=>i.field),['ingredients.0.quantity','servings']);
 assert.equal(importIssues(recipe,[{field:'servings',reason:'a'.repeat(1000)}]).find(i=>i.field==='servings').reason.length,400);
});
test('review explains unset values in Japanese while preserving the issue and other details',()=>{
 const recipe={memo:'',category:'主菜',minutes:null,ingredients:[],steps:['焼く']};
 const result=importIssues(recipe,[{field:'minutes',reason:'調理時間の記載がないためnullとしました。'},{field:'steps.0',reason:'加熱時間はundefinedですが、強火の指定があります。'}]);
 assert.deepEqual(result,[{field:'minutes',reason:'調理時間の記載がないため未設定としました。'},{field:'steps.0',reason:'加熱時間は未設定ですが、強火の指定があります。'}]);
 assert.equal(recipe.minutes,null);
});
