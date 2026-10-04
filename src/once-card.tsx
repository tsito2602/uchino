import {useRef,useState} from 'react';
import {KeyRound,UserRoundPlus,UsersRound} from 'lucide-react';

const seen=(key:string)=>{try{return localStorage.getItem(key)==='1';}catch{return true;}};
const remember=(key:string)=>{try{localStorage.setItem(key,'1');}catch{/* Storage may be unavailable. */}};

// Offered once, after a recipe lands in a book that only its owner uses: invite
// the partner, or join the partner's book with the code they sent. Answering
// either way, or choosing later, folds the card away for good.
export function PartnerOffer({spaceId,onInvite,onJoin}:{spaceId:string;onInvite:(source:HTMLElement)=>void;onJoin:(source:HTMLElement)=>void}){
  const key=`uchino-partner-offered:${spaceId}`;
  const [open,setOpen]=useState(()=>!seen(key)),card=useRef<HTMLElement>(null);
  if(!open)return null;
  function close(){
    remember(key);const element=card.current;
    if(!element||window.matchMedia('(prefers-reduced-motion: reduce)').matches){setOpen(false);return;}
    element.style.overflow='hidden';
    void element.animate([{height:`${element.offsetHeight}px`,opacity:1,filter:'blur(0px)'},{height:'0px',marginBottom:'0px',paddingBlock:'0px',opacity:0,filter:'blur(3px)'}],{duration:520,easing:'cubic-bezier(.22,.72,.18,1)',fill:'forwards'}).finished.finally(()=>setOpen(false));
  }
  const choose=(action:(source:HTMLElement)=>void)=>(event:{currentTarget:HTMLElement})=>{const source=event.currentTarget;action(source);close();};
  return <section ref={card} className="clipboard-link once-card" aria-label="パートナーと使う">
    <div className="clipboard-link-copy"><span className="clipboard-link-icon" aria-hidden="true"><UsersRound size={22}/></span><div><h3>パートナーと使う？</h3><p>招待するか、受け取った招待コードを入力すると、レシピ帳をふたりで使えます</p></div></div>
    <div className="clipboard-link-actions once-card-actions">
      <button type="button" className="clipboard-link-use" onClick={choose(onInvite)}><UserRoundPlus size={17}/>パートナーを招待する</button>
      <button type="button" onClick={choose(onJoin)}><KeyRound size={17}/>招待コードを入力する</button>
      <button type="button" className="once-card-later" onClick={close}>あとで</button>
    </div>
  </section>;
}
