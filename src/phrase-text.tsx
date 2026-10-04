import {Fragment} from 'react';
import {phrases} from './phrases';

export function PhraseText({text}:{text:string}){
  const parts=phrases(text);
  return <span className="phrase-text">{parts.map((part,i)=><Fragment key={i}>{i>0&&<wbr/>}{part}</Fragment>)}</span>;
}
