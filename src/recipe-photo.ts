import {MAX_PHOTO_BYTES,MAX_PHOTO_URL_LENGTH,validRecipePhoto} from './domain';

export const PHOTO_INPUT_ACCEPT='image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
const types=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);

/** Re-encode on device: bound storage, apply browser image orientation and strip EXIF. */
export async function prepareRecipePhoto(file:File,maxBytes=MAX_PHOTO_BYTES):Promise<string> {
  maxBytes=Math.max(4000,Math.min(MAX_PHOTO_BYTES,maxBytes));
  if(!file.size||file.size>20_000_000)throw new Error('20MB以内の写真を選んでください。');
  if(!types.has(file.type)&&!(file.type===''&&/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)))throw new Error('JPEG・PNG・WebP・HEICの写真を選んでください。');
  const url=URL.createObjectURL(file),image=new Image();
  try{
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{image.src='';reject(new Error('写真の読み込みに時間がかかっています。別の写真をお試しください。'));},20000);
      image.onload=()=>{clearTimeout(timer);resolve();};
      image.onerror=()=>{clearTimeout(timer);reject(new Error('写真を読み込めませんでした。HEICが開けない場合はJPEGに変換して選んでください。'));};
      image.src=url;
    });
    if(!image.naturalWidth||!image.naturalHeight)throw new Error('写真を読み込めませんでした。');
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
    if(!context)throw new Error('この端末で写真を処理できませんでした。');
    try{
      for(const maxEdge of [1280,1024,800,640,480,320]){
        const scale=Math.min(1,maxEdge/Math.max(image.naturalWidth,image.naturalHeight));
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
        context.drawImage(image,0,0,canvas.width,canvas.height);
        for(const quality of [.86,.74,.62]){
          const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
          if(!blob||blob.size>maxBytes)continue;
          const photo=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('写真を読み込めませんでした。'));reader.readAsDataURL(blob);});
          if(photo.length<=MAX_PHOTO_URL_LENGTH&&validRecipePhoto(photo))return photo;
        }
      }
      throw new Error('写真を小さくできませんでした。別の写真をお試しください。');
    }finally{canvas.width=0;canvas.height=0;}
  }finally{image.src='';URL.revokeObjectURL(url);}
}
