import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneTheme,applySceneTheme} from '../src/theme.js';
const luminance=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('all text and action labels remain readable across light, reversed, and low-contrast palettes',()=>{
 for(const [ink,paper] of [['#000000','#ffffff'],['#ffffff','#000000'],['#888888','#888888'],['#17171a','#29292b'],['#8d7563','#e9debf'],['#ff0000','#00ff00']]){
  for(let strength=0;strength<=2;strength+=.05){
   const t=sceneTheme({ink,paper,strength});
   for(const key of ['--text','--muted'])assert.ok(ratio(t[key],t['--surface'])>=4.5,`${ink}/${paper} ${strength}: ${key}`);
   assert.ok(ratio(t['--accent'],t['--on-accent'])>=4.5);
   assert.ok(ratio(t['--text'],t['--hover'])>=4.5);
  }
 }
});
test('monochrome palettes produce monochrome chrome and darkening responds to light strength',()=>{
 let previous=-1;
 for(const strength of [0,.1,.25,.5,1,2]){
  const t=sceneTheme({ink:'#000000',paper:'#dddddd',strength});
  const l=luminance(t['--surface']);assert.ok(l>previous);previous=l;
  for(const value of Object.values(t).filter(v=>v.startsWith('#'))){assert.equal(value.slice(1,3),value.slice(3,5));assert.equal(value.slice(3,5),value.slice(5,7));}
 }
});
test('palette changes propagate and disabling dither follows the unpaletted renderer',()=>{
 assert.notEqual(sceneTheme({paper:'#aaaaaa'})['--surface'],sceneTheme()['--surface']);
 assert.deepEqual(sceneTheme({ink:'#ff0000',paper:'#0000ff',dither:0}),sceneTheme({dither:0}));
 const properties=new Map();applySceneTheme({style:{setProperty:(k,v)=>properties.set(k,v)}},{strength:0,ink:'#000000'});
 assert.equal(properties.get('--surface'),'#000000');assert.equal(properties.get('color-scheme'),'dark');
});
