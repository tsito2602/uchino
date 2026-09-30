import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {Check,Trash2} from 'lucide-react';
import type {ShoppingItem} from './domain';

export function ShoppingList({items,disabled=false,onToggle,onRemove,label='今回の買い物'}:{items:ShoppingItem[];disabled?:boolean;onToggle:(item:ShoppingItem)=>void;onRemove:(item:ShoppingItem)=>void;label?:string}) {
  const reduced=useReducedMotion();
  return <div className="shopping-list" role="list" aria-label={label}>
    <AnimatePresence initial={false}>
      {items.map(item=><motion.div className="shopping-entry" role="listitem" key={item.id} data-item-id={item.id}
        initial={reduced?false:{height:0,opacity:0,y:-8}} animate={{height:'auto',opacity:1,y:0}}
        transition={{duration:reduced?0:.26,ease:[.22,1,.36,1]}}>
        <div className={`shopping-row${item.done?' done':''}`}>
          <button type="button" className="shopping-item-toggle" role="checkbox" aria-checked={item.done} disabled={disabled}
            aria-label={`${[item.name,item.quantity].filter(Boolean).join(' ')}を${item.done?'未購入に戻す':'購入済みにする'}`} onClick={()=>onToggle(item)}>
            <span className="shopping-check" aria-hidden="true">{item.done&&<Check size={15}/>}</span>
            <span className="shopping-item-copy"><strong>{item.name}</strong>{item.quantity&&<span className="shopping-quantity">{item.quantity}</span>}</span>
          </button>
          <button type="button" className="row-icon" aria-label={`${item.name}を削除`} disabled={disabled} onClick={()=>onRemove(item)}><Trash2 size={18}/></button>
        </div>
      </motion.div>)}
    </AnimatePresence>
  </div>;
}
