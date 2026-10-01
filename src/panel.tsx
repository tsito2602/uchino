import {BorderBeam} from 'border-beam';
import {SoftOrbitGlow} from './soft-orbit-glow';
import {useRef,type ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
import {usePanelMorph,type PanelOrigin} from './use-panel-morph';
export function Panel({title,children,closing,onClose,onExited,origin,icon:Icon,processing=false,status,hideHeader=false}:{title:string;children:ReactNode;closing?:boolean;onClose:()=>void;onExited:()=>void;origin?:PanelOrigin;icon?:LucideIcon;processing?:boolean;status?:ReactNode;hideHeader?:boolean}){
  const panel=useRef<HTMLElement>(null);usePanelMorph(panel,origin,closing,onExited,onClose);
  return <div className="card-panel-backdrop"><div className="card-panel-scrim" onClick={onClose}/><div className="card-panel-frame"><div className="card-panel-glass"/>{processing&&<><SoftOrbitGlow/><div className="import-border-beam" aria-hidden="true"><BorderBeam size="md" theme="light" colorVariant="colorful" borderRadius={28} style={{position:'absolute',inset:0}}><div style={{height:'100%',borderRadius:28}}/></BorderBeam></div></>}<section className={`card-panel${processing?' statement-import-panel':''}`} data-processing={processing||undefined} data-headerless={hideHeader||undefined} role="dialog" aria-modal="true" aria-labelledby="panel-title" ref={panel}>{hideHeader?<h2 id="panel-title" className="visually-hidden" tabIndex={-1}>{title}</h2>:<header className="card-panel-header"><h2 id="panel-title" tabIndex={-1}>{Icon&&<Icon size={20} aria-hidden="true"/>}{title}</h2></header>}{status}<div className="card-panel-scroll">{children}</div></section></div></div>;
}
