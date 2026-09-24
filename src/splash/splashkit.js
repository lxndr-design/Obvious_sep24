import {createEngine} from './core/engine.js';
import {InstanceField} from './core/instance-field.js';
import {BannerConfig} from './banner-config.js';
import {createSimChannel} from './sim/sim-channel.js';
import {sineSeries,layoutPositions,applyJitter} from './gen/series.js';
import {createNoiseChannel} from './gen/noise-channel.js';
import {finishDisplaced} from './gen/bump-geometry.js';
import {resolveBumpParams} from './gen/bump3d.js';
import {PRESETS,presetGeometry} from './presets.js';
import {createMaterial,setBumpMaterialParams} from './materials/index.js';

// SplashKit — the callable layer over three.js. DOM-free: the entry wires the
// canvas, input and editor; everything here is headless-testable. Physics
// never runs here — commands go to the sim worker over the protocol, and the
// main thread never imports Rapier.

export function createSplashKit(canvas,initial={}){
 const engine=createEngine({canvas,stage:initial.stage,rendererFactory:initial.rendererFactory,pixelRatioCap:initial.pixelRatioCap});
 // The sim worker feeds the field directly: transferred pose buffers arrive,
 // get wrapped in views, and land in the instance-field read path every frame.
 // The callback only fires once poses return from the worker, so referencing
 // `field` before its declaration below is safe.
 const sim=createSimChannel({onPoses:frame=>field.applyPoses(frame)});
 const noise=createNoiseChannel(initial.noiseWorkerFactory?{workerFactory:initial.noiseWorkerFactory}:{});
 // Per-preset bump field config: the 'bump' material buckets for a preset must
 // shade the exact field its displaced geometry was cut with.
 const bumpConfigs=new Map();
 const field=new InstanceField(engine.scene,{
  capacity:initial.capacity,
  createMaterial:(kind,preset)=>kind==='bump'
   ?createMaterial('bump',bumpConfigs.get(preset))
   :createMaterial(kind),
 });
 const banner=new BannerConfig(initial.banner);

 function describe(handle){
  return{
   id:handle.id,preset:handle.preset,material:handle.material,r:handle.scale,
   p:[...handle.position],behavior:handle.behavior,seed:handle.seed,
  };
 }
 function batch(handles){
  sim.send({type:'spawn',bodies:handles.map(describe)});
  return handles;
 }

 function spawn(name,opts={}){
  const handle=field.acquire(name??banner.get('preset'),{
   material:opts.material??banner.get('material'),
   color:opts.color??banner.get('color'),
   behavior:opts.behavior??banner.get('behavior'),
   seed:opts.seed,
  });
  field.setPose(handle,{
   position:opts.position??[0,banner.get('base')*.75,0],
   scale:opts.scale??banner.get('base'),
   rotation:opts.rotation,
  });
  return batch([handle])[0];
 }

 // Grid / ring / arc / row fill — one call, one batched spawn message.
 function fillGrid(params={}){
  const{
   shape='grid',preset=banner.get('preset'),material=banner.get('material'),color=banner.get('color'),
   count=36,cols=6,rows=6,spacing=banner.get('spacing'),radius,
   jitter=0,seed=banner.get('seed'),scale=banner.get('base'),behavior=banner.get('behavior'),
  }=params;
  const n=shape==='grid'?cols*rows:count;
  const positions=applyJitter(layoutPositions({shape,count:n,cols,rows,spacing,radius}),{jitter,seed});
  return batch(Array.from({length:n},(_,i)=>{
   const handle=field.acquire(preset,{material,color,behavior,seed:seed+i});
   field.setPose(handle,{position:[positions[i].x,positions[i].y+scale*.5,positions[i].z],scale});
   return handle;
  }));
 }

 // Seeded sine-wave series: per-object scale from the wave, layout per shape.
 function spawnSeries(params={}){
  const{
   preset=banner.get('preset'),material=banner.get('material'),color=banner.get('color'),
   count=banner.get('count'),spacing=banner.get('spacing'),base=banner.get('base'),
   amplitude=banner.get('amplitude'),frequency=banner.get('frequency'),phase=banner.get('phase'),
   volatility=banner.get('volatility'),seed=banner.get('seed'),shape=banner.get('shape'),
   cols=6,radius,jitter=0,behavior=banner.get('behavior'),
  }=params;
  const series=sineSeries({count,spacing,base,amplitude,frequency,phase,volatility,seed});
  const positions=applyJitter(layoutPositions({shape,count,spacing,cols,radius}),{jitter,seed:seed+1});
  return batch(series.map((item,i)=>{
   const handle=field.acquire(preset,{material,color,behavior,seed:seed+i});
   field.setPose(handle,{position:[positions[i].x,positions[i].y+item.scale*.5,positions[i].z],scale:item.scale});
   return handle;
  }));
 }

 function despawn(handleOrAll){
  if(handleOrAll==='all'||handleOrAll===undefined){
   const ids=field.releaseAll();
   if(ids.length)sim.send({type:'despawn',ids});
   return ids.length;
  }
  const id=typeof handleOrAll==='object'?handleOrAll.id:handleOrAll;
  if(!field.release(id))return false;
  sim.send({type:'despawn',ids:[id]});
  return true;
 }

 function setPointer(mode,strength=1,radius=6,p=[0,0,0]){
  sim.send({type:'pointer',mode,p,strength,radius});
 }
 function shockwave(point=[0,0,0],strength=1,radius=8){
  sim.send({type:'impulse',kind:'radial',p:point,strength,radius});
 }

 // True-3D fractal bump for a preset: displaces a geometry clone through the
 // noise worker (off-thread — the render loop never waits on fBm math), then
 // registers it on the field so every bucket for that preset renders the
 // displaced silhouette. 'bump' material buckets for the preset are re-pinned
 // to the same field config, so fragment micro-shading always agrees with the
 // geometry. Resolves with {transport, vertices, seed}.
 async function fractalBump(name,params={}){
  if(!PRESETS[name])throw new Error(`Unknown preset: ${name}`);
  const cfg=resolveBumpParams(params);
  bumpConfigs.set(name,cfg);
  const base=presetGeometry(name);
  // The channel transfers buffer ownership — slice() so the shared preset
  // cache is never detached.
  const {positions,transport}=await noise.generate({
   positions:base.attributes.position.array.slice(),params:cfg,
  });
  field.registerGeometry(name,finishDisplaced(base,positions,cfg));
  for(const bucket of field.buckets.values()){
   if(bucket.preset===name&&bucket.material==='bump')setBumpMaterialParams(bucket.mesh.material,cfg);
  }
  return{transport,vertices:positions.length/3,seed:cfg.seed};
 }

 function stats(){
  return{
   fps:Number.isFinite(engine.fps)?Math.round(engine.fps):null,
   drawCalls:engine.renderer.info?.render?.calls??0,
   instances:field.used,
   batches:field.bucketCount,
   queued:sim.pending(),
   bumpTransport:noise.transport(),
  };
 }

 function dispose(){
  noise.dispose();
  sim.dispose();
  field.dispose();
  engine.dispose();
 }

 const kit={
  banner,
  // Exposed for the sim slice (worker attach + pose feeding) and tests; the
  // editor panel never needs them.
  sim,field,noise,
  spawn,despawn,fillGrid,spawnSeries,setPointer,shockwave,fractalBump,
  applyPoses:frame=>field.applyPoses(frame),
  stats,dispose,
 };
 engine.start(()=>field.sync(),initial.onFirstFrame);
 return kit;
}
