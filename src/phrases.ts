// Japanese titles wrap only between phrases (「鶏肉ときのこの／クリーム煮」), not
// mid-word. Safari has no word-break:auto-phrase, so phrases come from script
// runs: kanji or katakana after kana ending in a particle starts a phrase, as
// does katakana after a longer kana word (「ささみのしそ／チーズ焼き」).
const RUN=/[ぁ-ゟ]+|[一-鿿々]+|[゠-ヿ]+|[^ぁ-ゟ一-鿿々゠-ヿ]+/g;
const HIRAGANA=/^[ぁ-ゟ]+$/,KANJI=/^[一-鿿々]/,KATAKANA=/^[゠-ヿ]/;
const PARTICLE_END=/[のとやをにでへはがも]$/,BREAK_AFTER=/[\s、。・！？!?]$/;

export function phrases(text:string):string[]{
  const result:string[]=[];let previous='';
  for(const run of text.match(RUN)??[]){
    const last=result[result.length-1];
    const kana=HIRAGANA.test(previous);
    const split=last===undefined||BREAK_AFTER.test(last)||
      (kana&&(KANJI.test(run)||KATAKANA.test(run))&&PARTICLE_END.test(previous))||
      (kana&&KATAKANA.test(run)&&previous.length>=3);
    if(split)result.push(run);else result[result.length-1]=last+run;
    previous=run;
  }
  return result;
}
