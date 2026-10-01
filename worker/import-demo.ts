import {newRecipe,demoPhotos} from '../src/domain';
import type {ImportResult} from '../src/import-model';

// Only served by the APP_ENV === 'staging' route; never bundled into the client.
export function demoImport():ImportResult {
  return {demo:true,recipe:{...newRecipe(),photo:demoPhotos.chicken,title:'鶏肉ときのこのクリーム煮',category:'主菜',servings:2,minutes:20,
    ingredients:[{name:'鶏もも肉',quantity:'250',unit:'g'},{name:'しめじ',quantity:'1/2',unit:'パック'},{name:'玉ねぎ',quantity:'1/2',unit:'個'},{name:'牛乳',quantity:'200',unit:'ml'},{name:'薄力粉',quantity:'1',unit:'大さじ'},{name:'バター',quantity:'',unit:''},{name:'塩・こしょう',quantity:'少々',unit:''}],
    steps:['鶏肉はひと口大に切る。しめじはほぐし、玉ねぎは薄切りにする。','フライパンにバターを熱し、鶏肉、玉ねぎ、しめじを炒める。','薄力粉を振り入れて混ぜ、牛乳を少しずつ加える。','弱火で鶏肉に火が通るまで煮て、塩・こしょうで味を調える。'],
    memo:'デモ用レシピ。人数が不明なため、2人分を仮設定しています。'},
    issues:[{field:'servings',reason:'元のメモに人数の記載がないため、2人分を仮設定しています。'},{field:'ingredients.5.quantity',reason:'バターの分量が「？」になっています。元資料で確認し、必要なら入力してください。'}],
    source:{kind:'text',name:'デモのレシピメモ',text:'鶏肉ときのこのクリーム煮\n調理時間：20分\n\n材料\n鶏もも肉 250g\nしめじ 1/2パック\n玉ねぎ 1/2個\n牛乳 200ml\n薄力粉 大さじ1\nバター ？\n塩・こしょう 少々\n\n1. 鶏肉はひと口大に。しめじをほぐし、玉ねぎを薄切り。\n2. バターで鶏肉・玉ねぎ・しめじを炒める。\n3. 薄力粉を混ぜ、牛乳を少しずつ加える。\n4. 弱火で鶏肉に火が通るまで煮て、塩・こしょうで調える。'}};
}
