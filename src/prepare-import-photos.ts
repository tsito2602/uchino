import {MAX_STEP_PHOTO_BYTES,STEP_PHOTOS_BUDGET} from './domain';
import type {ImportResult} from './import-model';
import {importedPhotoBlob} from './import-photo';
import {prepareRecipePhoto,type PhotoCrop} from './recipe-photo';

export async function prepareImportPhotos(imported:ImportResult,signal:AbortSignal){
  const prepare=async(photo:string,maxBytes?:number,crop?:PhotoCrop)=>{
    signal.throwIfAborted();const blob=importedPhotoBlob(photo);
    const result=await prepareRecipePhoto(new File([blob],'recipe-photo',{type:blob.type}),maxBytes,crop);
    signal.throwIfAborted();return result;
  };
  if(imported.photo){
    try{imported.recipe={...imported.recipe,photo:await prepare(imported.photo)};}
    catch{signal.throwIfAborted();imported.warnings=[...(imported.warnings||[]),'料理の写真を準備できませんでした。必要なら写真を追加してください。'];}
    delete imported.photo;
  }
  const photos:{index:number;photo:string;crop?:PhotoCrop}[]=Array.isArray(imported.stepPhotos)?imported.stepPhotos.filter(p=>p&&Number.isInteger(p.index)&&p.index>=0&&p.index<imported.recipe.steps.length).slice(0,100):[];
  if(Array.isArray(imported.stepPhotoSheets))for(const sheet of imported.stepPhotoSheets.slice(0,16)){
    if(!sheet||!Number.isInteger(sheet.width)||!Number.isInteger(sheet.height)||sheet.width<1||sheet.height<1||sheet.width>4096||sheet.height>4096||!Array.isArray(sheet.frames))continue;
    for(const frame of sheet.frames.slice(0,100)){
      if(photos.length>=100)break;
      if(!frame||!Number.isInteger(frame.index)||frame.index<0||frame.index>=imported.recipe.steps.length)continue;
      photos.push({index:frame.index,photo:sheet.photo,crop:{x:frame.x,y:frame.y,width:frame.width,height:frame.height,sheetWidth:sheet.width,sheetHeight:sheet.height}});
    }
  }
  if(photos.length){
    const stepPhotos=imported.recipe.steps.map(()=>''),seen=new Set<number>();let failed=false;
    const maxBytes=Math.min(MAX_STEP_PHOTO_BYTES,Math.floor(STEP_PHOTOS_BUDGET/photos.length));
    for(const item of photos){
      if(seen.has(item.index))continue;seen.add(item.index);
      try{stepPhotos[item.index]=await prepare(item.photo,maxBytes,item.crop);}catch{signal.throwIfAborted();failed=true;}
    }
    imported.recipe={...imported.recipe,stepPhotos};
    if(failed)imported.warnings=[...(imported.warnings||[]),'一部の手順写真を準備できませんでした。必要なら各手順に写真を追加してください。'];
  }
  delete imported.stepPhotos;delete imported.stepPhotoSheets;
}
