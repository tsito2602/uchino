import {useLayoutEffect,useRef} from 'react';

export const ios=typeof navigator!=='undefined'&&(/iP(hone|ad|od)/.test(navigator.userAgent)||navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform));
// iOS has no vibration API and plays its system tick only when a finger itself
// toggles a native switch. Controls that tick on iPhone carry an invisible
// label over their surface, wired to a tiny switch the finger never lands on.
// A switch under the finger grabs the touch to slide its thumb, which stops
// the page from scrolling; a label leaves the gesture to the browser, so a
// drag that starts on a control still scrolls and lifting the finger after it
// presses nothing. A tap on the label toggles the switch first, and only then
// is the press handed to the control, so a control that re-renders or
// disappears on press cannot remove the switch before it has ticked.
// Android ticks through haptic() instead, so the layer is left out there.
// Activating a label focuses its control in some browsers; the switch hands
// focus straight back so a tap never closes the keyboard or blurs an editor.
export function returnFocus(event:FocusEvent){
  const back=event.relatedTarget;
  if(back instanceof HTMLElement&&back.isConnected)back.focus({preventScroll:true});
  else (event.currentTarget as HTMLElement).blur();
}
export function HapticTouch(){
  const layer=useRef<HTMLLabelElement>(null),pressed=useRef(false);
  useLayoutEffect(()=>{
    const node=layer.current,host=node?.parentElement,input=node?.firstElementChild;if(!node||!host||!input)return;
    host.setAttribute('data-haptic-host','');
    // The native change event fires after the toggle is complete (React's
    // onChange for checkboxes fires earlier, during the click).
    const press=()=>{if(!pressed.current)return;pressed.current=false;host.click();};
    input.addEventListener('change',press);input.addEventListener('focus',returnFocus as EventListener);
    return()=>{input.removeEventListener('change',press);input.removeEventListener('focus',returnFocus as EventListener);};
  },[]);
  if(!ios)return null;
  // The label's own click must not reach the control: the press is handed
  // over once, after the switch has toggled.
  return <label ref={layer} className="haptic-touch" aria-hidden="true" onClick={event=>event.stopPropagation()}>
    <input type="checkbox" {...{switch:''}} tabIndex={-1} onClick={event=>{event.stopPropagation();pressed.current=true;}}/>
  </label>;
}
