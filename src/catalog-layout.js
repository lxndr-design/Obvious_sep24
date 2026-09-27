import {LABELS} from './shapes.js';
import {HOUSEHOLD_LABELS} from './household.js';

// Old size-specific type names remain loadable, but are not separate designs.
export const CATALOG_TYPES=[
 'letter','board','box','sphere','cylinder','arch','pebble','pool','hedge','stick',
 'bench','birdbath','fountain','table-round-full','table-square-full',
 'plant-snake-medium','plant-rubber-medium','plant-succulent-medium',
 ...Object.keys(HOUSEHOLD_LABELS),
 ...Object.keys(LABELS).filter(type=>type.startsWith('grandma-')),
 ...Object.keys(LABELS).filter(type=>type.startsWith('sign-')),
];
export const CATALOG_ROWS=Math.ceil(CATALOG_TYPES.length/4);
export function catalogName(type){
 const name=type==='pool'?'Pool':type==='hedge'?'Hedge':LABELS[type].replace(/ · (small|medium|large|½|1\/1)$/i,'');
 return type.startsWith('sign-')&&type!=='sign-pole'?`${name} · ${type.endsWith('-text')?'text':'icon'}`:name;
}
export function catalogLayout(){
 return CATALOG_TYPES.flatMap((type,index)=>{
  const lane=Math.floor(index/CATALOG_ROWS),row=index%CATALOG_ROWS;
  return [1,2,3].map(size=>({type,size,index,x0:lane*9+[0,2,5][size-1],z0:row*4,
   get x(){return this.x0+this.size/2;},get z(){return this.z0+this.size/2;}}));
 });
}
