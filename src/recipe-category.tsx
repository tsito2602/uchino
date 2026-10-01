import {Cookie,Ellipsis,LayoutGrid,Salad,Soup,Utensils,Wheat} from 'lucide-react';
import type {categories} from './domain';

const icons={'すべて':LayoutGrid,'主菜':Utensils,'副菜':Salad,'汁物':Soup,'主食':Wheat,'おやつ':Cookie,'その他':Ellipsis};
export function RecipeCategoryIcon({category,size=14}:{category:typeof categories[number];size?:number}){
  const Icon=icons[category];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true"/>;
}
