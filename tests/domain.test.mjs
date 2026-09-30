import test from 'node:test';
import assert from 'node:assert/strict';
import {newRecipe,scaleQuantity,validateRecord} from '../src/domain.ts';
test('fractions scale while qualitative quantities remain unchanged',()=>{
  assert.equal(scaleQuantity('1/2',2,4),'1');assert.equal(scaleQuantity('1 1/2',2,3),'2 1/4');assert.equal(scaleQuantity('200',2,3),'300');assert.equal(scaleQuantity('少々',2,8),'少々');assert.equal(scaleQuantity('適量',2,1),'適量');assert.equal(scaleQuantity('１／２',2,4),'1');assert.equal(scaleQuantity('1/0',2,4),'1/0');
});
test('records reject missing ingredients, invalid quantities and executable URLs',()=>{
  const recipe={...newRecipe(),title:'レシピ',ingredients:[{name:'卵',quantity:'1',unit:'個'}],steps:['焼く']};
  assert.ok(validateRecord('recipe',recipe));assert.equal(validateRecord('recipe',{...recipe,sourceUrl:'javascript:alert(1)'}),null);assert.equal(validateRecord('recipe',{...recipe,servings:0}),null);assert.equal(validateRecord('recipe',{...recipe,ingredients:[]}),null);assert.equal(validateRecord('recipe',{...recipe,steps:['']}),null);
});
