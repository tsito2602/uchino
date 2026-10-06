// Finds which of a recipe's ingredients a step's text names.
//
// Steps rarely repeat the ingredient line: "ツナ缶" is "ツナ", "豚バラ薄切り肉"
// is "豚肉", "醤油" is "しょうゆ", "レモン（絞り汁）" is "レモン". So each
// ingredient gets the names a cook would write, and both sides are folded to
// one spelling first. Short names are where false hits come from ("ねぎ" in
// たまねぎ, "塩" in 塩昆布, "トマト" in トマトケチャップ, "のり" in ほんのり),
// so a hit has to stand as a word of its own, and where hits overlap the
// longest one wins.

// One spelling per food: kanji, hiragana and katakana variants, and the
// everyday words for the same thing. Applied after katakana is folded to
// hiragana, so keys are written in hiragana.
const VARIANTS:Record<string,string[]>={
  'しょうゆ':['醤油','醬油','しょう油','正油'],
  'しょうが':['生姜','生薑'],
  'にんにく':['大蒜'],
  'たまねぎ':['玉ねぎ','玉葱'],
  'ねぎ':['葱'],
  '小ねぎ':['万能ねぎ','青ねぎ','細ねぎ'],
  'にんじん':['人参'],
  '大根':['だいこん'],
  'こしょう':['胡椒'],
  'ごま':['胡麻'],
  'みそ':['味噌'],
  'みりん':['味醂','本みりん'],
  '砂糖':['さとう'],
  '塩':['食塩','あら塩','粗塩'],
  '酒':['料理酒','日本酒','お酒'],
  '酢':['お酢','米酢','穀物酢'],
  '卵':['玉子','たまご','鶏卵'],
  'しいたけ':['椎茸'],
  'なす':['茄子'],
  'きゅうり':['胡瓜'],
  'かぼちゃ':['南瓜'],
  'ごぼう':['牛蒡'],
  'れんこん':['蓮根'],
  'たけのこ':['筍','竹の子'],
  'じゃがいも':['じゃが芋','馬鈴薯'],
  'さつまいも':['さつま芋','薩摩芋'],
  '里芋':['さといも'],
  'えのき':['えのきだけ','えのき茸'],
  'しめじ':['ぶなしめじ'],
  'まいたけ':['舞茸'],
  'ほうれん草':['ほうれんそう'],
  '小松菜':['こまつな'],
  'にら':['韮'],
  '白菜':['はくさい'],
  'つな':['しーちきん'],
  '鮭':['しゃけ'],
  'さば':['鯖'],
  'えび':['海老','蝦'],
  'いか':['烏賊'],
  'たこ':['蛸'],
  'ほたて':['帆立'],
  'はちみつ':['蜂蜜'],
  '唐辛子':['とうがらし','鷹の爪'],
  '片栗粉':['かたくり粉'],
  '小麦粉':['薄力粉'],
  '大葉':['青じそ','青紫蘇'],
  'だし':['だし汁','出汁'],
  'けちゃっぷ':['とまとけちゃっぷ'],
  'おりーぶおいる':['おりーぶ油'],
  '粉ちーず':['ぱるめざんちーず'],
  '鶏がら':['とりがら'],
  'ご飯':['ごはん','御飯'],
  '鶏肉':['とり肉','鳥肉'],
  '豚肉':['ぶた肉'],
  'ひき肉':['挽き肉','挽肉','ひきにく'],
};
const CANON=new Map(Object.entries(VARIANTS).flatMap(([canon,list])=>list.map(variant=>[variant,canon] as const)));
const CANON_PATTERN=new RegExp([...CANON.keys()].sort((a,b)=>b.length-a.length).join('|'),'g');

// Words that contain an ingredient's short name but are something else. They
// only block a hit when no ingredient of the recipe is called that.
const OTHER_WORDS=['たまねぎ','ごま油','ぽん酢','白だし','めんつゆ','塩昆布','塩こんぶ','塩こうじ','塩麹','塩け','塩気','水け','水気','水菜','油揚げ','油あげ','粉ちーず','鶏がらすーぷ','酒粕','酢豚'];

