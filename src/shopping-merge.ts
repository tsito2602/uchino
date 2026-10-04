// Adding an ingredient that is already on the list (and not yet bought) adds
// to that line instead of making a second one: 卵 2個 + 卵 1個 → 卵 3個.
// Amounts in different units are kept side by side: 大さじ1 ＋ 50 ml.
const AMOUNT=/^(約)?\s*(?:(\d+)\/(\d+)|(\d+(?:\.\d+)?)(?:と(\d+)\/(\d+))?)\s*(.*)$/;
const PREFIX=/^(大さじ|小さじ|カップ)\s*(?:(\d+)\/(\d+)|(\d+(?:\.\d+)?)(?:と(\d+)\/(\d+))?)$/;
type Amount={value:number;unit:string;before:boolean};
function number(whole?:string,n?:string,d?:string,fn?:string,fd?:string){
  if(fn&&fd)return Number(fn)/Number(fd);
  return Number(whole??0)+(n&&d?Number(n)/Number(d):0);
}
function parse(text:string):Amount|null{
  const value=text.normalize('NFKC').trim();if(!value)return null;
  const prefix=value.match(PREFIX);
  if(prefix)return {value:number(prefix[4],prefix[5],prefix[6],prefix[2],prefix[3]),unit:prefix[1],before:true};
  const plain=value.match(AMOUNT);
  if(plain&&!plain[1])return {value:number(plain[4],plain[5],plain[6],plain[2],plain[3]),unit:plain[7].trim(),before:false};
  return null;
}
function format(value:number){
  if(Number.isInteger(value))return String(value);
  const whole=Math.floor(value),rest=value-whole;
  for(const d of [2,3,4]){const n=Math.round(rest*d);if(n>0&&n<d&&Math.abs(rest-n/d)<1e-6)return whole?`${whole}と${n}/${d}`:`${n}/${d}`;}
  return String(Math.round(value*10)/10);
}
export function mergeQuantity(a:string,b:string){
  if(!a.trim())return b;if(!b.trim())return a;
  const x=parse(a),y=parse(b);
  if(x&&y&&x.unit===y.unit&&x.before===y.before){const sum=format(x.value+y.value);return x.before?`${x.unit}${sum}`:x.unit?`${sum} ${x.unit}`:sum;}
  return `${a} ＋ ${b}`;
}
export const sameItem=(a:string,b:string)=>a.normalize('NFKC').replace(/\s+/g,'')===b.normalize('NFKC').replace(/\s+/g,'');
