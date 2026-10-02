import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['src/ingredient-amount.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {ingredientAmount,formatIngredientAmount}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const item=(name,quantity,unit='g')=>({name,quantity,unit});

test('typical raw vegetables use simple fractions while retaining source weights',()=>{
 for(const [name,grams,quantity,unit] of [['玉ねぎ','100','1/2','個'],['にんじん','50','1/3','本'],['ごぼう','80','1/2','本'],['じゃがいも','300','2','個'],['ほうれん草','100','1/2','束']]){
  const value=ingredientAmount(item(name,grams),2,2);
  assert.deepEqual(value.parts,[{quantity,unit}]);assert.equal(value.approximate,true);assert.equal(value.original,`${grams} g`);assert.match(value.basis,/目安/);
 }
 assert.equal(formatIngredientAmount(item('玉ねぎ','100'),2,2),'約1/2 個（100 g）');
});

test('small amounts can use leaves or length instead of impractical fractions of a whole',()=>{
 assert.deepEqual(ingredientAmount(item('大根','100'),2,2).parts,[{quantity:'4',unit:'cm'}]);
 assert.deepEqual(ingredientAmount(item('キャベツ','100'),2,2).parts,[{quantity:'2',unit:'枚'}]);
 assert.deepEqual(ingredientAmount(item('白菜','100'),2,2).parts,[{quantity:'1',unit:'枚'}]);
 assert.deepEqual(ingredientAmount(item('キャベツ','300'),2,2).parts,[{quantity:'1/4',unit:'個'}]);
 assert.equal(ingredientAmount(item('玉ねぎ','5'),2,2).approximate,false,'Tiny quantities without a useful estimate keep g');
});

test('aliases and raw preparation notes match but different varieties and processed foods do not',()=>{
 for(const name of ['たまねぎ','玉ねぎ（薄切り）','玉ねぎのみじん切り','玉ねぎ (中)'])assert.equal(ingredientAmount(item(name,'100'),2,2).parts[0].quantity,'1/2');
 for(const name of ['玉ねぎスープ','玉ねぎ（加熱済み）','トマト缶','ミニトマト','ミニ大根','乾燥しいたけ','大根おろし','にんじんジュース','豚肉','醤油']){
  const value=ingredientAmount(item(name,'100'),2,2);assert.equal(value.approximate,false,name);assert.deepEqual(value.parts,[{quantity:'100',unit:'g'}]);
 }
 assert.equal(ingredientAmount(item('玉ねぎ','0.1','kg'),2,2).parts[0].quantity,'1/2');
 assert.equal(ingredientAmount(item('玉ねぎ','１００','ｇ'),2,2).parts[0].quantity,'1/2');
});

test('volume conversions are exact and use familiar tablespoon and teaspoon amounts',()=>{
 for(const [ml,expected] of [['30','大さじ2（30 ml）'],['10','小さじ2（10 ml）'],['20','大さじ1＋小さじ1（20 ml）'],['22.5','大さじ1と1/2（22.5 ml）'],['2.5','小さじ1/2（2.5 ml）']]){
  assert.equal(formatIngredientAmount(item('醤油',ml,'ml'),2,2),expected);
 }
 for(const unit of ['ml','mL','ｍＬ','cc','ミリリットル'])assert.deepEqual(ingredientAmount(item('みりん','15',unit),2,2).parts,[{quantity:'1',unit:'大さじ'}]);
 for(const quantity of ['31','0','600'])assert.deepEqual(ingredientAmount(item('水',quantity,'ml'),2,2).parts,[{quantity,unit:'ml'}]);
 assert.equal(formatIngredientAmount(item('醤油','30'),2,2),'30 g','Never treat grams of seasoning as ml');
 assert.equal(formatIngredientAmount(item('酒','22.5001','ml'),2,2),'22.5 ml','Display rounding must not qualify a non-exact spoon conversion');
 assert.equal(formatIngredientAmount(item('油','0.0001','ml'),2,2),'0.0001 ml','A positive amount is never displayed as zero');
});

test('servings recalculate from the original recipe without accumulating approximations',()=>{
 const original=Object.freeze(item('玉ねぎ','100'));
 assert.equal(formatIngredientAmount(original,2,3),'約3/4 個（150 g）');
 assert.equal(formatIngredientAmount(original,2,1),'約1/4 個（50 g）');
 assert.equal(formatIngredientAmount(original,2,2),'約1/2 個（100 g）');
 assert.deepEqual(original,item('玉ねぎ','100'));
 assert.equal(formatIngredientAmount(item('酒','20','ml'),2,3),'大さじ2（30 ml）');
 assert.equal(formatIngredientAmount(item('みりん','1と1/2','大さじ'),2,3),'大さじ2と1/4');
});

test('qualitative, unknown, and invalid inputs remain unconverted',()=>{
 for(const quantity of ['少々','適量','100〜150','約100','1/0','']){
  const value=ingredientAmount(item('玉ねぎ',quantity),2,2);assert.equal(value.approximate,false);assert.equal(value.parts[0].quantity,quantity);
 }
 for(const [base,servings] of [[0,2],[2,0],[NaN,2],[2,Infinity]])assert.equal(ingredientAmount(item('玉ねぎ','100'),base,servings).approximate,false);
});
