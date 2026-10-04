import {useLayoutEffect,useRef} from 'react';

const ios=typeof navigator!=='undefined'&&(/iP(hone|ad|od)/.test(navigator.userAgent)||navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform));
// iOS has no vibration API and plays its system tick only when a finger itself
// toggles a native switch. Controls that tick on iPhone carry an invisible
// switch over their surface; the tap lands on it and bubbles to the control.
// Android ticks through haptic() instead, so the layer is left out there.
export function HapticTouch({disabled=false}:{disabled?:boolean}){
  const input=useRef<HTMLInputElement>(null);
  useLayoutEffect(()=>{const host=input.current?.parentElement;if(host&&getComputedStyle(host).position==='static')host.style.position='relative';},[]);
  if(!ios)return null;
  return <input ref={input} type="checkbox" {...{switch:''}} className="haptic-touch" tabIndex={-1} aria-hidden="true" disabled={disabled}/>;
}
