import {PRESET_NAMES} from './presets.js';
import {MATERIAL_KINDS} from './materials/index.js';
import {BEHAVIORS} from './sim/protocol.js';
import {LAYOUT_SHAPES} from './gen/series.js';

// Live banner config the editor panel binds to. patch() validates and clamps
// before anything touches the field, so a bad slider value can't corrupt a
// frame mid-flight. Subscribers re-run their generators on change.

export const BANNER_DEFAULTS={
 preset:'blob',material:'gloss',color:'#7fd4ff',behavior:null,
 count:24,shape:'arc',spacing:1.2,base:1,amplitude:.4,frequency:1,phase:0,volatility:.15,seed:7,
};

const RANGES={count:[1,5000],spacing:[.2,6],base:[.1,4],amplitude:[0,2],frequency:[0,8],volatility:[0,1]};
const CHOICES={preset:PRESET_NAMES,material:MATERIAL_KINDS,shape:LAYOUT_SHAPES};
const HEX=/^#[0-9a-f]{6}$/i;

export class BannerConfig{
 constructor(initial={}){
  this.values={...BANNER_DEFAULTS};
  this.subscribers=new Set();
  if(initial)patchValues(this,initial);
 }
 get(key){return this.values[key];}
 all(){return Object.freeze({...this.values});}
 patch(partial){
  const changed=patchValues(this,partial);
  if(changed.length)for(const fn of this.subscribers)fn(this.values,changed);
  return changed;
 }
 subscribe(fn){
  this.subscribers.add(fn);
  return()=>this.subscribers.delete(fn);
 }
}

function patchValues(config,partial){
 if(typeof partial!=='object'||partial===null)throw new TypeError('banner.patch expects an object');
 const changed=[];
 for(const[key,value]of Object.entries(partial)){
  if(!(key in BANNER_DEFAULTS))throw new TypeError(`Unknown banner key: ${key}`);
  const next=coerce(key,value);
  if(!Object.is(config.values[key],next)){
   config.values[key]=next;
   changed.push(key);
  }
 }
 return changed;
}

function coerce(key,value){
 const range=RANGES[key];
 if(range){
  const n=typeof value==='number'?value:Number(value);
  if(!Number.isFinite(n))throw new TypeError(`banner.${key} must be a number`);
  const clamped=Math.min(range[1],Math.max(range[0],n));
  return key==='count'?Math.round(clamped):clamped;
 }
 const choices=CHOICES[key];
 if(choices){
  if(!choices.includes(value))throw new TypeError(`banner.${key} must be one of ${choices.join('|')}`);
  return value;
 }
 if(key==='behavior'){
  if(value!==null&&!BEHAVIORS.includes(value))throw new TypeError(`banner.behavior must be null or one of ${BEHAVIORS.join('|')}`);
  return value;
 }
 if(key==='color'){
  if(typeof value!=='string'||!HEX.test(value))throw new TypeError('banner.color must be a #rrggbb hex string');
  return value;
 }
 if(key==='phase'){
  if(!Number.isFinite(value))throw new TypeError('banner.phase must be a number');
  return value;
 }
 if(key==='seed'){
  if(!Number.isInteger(value)||value<0)throw new TypeError('banner.seed must be a non-negative integer');
  return value;
 }
 throw new TypeError(`Unhandled banner key: ${key}`);
}
