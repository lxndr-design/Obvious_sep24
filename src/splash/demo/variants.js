import {BannerConfig,BANNER_DEFAULTS} from '../banner-config.js';
import {SPLASH_SCENE_DEFAULTS} from '../scene.js';

// Demo-column variants: every difference between the five banners is data.
// One entry per section — a validated BannerConfig patch (objects, physics
// inputs), a scene rig (what scene.js hardcodes by default), and a profile
// (interaction emphasis + canvas filter). The whole table is validated at
// module load, so a typo fails at boot naming the key — same discipline as
// banner-config.js, never mid-frame.
//
// CSS filters are NEVER raw strings: variants and the custom panel name a
// preset here, and column.js applies the string to the canvas wrapper. Same
// for physics feel — a named preset of world-config values, never raw numbers
// from the UI.

// Canvas-filter presets (CSS `filter` on the canvas wrapper). '' = untouched.
export const FILTER_PRESETS=Object.freeze({
 none:'',
 warm:'saturate(1.15) sepia(.2) brightness(1.03)',
 cool:'saturate(1.3) hue-rotate(-14deg) brightness(1.04)',
 mono:'grayscale(1) contrast(1.08)',
 neon:'saturate(1.5) contrast(1.15)',
 deep:'brightness(1.05) contrast(1.05)',
});

// Physics-feel presets: world-config patches sent over the sim channel
// (protocol `config`). Keys must exist in the sim world's defaults — enforced
// by test against WORLD_DEFAULTS, since the demo layer never imports the
// worker-side module. Values are tuned per feel, not user-supplied.
export const FEEL_PRESETS=Object.freeze({
 floaty:Object.freeze({gravity:[0,-1.5,0],linearDamping:.55,angularDamping:.75,pointerK:40}),
 grounded:Object.freeze({gravity:[0,-9.81,0],linearDamping:.05,angularDamping:.1,pointerK:40}),
 chaotic:Object.freeze({gravity:[0,-3.5,0],linearDamping:0,angularDamping:0,pointerK:90}),
 restless:Object.freeze({gravity:[0,-2.5,0],linearDamping:.2,angularDamping:.3,pointerK:70,waveAmp:1.4,waveFreq:2.6,waveDamp:1}),
 calm:Object.freeze({gravity:[0,-4,0],linearDamping:.8,angularDamping:.9,pointerK:30,waveAmp:.6,waveDamp:2.4}),
 weightless:Object.freeze({gravity:[0,-.2,0],linearDamping:.35,angularDamping:.4,pointerK:40,orbitSpeed:.5}),
});

// Lighting rigs for scene.js's variant layer. `studio` IS the default splash
// shell — the Lusion-style hero replicates it; the other three are the named
// rigs the custom panel's lighting control offers.
export const LIGHT_RIGS=Object.freeze({
 studio:SPLASH_SCENE_DEFAULTS,
 neon:Object.freeze({background:'#050505',fog:Object.freeze({color:'#0a0510',near:18,far:80}),key:Object.freeze({color:'#ff2d95',intensity:3.2,position:Object.freeze([-6,8,10])}),rim:Object.freeze({sky:'#2de2ff',ground:'#0a0a14',intensity:1.1}),camera:Object.freeze({fov:50,position:Object.freeze([0,2,15])})}),
 porcelain:Object.freeze({background:'#f1f2ed',fog:Object.freeze({color:'#f1f2ed',near:22,far:95}),key:Object.freeze({color:'#fff2df',intensity:2.2,position:Object.freeze([-8,12,6])}),rim:Object.freeze({sky:'#ffe9cc',ground:'#c9c2b2',intensity:.9}),camera:Object.freeze({fov:50,position:Object.freeze([0,2,15])})}),
 deep:Object.freeze({background:'#04070f',fog:Object.freeze({color:'#04070f',near:10,far:64}),key:Object.freeze({color:'#9fbfff',intensity:1.2,position:Object.freeze([4,9,10])}),rim:Object.freeze({sky:'#4a6fa0',ground:'#01030a',intensity:.55}),camera:Object.freeze({fov:55,position:Object.freeze([0,1.5,17])})}),
});

// Curated palette swatches for the custom panel's palette control.
export const PANEL_PALETTE=Object.freeze(['#c9d4e0','#7fd4ff','#ff2d95','#2de2ff','#e7e3d8','#b8c4a8','#2a4a7f']);

const HEX=/^#[0-9a-f]{6}$/i;
const FORCE_KEYS=['attract','repel','shockwave','throw'];

// --- validators (fail at boot, naming the offending key) --------------------

