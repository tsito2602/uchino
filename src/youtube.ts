const hosts=new Set(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be','youtube-nocookie.com','www.youtube-nocookie.com']);
export type YouTubeVideo={id:string;url:string};
export const isYouTubeHost=(url:URL)=>hosts.has(url.hostname.toLowerCase());
export function youtubeVideo(value:string|URL):YouTubeVideo|null {
  let url:URL;try{url=new URL(value);}catch{return null;}
  if(!isYouTubeHost(url)||!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)return null;
  const path=url.pathname.split('/').filter(Boolean);
  const id=url.hostname.endsWith('youtu.be')&&path.length===1?path[0]:url.pathname==='/watch'?url.searchParams.get('v'):['shorts','embed','live'].includes(path[0])&&path.length===2?path[1]:null;
  return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?{id,url:`https://www.youtube.com/watch?v=${id}`}:null;
}
export function youtubeStepUrl(value:string,seconds:number|null|undefined):string|null {
  const video=youtubeVideo(value);
  return video&&typeof seconds==='number'&&Number.isInteger(seconds)&&seconds>=0&&seconds<=86400?`${video.url}&t=${seconds}s`:null;
}
export const videoTime=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
