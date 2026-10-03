// Bound the composited backdrop to the live panel, independently of the glass
// layer's cached size. Border-radius alone does not provide this paint boundary.
export function boundPanelGlass(frame:HTMLElement):()=>void {
  const glass=frame.querySelector<HTMLElement>(':scope > .card-panel-glass');
  if(!glass)return()=>{};
  const previous=glass.style.clipPath;
  const update=()=>{
    const style=getComputedStyle(frame);
    const width=parseFloat(style.width),height=parseFloat(style.height);
    if(!(width>0&&height>0))return;
    const r=Math.min(parseFloat(style.borderTopLeftRadius)||0,width/2,height/2);
    const path=`M ${r} 0 H ${width-r} A ${r} ${r} 0 0 1 ${width} ${r} V ${height-r} A ${r} ${r} 0 0 1 ${width-r} ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height-r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    glass.style.clipPath=`path("${path}")`;
  };
  update();
  const observer=new ResizeObserver(update);
  observer.observe(frame);
  return()=>{observer.disconnect();glass.style.clipPath=previous;};
}
