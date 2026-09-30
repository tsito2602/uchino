import {useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {usePanelMorph,type PanelOrigin} from './use-panel-morph';
export function Panel({title,children,closing,onClose,onExited,origin}:{title:string;children:ReactNode;closing?:boolean;onClose:()=>void;onExited:()=>void;origin?:PanelOrigin}){
  const panel=useRef<HTMLElement>(null);usePanelMorph(panel,origin,closing,onExited,onClose);
  return createPortal(<div className="card-panel-backdrop"><div className="card-panel-scrim" onClick={onClose}/><div className="card-panel-frame"><div className="card-panel-glass"/><section className="card-panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" ref={panel}><header className="card-panel-header"><h2 id="panel-title" tabIndex={-1}>{title}</h2></header><div className="card-panel-scroll">{children}</div></section></div></div>,document.body);
}
