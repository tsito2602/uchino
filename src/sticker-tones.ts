// Pastel sticker colours shared by the import card, ingredient checks and the
// shopping list, so a ticked item looks like the same sticker everywhere.
export const stickerTones=['#ffe08a','#ffb3c7','#a8e6cf','#a7c7ff','#d7b8ff','#ffd0a8'];
export function stickerTone(key:string|number){
  if(typeof key==='number')return stickerTones[key%stickerTones.length];
  let value=2166136261;for(const char of key)value=Math.imul(value^char.codePointAt(0)!,16777619);
  return stickerTones[(value>>>0)%stickerTones.length];
}
