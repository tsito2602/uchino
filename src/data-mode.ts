import type {Recipe} from './domain';

export type DataMode = 'real' | 'demo';
export const demoScope = (scope:string) => `demo-${scope}`;
export const localOnlyScope = (scope:string) => scope==='guest'||scope.startsWith('demo-');
const preferenceKey = (scope:string) => `uchino-data-mode-${scope}`;

export function getDataMode(scope:string):DataMode|null {
  try { const value=localStorage.getItem(preferenceKey(scope));return value==='real'||value==='demo'?value:null; }
  catch { return null; }
}
export function rememberDataMode(scope:string,mode:DataMode) {
  try { localStorage.setItem(preferenceKey(scope),mode); } catch { /* Keep switching available for this session. */ }
}

// These IDs were reserved by the old sample button. Preserve their edits when
// moving them to the demo area; ordinary recipes with the same title stay real.
export function isLegacyDemoRecipe(recipe:Recipe) {
  return ['sample-ginger','sample-salad','sample-soup'].includes(recipe.id)
    || (recipe.title==='鶏肉ときのこのクリーム煮'&&recipe.memo.startsWith('デモ用レシピ。'));
}
