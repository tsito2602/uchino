// Adapted from kondo's viewport and FormBackButton helpers (MIT).
export function panelEditor(focused:Element|null):HTMLElement|null {
  if(!(focused instanceof HTMLElement)||!focused.closest('.card-panel')||focused.closest('[inert]'))return null;
  if(!focused.matches("input, textarea, select, [contenteditable='true']")||focused.matches(':disabled, [readonly], input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"], input[type="reset"], input[type="range"], input[type="file"], input[type="color"], input[type="hidden"]'))return null;
  return focused;
}

export function revealPanelField(focused:Element|null) {
  const editor=panelEditor(focused);
  const scroll=editor?.closest<HTMLElement>('.card-panel');
  if(!editor||!scroll)return;
  const bounds=scroll.getBoundingClientRect();
  const header=scroll.querySelector<HTMLElement>(':scope > .card-panel-header');
  const dock=scroll.closest('.floating-viewport')?.querySelector<HTMLElement>('.floating-nav-host');
  const top=Math.max(bounds.top,header?.getBoundingClientRect().bottom??bounds.top)+12;
  // The dock stays at the screen bottom, behind the keyboard. Use the visible
  // viewport as a separate boundary; Safari's focus-pan offset must not move it.
  const viewportBottom=window.visualViewport?.height??window.innerHeight;
  const bottom=Math.min(bounds.bottom,viewportBottom,dock?dock.getBoundingClientRect().top-16:bounds.bottom)-12;
  if(bottom<=top)return;
  const input=editor.getBoundingClientRect();
  const field=editor.closest('.field')?.getBoundingClientRect();
  const start=field&&input.bottom-field.top<=bottom-top?field.top:input.top;
  const end=Math.min(input.bottom,start+bottom-top);
  const delta=start<top?start-top:end>bottom?end-bottom:0;
  if(delta)scroll.scrollTop+=delta>0?Math.ceil(delta):Math.floor(delta);
}