// Ways a name is dressed up that a step leaves off: where it came from or how
// it is sold or cut. Stripped one at a time, each result is another name.
const PREFIXES=['すりおろし','おろし','いり','炒り','煎り','すり','練り','ねり','お好みの','お好みで','好みの','市販の','冷凍','乾燥','干し','刻み','粗びき','粗挽き','無塩','有塩','溶き','ゆで','茹で','温かい','冷たい','冷やし','生','本','純','赤','白','黒'];
const SUFFIXES=['缶詰め','缶詰','水煮缶','の水煮','水煮','缶','果汁','絞り汁','しぼり汁','汁','切り身','薄切り肉','厚切り肉','こま切れ肉','切り落とし肉','切り落とし','薄切り','厚切り','こま切れ','細切れ','ぶつ切り','ぶろっく','かたまり','ちゅーぶ','すらいす','みじん切り','千切り','せん切り','すりおろし','おろし','ぱっく','少々','適量','適宜','各'];
// A single kanji is a name only for foods that are one kanji.
const SINGLE=new Set(['油','塩','水','酒','酢','卵','鮭','鯛','鱈','米','麩','湯','餅']);
// Compounds a single-kanji food is part of as itself: 卵液 is egg, 酒蒸し uses sake.
const SINGLE_OK=new Set(['卵液','卵黄','卵白','酒蒸','水溶','湯通','湯煎']);
// Particles and endings a short kana name can sit next to: "ねぎを", "となすは".
const PARTICLE=new Set([...'はをにとのがもでやへなよ']);

type Script='h'|'k'|'c'|'o';
const scriptOf=(char:string):Script=>/[ぁ-ゟ]/.test(char)?'h':/[ァ-ヿ]/.test(char)?'k':/[一-鿿々〆]/.test(char)?'c':'o';

// Width-normalised, katakana folded to hiragana, variants spelled one way.
// `scripts` keeps each folded character's original script, for word edges.
type Folded={text:string;scripts:Script[]};
export function fold(raw:string):Folded{
  let text='';const scripts:Script[]=[];
  for(const char of raw.normalize('NFKC')){
    const code=char.charCodeAt(0),kana=code>=0x30a1&&code<=0x30f6;
    text+=kana?String.fromCharCode(code-0x60):char;scripts.push(scriptOf(char));
  }
  let out='';const outScripts:Script[]=[];let last=0;
  for(const match of text.matchAll(CANON_PATTERN)){
    out+=text.slice(last,match.index);outScripts.push(...scripts.slice(last,match.index));
    const canon=CANON.get(match[0])!,kata=scripts[match.index]==='k';
    out+=canon;for(const char of canon)outScripts.push(kata&&scriptOf(char)==='h'?'k':scriptOf(char));
    last=match.index+match[0].length;
  }
  out+=text.slice(last);outScripts.push(...scripts.slice(last));
  return {text:out,scripts:outScripts};
}

const strip=(text:string)=>text.replace(/\s+/g,'');
// The parts of an ingredient line that are names: "塩・こしょう" is two, "砂糖（またはきび砂糖）" has an alternative.
function nameParts(name:string){
  const normal=name.normalize('NFKC'),parts:string[]=[];
  for(const [,inside] of normal.matchAll(/[（(]([^）)]*)[）)]/g)){
    const alternative=inside.match(/(?:または|もしくは|なければ|or)\s*(.+)$/i);
    if(alternative)parts.push(alternative[1]);
  }
  const base=strip(normal.replace(/[（(][^）)]*[）)]/g,''));
  if(base)parts.push(base,...base.split(/[・、,／/]|または|もしくは/));
  if(base==='塩こしょう'||base==='塩胡椒')parts.push('塩','こしょう');
  return [...new Set(parts.map(strip).filter(Boolean))];
}