function whitelist(obj,keys,path){
 for(const key of Object.keys(obj??{})){
  if(!keys.includes(key))throw new TypeError(`Unknown variant key: ${path}.${key}`);
 }
}
function hex(value,path){
 if(typeof value!=='string'||!HEX.test(value))throw new TypeError(`variant ${path} must be a #rrggbb hex string`);
 return value.toLowerCase();
}
function finite(value,path,min=-Infinity,max=Infinity){
 // Strict, not clamping: scene/profile numbers are curated data — an
 // out-of-range typo must fail at boot with a named key, not silently
 // render as a different-looking banner. (User-input clamping lives in
 // BannerConfig.patch, a separate path.)
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)
  throw new TypeError(`variant ${path} must be a finite number in [${min}, ${max}]`);
 return value;
}
function vec3(value,path){
 if(!Array.isArray(value)||value.length!==3||value.some(n=>typeof n!=='number'||!Number.isFinite(n)))
  throw new TypeError(`variant ${path} must be [x, y, z]`);
 return[...value];
}

export function validateScene(scene,path='scene'){
 if(typeof scene!=='object'||scene===null)throw new TypeError(`variant ${path} must be an object`);
 whitelist(scene,['background','fog','key','rim','camera'],path);
 hex(scene.background,`${path}.background`);
 if(typeof scene.fog!=='object'||scene.fog===null)throw new TypeError(`variant ${path}.fog must be an object`);
 whitelist(scene.fog,['color','near','far'],`${path}.fog`);
 hex(scene.fog.color,`${path}.fog.color`);
 const near=finite(scene.fog.near,`${path}.fog.near`,0);
 if(finite(scene.fog.far,`${path}.fog.far`,0)<=near)throw new TypeError(`variant ${path}.fog.far must exceed fog.near`);
 if(typeof scene.key!=='object'||scene.key===null)throw new TypeError(`variant ${path}.key must be an object`);
 whitelist(scene.key,['color','intensity','position'],`${path}.key`);
 hex(scene.key.color,`${path}.key.color`);
 finite(scene.key.intensity,`${path}.key.intensity`,0,10);
 vec3(scene.key.position,`${path}.key.position`);
 if(typeof scene.rim!=='object'||scene.rim===null)throw new TypeError(`variant ${path}.rim must be an object`);
 whitelist(scene.rim,['sky','ground','intensity'],`${path}.rim`);
 hex(scene.rim.sky,`${path}.rim.sky`);
 hex(scene.rim.ground,`${path}.rim.ground`);
 finite(scene.rim.intensity,`${path}.rim.intensity`,0,10);
 if(typeof scene.camera!=='object'||scene.camera===null)throw new TypeError(`variant ${path}.camera must be an object`);
 whitelist(scene.camera,['fov','position'],`${path}.camera`);
 finite(scene.camera.fov,`${path}.camera.fov`,20,120);
 vec3(scene.camera.position,`${path}.camera.position`);
 return scene;
}

export function validateProfile(profile,path='profile'){
 if(typeof profile!=='object'||profile===null)throw new TypeError(`variant ${path} must be an object`);
 whitelist(profile,['filter','motion','forces','vignette'],path);
 const filter=profile.filter;
 if(!(filter in FILTER_PRESETS))throw new TypeError(`variant ${path}.filter must be one of ${Object.keys(FILTER_PRESETS).join('|')}`);
 const motion=profile.motion;
 if(!(motion in FEEL_PRESETS))throw new TypeError(`variant ${path}.motion must be one of ${Object.keys(FEEL_PRESETS).join('|')}`);
 if(profile.forces!==undefined){
  const forces=profile.forces;
  if(typeof forces!=='object'||forces===null)throw new TypeError(`variant ${path}.forces must be an object`);
  whitelist(forces,FORCE_KEYS,path);
  for(const key of FORCE_KEYS){
   if(forces[key]!==undefined)finite(forces[key],`${path}.forces.${key}`,0);
  }
 }
 if(profile.vignette!==undefined&&typeof profile.vignette!=='boolean')
  throw new TypeError(`variant ${path}.vignette must be a boolean`);
 return profile;
}

// Boot-time range gate for curated variant data — mirrors banner-config.js's
// engine RANGES so a typo fails at boot with a named key instead of silently
// clamping into a different-looking banner. count uses the demo density cap
// (the column must stay cheap; the panel slider max matches).
const BANNER_RANGES={count:[4,160],spacing:[.2,6],base:[.1,4],amplitude:[0,2],frequency:[0,8],volatility:[0,1]};
export function validateBanner(banner,path='banner'){
 if(typeof banner!=='object'||banner===null)throw new TypeError(`variant ${path} must be an object`);
 for(const key of Object.keys(banner)){
  if(!(key in BANNER_DEFAULTS))throw new TypeError(`Unknown variant key: ${path}.${key}`);
  const range=BANNER_RANGES[key];
  if(range){
   const n=banner[key];
   if(typeof n!=='number'||!Number.isFinite(n)||n<range[0]||n>range[1])
    throw new TypeError(`${path}.${key} must be a finite number in [${range[0]}, ${range[1]}]`);
  }
 }
 // Construction validates choices and clamps; the returned all() is the tuned data.
 return new BannerConfig(banner).all();
}

