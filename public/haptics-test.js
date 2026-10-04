let kept=null;
function persistent(){
  if(kept?.isConnected)return kept;
  const label=document.createElement('label'),input=document.createElement('input');
  input.type='checkbox';input.setAttribute('switch','');input.tabIndex=-1;
  label.setAttribute('aria-hidden','true');label.style.cssText='position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;clip-path:inset(50%)';
  label.appendChild(input);document.body.appendChild(label);return kept=label;
}
function fresh(parent){
  const label=document.createElement('label'),input=document.createElement('input');
  input.type='checkbox';input.setAttribute('switch','');label.setAttribute('aria-hidden','true');label.style.display='none';
  label.appendChild(input);parent.appendChild(label);label.click();parent.removeChild(label);
}
const log=text=>{document.getElementById('info').textContent+=text+'\n';};
document.getElementById('a').onclick=()=>{persistent().click();log('A');};
document.getElementById('b').onclick=()=>{fresh(document.head);log('B');};
document.getElementById('c').onclick=()=>{fresh(document.body);log('C');};
document.getElementById('d').onclick=()=>{fresh(document.head);setTimeout(()=>fresh(document.head),90);log('D');};
document.getElementById('e').onclick=()=>{log('E vibrate='+(typeof navigator.vibrate==='function'?navigator.vibrate(12):'なし'));};
log(navigator.userAgent);
log('standalone='+(matchMedia('(display-mode: standalone)').matches||navigator.standalone===true));
log('vibrate='+typeof navigator.vibrate);
