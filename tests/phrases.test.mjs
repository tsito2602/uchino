import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['src/phrases.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {phrases}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));

test('recipe titles wrap between phrases, never mid-word',()=>{
  const cases={
    '鶏肉ときのこのクリーム煮':['鶏肉ときのこの','クリーム煮'],
    '鮭の炊き込みご飯':['鮭の','炊き込みご飯'],
    'ささみのしそチーズ焼き':['ささみのしそ','チーズ焼き'],
    '肉じゃが（甘め）の作り方':['肉じゃが（甘め）の','作り方'],
    'だし巻き卵':['だし巻き卵'],
    'みそ汁':['みそ汁'],
    '':[],
  };
  for(const [title,expected] of Object.entries(cases)){
    assert.deepEqual(phrases(title),expected,title);
    assert.equal(phrases(title).join(''),title);
  }
});
