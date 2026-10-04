import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['src/step-ingredients.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {stepIngredients}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const ing=(...names)=>names.map(name=>typeof name==='string'?{name,quantity:'',unit:''}:{quantity:'',unit:'',...name});
const names=(list,steps,i)=>stepIngredients(list,steps,i).map(index=>list[index].name);

test('meat is matched by its animal and earlier steps come along',()=>{
  const list=ing('豚バラ薄切り肉','大根','にんじん','ごぼう','こんにゃく','だし','ごま油','みそ');
  const steps=['大根、にんじんはいちょう切り、ごぼうはささがき、こんにゃくはちぎる。','豚肉は3cm長さに切る。フライパンにごま油を中火で熱し、豚肉をいためる。色が変わってほぐれたら1を加え、油がなじむまでいため合わせる。','だしを加えて煮て、みそを溶き入れる。'];
  assert.deepEqual(names(list,steps,1),['豚バラ薄切り肉','大根','にんじん','ごぼう','こんにゃく','ごま油']);
  assert.deepEqual(names(list,steps,2),['だし','みそ']);
});
test('shorter names, groups and no false hits',()=>{
  const list=ing('長ねぎ','木綿豆腐','鶏もも肉',{name:'しょうゆ',group:'A'},{name:'みりん',group:'A'},'塩こしょう','サラダ油');
  assert.deepEqual(names(list,['鶏肉と豆腐を焼き、ねぎを散らす。'],0),['長ねぎ','木綿豆腐','鶏もも肉']);
  assert.deepEqual(names(list,['Aを加えて煮からめる。'],0),['しょうゆ','みりん']);
  assert.deepEqual(names(list,['しょうゆを少し足す。1分煮る。'],0),['しょうゆ']);
  assert.deepEqual(names(ing('鶏ガラスープの素'),['コンソメの素を入れる。'],0),[]);
});
