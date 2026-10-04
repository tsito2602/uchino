import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async file=>{const built=await build({entryPoints:[file],bundle:true,write:false,format:'esm',platform:'node'});return import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));};
const {mergeQuantity,sameItem}=await load('src/shopping-merge.ts');
const {aisleOf,aisles}=await load('src/shopping-aisle.ts');

test('amounts in the same unit add up, others sit side by side',()=>{
  assert.equal(mergeQuantity('2個','1個'),'3個'.replace('3個','3 個'));
  assert.equal(mergeQuantity('100 g','150 g'),'250 g');
  assert.equal(mergeQuantity('大さじ1','大さじ1/2'),'大さじ1と1/2');
  assert.equal(mergeQuantity('1/2 本','1/4 本'),'3/4 本');
  assert.equal(mergeQuantity('大さじ1','50 ml'),'大さじ1 ＋ 50 ml');
  assert.equal(mergeQuantity('','2個'),'2個');
  assert.equal(mergeQuantity('約4 cm','4 cm'),'約4 cm ＋ 4 cm');
  assert.ok(sameItem('卵','卵 '));
});
test('aisles follow the store',()=>{
  const at=name=>aisles[aisleOf(name)];
  assert.equal(at('玉ねぎ'),'野菜・果物');
  assert.equal(at('豚バラ薄切り肉'),'肉・魚');
  assert.equal(at('鶏ガラスープの素'),'調味料・油');
  assert.equal(at('ごま油'),'調味料・油');
  assert.equal(at('卵'),'卵・乳製品・豆腐');
  assert.equal(at('薄力粉'),'米・パン・麺・粉');
  assert.equal(at('塩鮭'),'肉・魚');
  assert.equal(at('キッチンペーパー'),'その他');
});
