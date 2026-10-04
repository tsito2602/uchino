// A light tick for confirmed actions on Android, through the Vibration API.
// iPhone has no such API: it ticks only when a finger toggles a native switch,
// so controls that tick there carry a HapticTouch layer (haptic-touch.tsx).
export function haptic(){
  try{if(typeof navigator.vibrate==='function')navigator.vibrate(12);}catch{/* Haptics are a nicety only. */}
}
