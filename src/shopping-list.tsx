import {AnimatePresence,motion,useIsPresent,useReducedMotion} from 'motion/react';
import {haptic} from './haptics';
import {Check,Trash2} from 'lucide-react';
import type {ShoppingItem} from './domain';

type ItemActions={disabled?:boolean;onToggle:(item:ShoppingItem)=>void;onRemove:(item:ShoppingItem)=>void};
function ShoppingEntry({item,disabled,onToggle,onRemove}:{item:ShoppingItem}&ItemActions){
  const reduced=useReducedMotion(),present=useIsPresent();
  return <motion.div className="shopping-entry" role="listitem" data-item-id={item.id} inert={!present} aria-hidden={!present||undefined}
    initial={reduced?false:{height:0,opacity:0,y:-8}} animate={{height:'auto',opacity:1,y:0,x:0,filter:'blur(0px)'}}
    exit={{height:0,opacity:0,x:reduced?0:18,filter:reduced?'blur(0px)':'blur(3px)'}}
    transition={{duration:reduced?0:.32,ease:[.22,1,.36,1],opacity:{duration:reduced?0:.2},height:{duration:reduced?0:.32}}}>
    <div className={`shopping-row${item.done?' done':''}`}>
      <button type="button" className="shopping-item-toggle" role="checkbox" aria-checked={item.done} disabled={disabled}
        aria-label={`${[item.name,item.quantity].filter(Boolean).join(' ')}を${item.done?'未購入に戻す':'購入済みにする'}`} onClick={()=>{haptic();onToggle(item);}}>
        <span className="shopping-check" aria-hidden="true">{item.done&&<Check size={15}/>}</span>
        <span className="shopping-item-copy"><strong>{item.name}</strong>{item.quantity&&<span className="shopping-quantity">{item.quantity}</span>}</span>
      </button>
      <button type="button" className="row-icon" aria-label={`${item.name}を削除`} disabled={disabled} onClick={()=>onRemove(item)}><Trash2 size={18}/></button>
    </div>
  </motion.div>;
}
export function ShoppingList({items,label='今回の買い物',...actions}:{items:ShoppingItem[];label?:string}&ItemActions) {
  return <div className="shopping-list" role="list" aria-label={label}>
    <AnimatePresence initial={false}>
      {items.map(item=><ShoppingEntry key={item.id} item={item} {...actions}/>)}
    </AnimatePresence>
  </div>;
}
