import {useLayoutEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {panelEditor,revealPanelField} from './panel-focus';

// Panels keep the full layout viewport. Only the dock follows the space above
// the keyboard; the focused field is revealed inside the unchanged panel.
export function FloatingViewport({children}:{children:ReactNode}){
  const root=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const node=root.current!,viewport=window.visualViewport;
    let frame=0,revealFrame=0,lastHeight=0,lastLayoutHeight=0,revealRequested=false;
    const update=()=>{
      if(viewport&&Math.abs(viewport.scale-1)>=.01)return;
      const layoutHeight=window.innerHeight,height=viewport?.height??layoutHeight;
      const changed=Math.abs(height-lastHeight)>1||Math.abs(layoutHeight-lastLayoutHeight)>1;
      if(changed){
        node.style.height=`${layoutHeight}px`;
        node.style.setProperty('--dock-keyboard-inset',`${Math.max(0,layoutHeight-height)}px`);
        lastHeight=height;lastLayoutHeight=layoutHeight;
      }
      node.dataset.keyboard=String(layoutHeight-height>=120);
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
