import {PlayCircle} from 'lucide-react';
import {youtubeStepUrl,videoTime} from './youtube';

export function RecipeVideoLink({url,seconds,step}:{url:string;seconds:number|null|undefined;step:number}){
  const href=youtubeStepUrl(url,seconds);
  return href?<a className="recipe-video-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={`手順${step}の動画を${videoTime(seconds!)}から見る`}><PlayCircle size={15}/>動画 {videoTime(seconds!)}</a>:null;
}
