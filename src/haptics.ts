// A light tick for confirmed actions. Android uses the Vibration API. iOS
// Safari (18+) has none, but tapping a native switch plays the system haptic,
// so a fresh, undisplayed switch is clicked inside the same tap and removed.
// iOS only honours this during a tap, so ticks after async work stay silent.
export function haptic(){
  try{
    if(typeof navigator.vibrate==='function'){navigator.vibrate(12);return;}
    if(!/iP(hone|ad|od)/.test(navigator.userAgent)&&!(navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform)))return;
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';input.setAttribute('switch','');
    label.setAttribute('aria-hidden','true');label.style.display='none';
    label.appendChild(input);document.head.appendChild(label);label.click();label.remove();
  }catch{/* Haptics are a nicety only. */}
}
