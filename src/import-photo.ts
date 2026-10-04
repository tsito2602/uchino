// Transient source images are compressed in the browser before recipe storage.
export const MAX_IMPORT_PHOTO_BYTES=3_000_000;
export const MAX_IMPORT_PHOTO_LENGTH=40+4*Math.ceil(MAX_IMPORT_PHOTO_BYTES/3);
export function imageMime(bytes:Uint8Array):string|null {
  if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217)return 'image/jpeg';
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  return null;
}
export function importedPhotoBlob(value:string):Blob {
  if(value.length>MAX_IMPORT_PHOTO_LENGTH)throw new Error('Photo too large');
  const match=value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match||match[2].length%4)throw new Error('Invalid photo');
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
  if(bytes.length>MAX_IMPORT_PHOTO_BYTES||imageMime(bytes)!==match[1])throw new Error('Invalid photo');
  return new Blob([bytes],{type:match[1]});
}
