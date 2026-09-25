import test from 'node:test';
import assert from 'node:assert/strict';
import {BannerConfig,BANNER_DEFAULTS} from '../src/splash/banner-config.js';
import {PRESET_NAMES} from '../src/splash/presets.js';
import {MATERIAL_KINDS} from '../src/splash/materials/index.js';
import {BEHAVIORS} from '../src/splash/sim/protocol.js';
import {LAYOUT_SHAPES} from '../src/splash/gen/series.js';
import {
 arrayCall,bumpCall,dragPayload,formatCount,formatValue,GENERATOR_MODES,
 PRESET_DRAG_TYPE,RAIL_CONTROLS,readDragPayload,readTier,seriesCall,spawnCall,
 TOOL_DEFAULTS,TOOL_LIMITS,
} from '../src/splash/editor/bindings.js';

test('rail control metadata agrees with the merged config and enums',()=>{
 const banner=new BannerConfig();
 for(const ctrl of RAIL_CONTROLS){
  assert.ok(ctrl.key in BANNER_DEFAULTS,`control ${ctrl.key} must be a banner key`);
  if(ctrl.type==='range'){
   assert.ok(ctrl.step>0,`${ctrl.key} needs a step`);
   assert.ok(ctrl.min<=banner.get(ctrl.key)&&banner.get(ctrl.key)<=ctrl.max,
    `${ctrl.key} range ${ctrl.min}..${ctrl.max} must contain its default ${banner.get(ctrl.key)}`);
  }
 }
 // Choice controls map to the real enums, not hand copies.
 assert.deepEqual(RAIL_CONTROLS.find(c=>c.key==='preset').choices,PRESET_NAMES);
 assert.deepEqual(RAIL_CONTROLS.find(c=>c.key==='material').choices,MATERIAL_KINDS);
 assert.deepEqual(RAIL_CONTROLS.find(c=>c.key==='shape').choices,LAYOUT_SHAPES);
 // Behavior is its own select type; BEHAVIORS feed it in the rail builder.
 assert.ok(BEHAVIORS.length>0);
 // Tool limits stay inside the kit's validation (resolveBumpParams clamps).
 assert.ok(TOOL_LIMITS.bumpFrequency.min>=.05&&TOOL_LIMITS.bumpFrequency.max<=16);
 assert.ok(TOOL_LIMITS.octaves.min>=1&&TOOL_LIMITS.octaves.max<=8);
});

test('seriesCall passes the full banner state to spawnSeries',()=>{
 const banner=new BannerConfig();
 banner.patch({count:48,base:1.5,volatility:.3,seed:99});
 assert.deepEqual(seriesCall(banner),{
  preset:'blob',material:'gloss',color:'#7fd4ff',behavior:null,
  count:48,shape:'arc',spacing:1.2,base:1.5,
  amplitude:.4,frequency:1,phase:0,
  volatility:.3,seed:99,
 });
});

test('arrayCall maps tool locals onto fillGrid args',()=>{
 const banner=new BannerConfig();
 banner.patch({shape:'ring',count:30,seed:5});
 const tool={...TOOL_DEFAULTS,cols:4,rows:5,jitter:.5};
 assert.deepEqual(arrayCall(banner,tool),{
  preset:'blob',material:'gloss',color:'#7fd4ff',behavior:null,
  count:30,shape:'ring',spacing:1.2,scale:1,seed:5,
  cols:4,rows:5,jitter:.5,
 });
});

test('bumpCall takes the noise field from the tool and the seed from the banner',()=>{
 const banner=new BannerConfig();
 banner.patch({seed:21});
 assert.deepEqual(bumpCall(banner,TOOL_DEFAULTS),{
  octaves:5,frequency:1.6,amplitude:.35,lacunarity:2.1,gain:.5,seed:21,
 });
 assert.deepEqual(
  bumpCall(banner,{...TOOL_DEFAULTS,bumpFrequency:3.1,bumpAmplitude:.8,lacunarity:2.5,gain:.2}),
  {octaves:5,frequency:3.1,amplitude:.8,lacunarity:2.5,gain:.2,seed:21},
 );
});

test('spawnCall copies the drop point and styles from the banner',()=>{
 const banner=new BannerConfig();
 banner.patch({base:2,color:'#ff00aa'});
 const point=[1.5,0,-2];
 const call=spawnCall('torus',point,banner);
 assert.deepEqual(call,{preset:'torus',position:[1.5,0,-2],scale:2,material:'gloss',color:'#ff00aa',behavior:null,seed:7});
 point[0]=99; // the call must own its copy
 assert.deepEqual(call.position,[1.5,0,-2]);
});

test('readTier reads the governor tier and never invents one',()=>{
 assert.equal(readTier({tier:2}),2);
 assert.equal(readTier({governorTier:3}),3);
 assert.equal(readTier({tier:2,governorTier:3}),2,'stats.tier wins');
 assert.equal(readTier({}),null);
 assert.equal(readTier(null),null);
 assert.equal(readTier('fps 60'),null);
 assert.equal(readTier({tier:'2'}),null,'a string is not a tier');
 assert.equal(readTier({tier:1.5}),null);
});

test('count and value formatting are stable',()=>{
 assert.equal(formatCount(1234),'1,234');
 assert.equal(formatCount(0),'0');
 assert.equal(formatValue(1),'1');
 assert.equal(formatValue(.5),'0.5');
 assert.equal(formatValue(2.375),'2.38');
 assert.equal(formatValue(Infinity),'—');
 assert.equal(formatValue(NaN),'—');
});

test('drag payloads round-trip and reject foreign drags',()=>{
 const transfer=preset=>({
  getData:type=>type===PRESET_DRAG_TYPE?dragPayload(preset):'',
 });
 assert.equal(readDragPayload(transfer('ico')),'ico');
 assert.equal(readDragPayload({getData:()=>''}),null);
 assert.equal(readDragPayload({getData:()=>'{not json'}),null);
 assert.equal(readDragPayload({getData:()=>JSON.stringify({kind:'other',preset:'ico'})}),null);
 assert.equal(readDragPayload(undefined),null);
 assert.equal(dragPayload('torus'),JSON.stringify({kind:'splash-preset',preset:'torus'}));
});

test('generator modes and tool defaults stay in sync with the UI',()=>{
 assert.deepEqual(GENERATOR_MODES,['series','array']);
 assert.deepEqual(TOOL_DEFAULTS,{cols:6,rows:6,jitter:0,octaves:5,bumpFrequency:1.6,bumpAmplitude:.35,lacunarity:2.1,gain:.5});
});
