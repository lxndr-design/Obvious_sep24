import test from 'node:test';
import assert from 'node:assert/strict';
import {VARIANTS,validateVariant,validateBanner,validateScene,validateProfile,FILTER_PRESETS,FEEL_PRESETS,LIGHT_RIGS} from '../src/splash/demo/variants.js';

// Variant schema discipline (spec art_WSIRxV9E): every between-banner
// difference is data, validated at boot against whitelists — a bad key or
// value fails here with a named error, never mid-frame.

test('the column ships exactly the five spec variants in order',()=>{
 assert.deepEqual(VARIANTS.map(v=>v.id),['chrome','neon','porcelain','deep','custom']);
 assert.deepEqual(VARIANTS.map(v=>v.name),['Chrome','Neon','Porcelain','Deep','Custom']);
 for(const variant of VARIANTS)assert.doesNotThrow(()=>validateVariant(variant),`${variant.id} must validate`);
});

test('every variant passes the full whitelist validation',()=>{
 for(const variant of VARIANTS){
  const clean=validateVariant(variant);
  assert.equal(clean.id,variant.id);
  assert.ok(clean.banner,'validated banner config present');
  assert.ok(clean.scene.background.startsWith('#'));
 }
});

test('an unknown banner key throws naming the key',()=>{
 assert.throws(()=>validateBanner({preset:'blob',bogus:1}),/banner\.bogus/);
});

test('an out-of-range banner value throws instead of silently clamping',()=>{
 assert.throws(()=>validateBanner({count:9999}),/banner\.count/);
 assert.throws(()=>validateBanner({count:3}),/banner\.count/); // below the demo density cap
 assert.throws(()=>validateBanner({spacing:-1}),/banner\.spacing/);
 assert.throws(()=>validateBanner({volatility:7}),/banner\.volatility/);
});

test('an unknown banner choice throws naming the key',()=>{
 assert.throws(()=>validateBanner({preset:'monolith'}),/banner\.preset/);
 assert.throws(()=>validateBanner({material:'wood'}),/banner\.material/);
});

test('an unknown scene key throws naming the full path',()=>{
 assert.throws(()=>validateScene({background:'#000000',fog:{color:'#000000',near:1,far:2},key:{color:'#fff',intensity:1,position:[0,0,0]},rim:{sky:'#fff',ground:'#000',intensity:1},camera:{fov:50,position:[0,0,0]},extra:1}, 'scene'),/scene\.extra/);
 assert.throws(()=>validateScene({background:'#000000',fog:{color:'#000000',near:1,far:2},key:{color:'#fff',intensity:1,position:[0,0,0]},nope:{sky:'#fff',ground:'#000',intensity:1},camera:{fov:50,position:[0,0,0]}},'scene'),/scene\.nope/);
 assert.throws(()=>validateScene({background:'#000000',fog:{color:'#000000',near:1,far:2},key:{color:'#fff',intensity:1,position:[0,0,0],tilt:1},rim:{sky:'#fff',ground:'#000',intensity:1},camera:{fov:50,position:[0,0,0]}},'scene'),/scene\.key\.tilt/);
});

test('a malformed scene value throws naming the field',()=>{
 const base={background:'#0c0e12',fog:{color:'#0c0e12',near:1,far:2},key:{color:'#ffffff',intensity:1,position:[0,0,0]},rim:{sky:'#ffffff',ground:'#000000',intensity:1},camera:{fov:50,position:[0,0,0]}};
 assert.throws(()=>validateScene({...base,background:'dark'},'scene'),/scene\.background/);
 assert.throws(()=>validateScene({...base,background:'#0c0e1'},'scene'),/scene\.background/);
 assert.throws(()=>validateScene({...base,fog:{color:'#000000',near:-1,far:2}},'scene'),/scene\.fog\.near/);
 assert.throws(()=>validateScene({...base,key:{color:'#ffffff',intensity:-1,position:[0,0,0]}},'scene'),/scene\.key\.intensity/);
 assert.throws(()=>validateScene({...base,camera:{fov:50,position:[0,0]}},'scene'),/scene\.camera\.position/);
});

test('a non-whitelisted filter preset throws',()=>{
 assert.throws(()=>validateProfile({filter:'blur(40px)',forces:{},motion:'floaty'},'profile'),/profile\.filter/);
 assert.throws(()=>validateProfile({filter:'none; background:url(x)',forces:{},motion:'floaty'},'profile'),/profile\.filter/);
});

test('unknown profile keys and motions throw',()=>{
 assert.throws(()=>validateProfile({filter:'none',forces:{},motion:'floaty',spin:1},'profile'),/profile\.spin/);
 assert.throws(()=>validateProfile({filter:'none',forces:{},motion:'violent'},'profile'),/profile\.motion/);
 assert.throws(()=>validateProfile({filter:'none',forces:{attract:'many'},motion:'floaty'},'profile'),/profile\.forces\.attract/);
 assert.throws(()=>validateProfile({filter:'none',vignette:'yes',motion:'floaty'},'profile'),/profile\.vignette/);
});

test('validated scenes never alias the shared rig objects',()=>{
 const neon=VARIANTS.find(v=>v.id==='neon');
 const clean=validateVariant(neon);
 assert.notEqual(clean.scene,neon.scene);
 clean.scene.background='#ff00ff';
 assert.notEqual(neon.scene.background,'#ff00ff');
});

test('the filter presets are a small safe enum of canvas filters',()=>{
 assert.deepEqual(Object.keys(FILTER_PRESETS),['none','warm','cool','mono','neon','deep']);
 for(const[key,css]of Object.entries(FILTER_PRESETS)){
  if(css)assert.match(css,/^[\w\s().,:#%-]+$/,'filter css must be a plain canvas filter chain');
  else assert.equal(key,'none','only the none preset maps to no filter');
 }
});

test('feel presets only patch keys the sim world accepts live',()=>{
 for(const patch of Object.values(FEEL_PRESETS)){
  for(const key of Object.keys(patch))assert.match(key,/^(gravity|linearDamping|angularDamping|simHz|friction|restitution|floatSpring|floatDamp|pointerK|waveAmp|waveFreq|waveDamp|orbitSpeed|orbitHeightK|orbitHeightDamp)$/);
 }
});

test('lighting rigs cover the spec rigs and validate as scenes',()=>{
 assert.deepEqual(Object.keys(LIGHT_RIGS),['studio','neon','porcelain','deep']);
 for(const rig of Object.values(LIGHT_RIGS))assert.doesNotThrow(()=>validateScene(structuredClone(rig),'rig'));
});

test('variant table sanity: deep stays the cheapest and no two neighbors share a background',()=>{
 const ids=VARIANTS.map(v=>v.id);
 const count=id=>VARIANTS.find(v=>v.id===id).banner.count;
 assert.ok(count('deep')<count('neon'),'transmission cost is capped below the densest banner');
 for(let i=1;i<ids.length;i++)assert.notEqual(VARIANTS[i].scene.background,VARIANTS[i-1].scene.background,'adjacent banners must differ in mood');
 assert.equal(VARIANTS.at(-1).id,'custom','exactly the last banner carries the option set');
});
