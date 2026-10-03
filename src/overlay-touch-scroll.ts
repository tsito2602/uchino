// iOS can pan the visual viewport with a keyboard open even when body is fixed.
// Consume only gestures that cannot scroll a live overlay, before that pan starts.
export function guardOverlayTouchScroll(doc:Document):()=>void {
  let point:{id:number;x:number;y:number;target:Element}|null=null;
  const start=(event:TouchEvent)=>{
    const touch=event.touches[0];
    point=event.touches.length===1&&event.target instanceof Element
      ?{id:touch.identifier,x:touch.clientX,y:touch.clientY,target:event.target}:null;
  };
  const move=(event:TouchEvent)=>{
    if(!point||event.touches.length!==1)return;
    const touch=Array.from(event.touches).find(t=>t.identifier===point!.id);
    if(!touch)return;
    const dx=point.x-touch.clientX,dy=point.y-touch.clientY;
    point.x=touch.clientX;point.y=touch.clientY;
    if(!dx&&!dy)return;
    // Let the browser handle pinch zoom and horizontal caret positioning.
    if(Math.abs(dx)>Math.abs(dy)&&point.target.matches('input,textarea'))return;
    const overlay=point.target.closest('.card-panel,.fuse-add-options');
    if(overlay&&!overlay.closest('[inert]')){
      for(let node:Element|null=point.target;node;node=node.parentElement){
        const style=getComputedStyle(node);
        const vertical=Math.abs(dy)>=Math.abs(dx);
        const overflow=vertical?style.overflowY:style.overflowX;
        const delta=vertical?dy:dx;
        const position=vertical?node.scrollTop:node.scrollLeft;
        const limit=vertical?node.scrollHeight-node.clientHeight:node.scrollWidth-node.clientWidth;
        if(/^(auto|scroll)$/.test(overflow)&&limit>1&&
          (delta<0&&position>0||delta>0&&position<limit-1))return;
        if(node===overlay)break;
      }
    }
    if(event.cancelable)event.preventDefault();
  };
  const end=()=>{point=null;};
  doc.addEventListener('touchstart',start,{capture:true,passive:true});
  doc.addEventListener('touchmove',move,{capture:true,passive:false});
  doc.addEventListener('touchend',end,true);doc.addEventListener('touchcancel',end,true);
  return()=>{
    doc.removeEventListener('touchstart',start,true);doc.removeEventListener('touchmove',move,true);
    doc.removeEventListener('touchend',end,true);doc.removeEventListener('touchcancel',end,true);
  };
}
