// A light tick for checks, picks and favorites. Android uses the Vibration API;
// iOS Safari (18+) has none, but toggling a native switch inside the same tap
// plays the system haptic, so a hidden switch is flipped instead.
let toggle:HTMLLabelElement|null=null;
function iosSwitch(){
  if(toggle?.isConnected)return toggle;
  const label=document.createElement('label'),input=document.createElement('input');
  input.type='checkbox';input.setAttribute('switch','');input.tabIndex=-1;
  label.setAttribute('aria-hidden','true');label.style.cssText='position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;clip-path:inset(50%)';
  label.appendChild(input);document.body.appendChild(label);return toggle=label;
}
export function haptic(){
  try{
    if(typeof navigator.vibrate==='function'){navigator.vibrate(8);return;}
    if(/iP(hone|ad|od)/.test(navigator.userAgent)||navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform))iosSwitch().click();
  }catch{/* Haptics are a nicety only. */}
}
