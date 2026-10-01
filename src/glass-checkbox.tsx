import type {InputHTMLAttributes} from 'react';

// Keep the native input for keyboard, labels and long-press selection.
export function GlassCheckbox(props:Omit<InputHTMLAttributes<HTMLInputElement>,'type'>){
  return <span className="glass-checkbox" data-checked={props.checked||undefined}>
    <input {...props} type="checkbox"/>
    <svg className="glass-checkbox-mark" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 10 3.2 3.2L15 6.5" pathLength="1"/></svg>
    <span className="glass-checkbox-ring" aria-hidden="true"/>
  </span>;
}
