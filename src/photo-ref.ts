// Same-origin, account-scoped, immutable photo references. Never accept arbitrary
// URLs here: all requests go through the authenticated Worker.
export {photoReference} from './domain';
export async function photoHash(bytes:Uint8Array):Promise<string>{
  const hash=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
export function photoOwner(userId:string):Promise<string>{return photoHash(new TextEncoder().encode(`uchino-photo-owner:${userId}`));}
