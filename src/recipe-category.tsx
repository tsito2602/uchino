import {Cookie,Ellipsis,LayoutGrid,Salad,Soup,Utensils} from 'lucide-react';
import type {categories} from './domain';

function RiceBowl({size=14}:{size?:number}){
  return <svg className="recipe-rice-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11h18c-.5 4.5-3.4 7-9 7s-8.5-2.5-9-7Z M9 18l-1 3h8l-1-3 M4 11V9a3 3 0 0 1 3-3 3 3 0 0 1 5-1.5A3 3 0 0 1 17 6a3 3 0 0 1 3 3v2"/>
    <path d="m8 8 1 .5 m4-1 .5 1 m3 .5 1-.5"/>
  </svg>;
}
const icons={'すべて':LayoutGrid,'主菜':Utensils,'副菜':Salad,'汁物':Soup,'主食':RiceBowl,'おやつ':Cookie,'その他':Ellipsis};
export function RecipeCategoryIcon({category,size=14}:{category:typeof categories[number];size?:number}){
  const Icon=icons[category];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true"/>;
}
