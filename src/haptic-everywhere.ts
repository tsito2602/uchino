import {ios,returnFocus} from './haptic-touch';

// On iPhone every tappable control ticks, not only the ones that render a
// <HapticTouch/> themselves: each one gets the same invisible native switch
// over its surface. React may wipe it when it rewrites a control's text, so
// the switches are put back whenever the tree changes.
const tappable='button,a[href],[role=button],[role=menuitem],[role=tab],[role=option],[role=switch]';

function equip(host:HTMLElement){
  const own=host.querySelectorAll<HTMLElement>(':scope>.haptic-touch');
  if(own.length>1)for(const layer of own)if(layer.dataset.auto)layer.remove();
  // A label inside another label would hand the tap to the outer one.
  if(own.length||host.closest('[data-no-haptic],label')||host.matches('input,select,textarea'))return;
  const layer=document.createElement('label'),input=document.createElement('input');
  layer.className='haptic-touch';layer.setAttribute('aria-hidden','true');layer.dataset.auto='1';
  input.type='checkbox';input.setAttribute('switch','');input.tabIndex=-1;
  let pressed=false;
  layer.addEventListener('click',event=>event.stopPropagation());
  input.addEventListener('click',event=>{event.stopPropagation();pressed=true;});
  input.addEventListener('change',()=>{if(!pressed)return;pressed=false;host.click();});
  input.addEventListener('focus',returnFocus);
  layer.appendChild(input);
  host.setAttribute('data-haptic-host','');
  host.appendChild(layer);
}

export function hapticEverywhere(){
  if(!ios)return;
  let queued=false;
  const scan=()=>{queued=false;for(const host of document.querySelectorAll<HTMLElement>(tappable))equip(host);};
  new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(scan);}}).observe(document.body,{childList:true,subtree:true});
  scan();
}
