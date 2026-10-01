import test from 'node:test';
import assert from 'node:assert/strict';
import {newRecipe,scaleQuantity,formatQuantity,validateRecord,recipePhoto,demoPhotos,validRecipePhoto} from '../src/domain.ts';
import {photoFixture} from './photo-fixture.mjs';
test('fractions scale while qualitative quantities remain unchanged',()=>{
  assert.equal(scaleQuantity('1/2',2,4),'1');assert.equal(scaleQuantity('1 1/2',2,3),'2と1/4');assert.equal(scaleQuantity('200',2,3),'300');assert.equal(scaleQuantity('少々',2,8),'少々');assert.equal(scaleQuantity('適量',2,1),'適量');assert.equal(scaleQuantity('１／２',2,4),'1');assert.equal(scaleQuantity('1/0',2,4),'1/0');
});
test('spoon quantities put the unit first and decimal amounts use mixed fractions',()=>{
 assert.equal(formatQuantity('1.5','大さじ'),'大さじ1と1/2');assert.equal(formatQuantity('0.75','小さじ'),'小さじ3/4');assert.equal(formatQuantity('200','g'),'200 g');
 assert.equal(scaleQuantity('1と1/2',2,3),'2と1/4');assert.equal(scaleQuantity('1.2',2,2),'1と1/5');assert.equal(scaleQuantity('0.1',2,2),'1/10');assert.equal(scaleQuantity('1',3,1),'1/3');assert.equal(formatQuantity('少々',''),'少々');
});
test('photos preserve legacy recipes, explicit removal and validated image data',()=>{
 const recipe={...newRecipe(),id:'sample-ginger',title:'豚のしょうが焼き',ingredients:[{name:'豚肉',quantity:'200',unit:'g'}],steps:['焼く']};
 delete recipe.photo;
 assert.ok(validateRecord('recipe',recipe));assert.equal(recipePhoto(recipe),demoPhotos.ginger);
 assert.equal(recipePhoto({...recipe,photo:''}),'');
 const photo=photoFixture(120000);assert.ok(validRecipePhoto(photo));assert.equal(validateRecord('recipe',{...recipe,photo}).photo,photo);
 for(const invalid of [null,123,'javascript:alert(1)','https://external.test/photo.jpg','/api/auth/session','data:image/svg+xml;base64,PHN2Zz4=',photo+'=',photoFixture(260000)])assert.equal(validateRecord('recipe',{...recipe,photo:invalid}),null);
 assert.ok(validateRecord('recipe',{...recipe,photo:photoFixture(250000),steps:Array(100).fill('あ'.repeat(5000))})===null,'UTF-8 row bound protects D1');
});
test('records reject missing ingredients, invalid quantities and executable URLs',()=>{
  const recipe={...newRecipe(),title:'レシピ',ingredients:[{name:'卵',quantity:'1',unit:'個'}],steps:['焼く']};
  assert.ok(validateRecord('recipe',recipe));assert.equal(validateRecord('recipe',{...recipe,sourceUrl:'javascript:alert(1)'}),null);assert.equal(validateRecord('recipe',{...recipe,servings:0}),null);assert.equal(validateRecord('recipe',{...recipe,ingredients:[]}),null);assert.equal(validateRecord('recipe',{...recipe,steps:['']}),null);
});