export function validateVariant(variant){
 if(typeof variant!=='object'||variant===null)throw new TypeError('variant must be an object');
 whitelist(variant,['id','name','tagline','scene','banner','profile'],'variant');
 for(const key of['id','name','tagline']){
  if(typeof variant[key]!=='string'||!variant[key])throw new TypeError(`variant.${key} must be a non-empty string`);
 }
 // Clones guard the returned variant against aliasing the shared rig objects.
 const scene=validateScene(structuredClone(variant.scene),'scene');
 const profile=validateProfile(structuredClone(variant.profile),'profile');
 return{
  ...variant,
  scene,
  banner:validateBanner(variant.banner,'banner'),
  profile,
 };
}

// --- the column, in order ----------------------------------------------------
// 1 Chrome — the Lusion-style hero replica: default studio shell, sculptural
//   arc of glossy steel blobs drifting on the float behavior.
// 2 Neon — dense capsule rows under a hard magenta key with a cyan rim; the
//   pointer repels at twice strength.
// 3 Porcelain — matte pastel boxes in a sparse ring on a light stage, settled
//   into a slow bob.
// 4 Deep — low-density ico field in heavy fog; drag-to-throw emphasized, count
//   capped (gloss on many instances is the page's costliest look).
// 5 Custom — the one banner with live controls; starts at the studio look.

const VARIANT_SOURCE=[
 {
  id:'chrome',name:'Chrome',tagline:'Lusion-style hero — a sculptural cluster under the studio rig',
  scene:structuredClone(LIGHT_RIGS.studio),
  banner:{preset:'blob',material:'gloss',color:'#c9d4e0',count:26,shape:'arc',spacing:1.3,base:1.2,amplitude:.5,frequency:1,volatility:.2,seed:11},
  profile:{filter:'none',motion:'floaty',forces:{attract:.6,repel:1,shockwave:1,throw:1}},
 },
 {
  id:'neon',name:'Neon',tagline:'Repel field — hard magenta key, jittery capsule rows',
  scene:structuredClone(LIGHT_RIGS.neon),
  banner:{preset:'capsule',material:'gloss',color:'#ff2d95',count:60,shape:'grid',spacing:.9,base:.85,amplitude:.6,frequency:2.4,volatility:.3,seed:23},
  profile:{filter:'neon',motion:'restless',forces:{attract:.4,repel:2.2,shockwave:1.3,throw:1}},
 },
 {
  id:'porcelain',name:'Porcelain',tagline:'Light studio — matte pastels settling into a slow bob',
  scene:structuredClone(LIGHT_RIGS.porcelain),
  banner:{preset:'box',material:'matte',color:'#e7e3d8',count:18,shape:'ring',spacing:1.6,base:1.1,amplitude:.3,frequency:1,volatility:.1,seed:31,behavior:'wave'},
  profile:{filter:'none',motion:'calm',forces:{attract:.8,repel:.8,shockwave:.8,throw:.7}},
 },
 {
  id:'deep',name:'Deep',tagline:'Glass field — weightless bodies in heavy fog',
  scene:structuredClone(LIGHT_RIGS.deep),
  banner:{preset:'ico',material:'gloss',color:'#2a4a7f',count:14,shape:'ring',spacing:2.4,base:1.4,amplitude:.9,frequency:.6,volatility:.35,seed:47},
  profile:{filter:'deep',motion:'weightless',forces:{attract:.4,repel:.6,shockwave:1.1,throw:1.8},vignette:true},
 },
 {
  id:'custom',name:'Custom',tagline:'Make it yours — eight live controls, no reload',
  scene:structuredClone(LIGHT_RIGS.studio),
  banner:{preset:'blob',material:'gloss',color:'#7fd4ff',count:24,shape:'arc',spacing:1.2,base:1,amplitude:.4,frequency:1,volatility:.15,seed:7},
  profile:{filter:'none',motion:'floaty',forces:{attract:1,repel:1,shockwave:1,throw:1}},
 },
];

// Boot-time validation: importing this module proves the table — a bad variant
// throws here, before any kit or frame exists.
export const VARIANTS=Object.freeze(VARIANT_SOURCE.map(v=>Object.freeze(validateVariant(v))));
