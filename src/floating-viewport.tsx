import {useLayoutEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {panelEditor,revealPanelField} from './panel-focus';

// One coordinate system for every panel and its dock. The overlay lock prevents
// native iOS focus panning; this layer sizes the panel and reveals its input
// after the keyboard resizes, without scrolling the page or repositioning the dock.
export function FloatingViewport({children}:{children:ReactNode}){
  const root=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const node=root.current!,viewport=window.visualViewport;
    let frame=0,revealFrame=0,lastHeight=0,revealRequested=false;
    const update=()=>{
      const height=viewport&&Math.abs(viewport.scale-1)<.01?viewport.height:window.innerHeight;
      const changed=Math.abs(height-lastHeight)>1;
      if(changed){node.style.height=`${height}px`;lastHeight=height;}
      node.dataset.keyboard=String(window.innerHeight-height>=120);
      if(changed||revealRequested){
        cancelAnimationFrame(revealFrame);
        revealFrame=requestAnimationFrame(()=>revealPanelField(document.activeElement));
      }
      revealRequested=false;
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
    const focus=()=>{revealRequested=!!panelEditor(document.activeElement);schedule();};
    update();
    viewport?.addEventListener('resize',schedule);window.addEventListener('resize',schedule);
    node.addEventListener('focusin',focus);
    return()=>{
      cancelAnimationFrame(frame);cancelAnimationFrame(revealFrame);
      viewport?.removeEventListener('resize',schedule);window.removeEventListener('resize',schedule);
      node.removeEventListener('focusin',focus);
    };
  },[]);
  return createPortal(<div className="floating-viewport" ref={root}>{children}</div>,document.body);
}