// Every name a step might use for this ingredient, folded.
export function ingredientKeys(name:string):string[]{
  const keys=new Set<string>();
  const add=(key:Folded)=>{if(key.text.length>=2||SINGLE.has(key.text))keys.add(key.text);};
  const slice=(word:Folded,start:number,end=word.text.length):Folded=>({text:word.text.slice(start,end),scripts:word.scripts.slice(start,end)});
  for(const part of nameParts(name)){
    const queue=[fold(part)],seen=new Set<string>();
    while(queue.length){
      const word=queue.shift()!,{text,scripts}=word;
      if(seen.has(text)||!text)continue;seen.add(text);
      if(seen.size===1)keys.add(text);else add(word);
      // Japanese puts the thing last: 長ねぎ→ねぎ, 木綿豆腐→豆腐, 薄口しょうゆ→しょうゆ.
      for(let i=1;i<text.length-1;i++){
        if(scripts[i-1]!==scripts[i]){
          const tail=slice(word,i);
          // A tail like "の素" is a particle plus a word, not a name.
          if(tail.scripts[0]!=='h'||tail.scripts.every(s=>s==='h'))add(tail);
        }
        if(scripts[i]==='c'&&/^[一-鿿]{2,}$/.test(text.slice(i)))add(slice(word,i));
      }
      for(const prefix of PREFIXES)if(text.startsWith(prefix)&&text.length>prefix.length)queue.push(slice(word,prefix.length));
      for(const suffix of SUFFIXES)if(text.endsWith(suffix)&&text.length>suffix.length)queue.push(slice(word,0,text.length-suffix.length));
    }
  }
  const all=[...keys].join(' ');
  // Meat is written by its animal: 豚バラ薄切り肉, 鶏もも肉, 豚こま → 豚肉 / 鶏肉 / 牛肉.
  if(/肉|こま|ばら|ろーす|もも|むね|ひれ|ささみ|ひき/.test(all))for(const animal of ['豚','牛','鶏'])if(all.includes(animal))keys.add(`${animal}肉`);
  if(/ひき肉|合いびき/.test(all))keys.add('ひき肉');
  // Any oil is "油" in a step: サラダ油, ごま油, オリーブオイル → 油をひく. ごま油 itself still wins over it in "ごま油で".
  if([...keys].some(key=>/(油|おいる)$/.test(key)))keys.add('油');
  // A cut or a container on its own (薄切り, 缶) is not a name.
  const forms=new Set([...PREFIXES,...SUFFIXES]);
  return [...keys].filter(key=>!forms.has(key));
}

// Does this occurrence stand as a word of its own?
function standsAlone(step:Folded,start:number,end:number,key:string){
  const {text,scripts}=step,before=start>0?scripts[start-1]:'o',after=end<text.length?scripts[end]:'o';
  const matched=scripts.slice(start,end);
  // Katakana runs are whole words: トマト is not in トマトケチャップ, ツナ is in ツナ缶.
  if(matched[0]==='k'&&before==='k')return false;
  if(matched[matched.length-1]==='k'&&after==='k')return false;
  // A short kana name inside a run of kana is usually another word (ほんのり, たまねぎ, ごまかす).
  if(key.length<=2&&matched.every(s=>s==='h')){
    if(before==='h'&&!PARTICLE.has(text[start-1]))return false;
    if(after==='h'&&!PARTICLE.has(text[end]))return false;
  }
  // One kanji next to another kanji is a different word (塩分, 酢豚, 流水), unless it's still this food.
  if(key.length===1){
    if(before==='k'||after==='k')return false;
    if(before==='c'&&!SINGLE_OK.has(text[start-1]+key))return false;
    if(after==='c'&&!SINGLE_OK.has(key+text[end]))return false;
  }
  return true;
}

type Hit={owner:number;start:number;end:number};
// Which of `names` the text names, as a flag per name.
export function namedIn(names:string[],raw:string):boolean[]{
  const step=fold(raw),hits:Hit[]=[],keysOf=names.map(name=>name?ingredientKeys(name):[]);
  const ownKeys=new Set(keysOf.flat());
  const find=(owner:number,key:string)=>{for(let at=step.text.indexOf(key);at>=0;at=step.text.indexOf(key,at+1))if(owner<0||standsAlone(step,at,at+key.length,key))hits.push({owner,start:at,end:at+key.length});};
  keysOf.forEach((keys,owner)=>keys.forEach(key=>find(owner,key)));
  for(const word of OTHER_WORDS)if(!ownKeys.has(word))find(-1,word);
  // Longest first; a real name beats an unrelated word of the same length.
  hits.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||(a.owner<0?1:0)-(b.owner<0?1:0));
  const taken:Hit[]=[],found=names.map(()=>false);
  for(const hit of hits){
    const clash=taken.some(t=>t.owner!==hit.owner&&t.start<hit.end&&hit.start<t.end&&!(t.owner>=0&&hit.owner>=0&&t.start===hit.start&&t.end===hit.end));
    if(clash)continue;
    taken.push(hit);if(hit.owner>=0)found[hit.owner]=true;
  }
  return found;
}
