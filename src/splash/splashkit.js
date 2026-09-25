import * as THREE from 'three';
import {createEngine} from './core/engine.js';
import {InstanceField} from './core/instance-field.js';
import {PerfGovernor,tierPlan} from './core/governor.js';
import {BannerConfig} from './banner-config.js';
import {createSimChannel} from './sim/sim-channel.js';
import {sineSeries,layoutPositions,applyJitter} from './gen/series.js';
import {createNoiseChannel} from './gen/noise-channel.js';
import {finishDisplaced} from './gen/bump-geometry.js';
import {resolveBumpParams} from './gen/bump3d.js';
import {PRESETS,presetGeometry} from './presets.js';
import {createMaterial,setBumpMaterialParams,setBumpDetailEnabled} from './materials/index.js';
import {cameraPlane,planePoint} from './interaction/pointer-plane.js';

// SplashKit — the callable layer over three.js. DOM-free: the entry wires the
// canvas, input and editor; everything here is headless-testable. Physics
// never runs here — commands go to the sim worker over the protocol, and the
// main thread never imports Rapier.

export function createSplashKit(canvas,initial={}){
 const engine=createEngine({canvas,stage:initial.stage,rendererFactory:initial.rendererFactory,pixelRatioCap:initial.pixelRatioCap});
 // The sim worker feeds the field directly: transferred pose buffers arrive,
 // get wrapped in views, and land in the instance-field read path every frame.
 // The callback also stamps arrival timing (interpolation alpha) and the
 // active/sleeping split the HUD reports — counted once, never re-derived.
 const poseTiming={last:NaN,interval:1000/60};
 const poseCounts={active:0,sleeping:0};
 function applyPoses(frame){
  const now=performance.now();
  if(Number.isFinite(poseTiming.last))poseTiming.interval=poseTiming.interval*.875+(now-poseTiming.last)*.125;
  poseTiming.last=now;
  let active=0,sleeping=0;
  const n=Math.min(frame.sleep.length,frame.ids.length);
  for(let k=0;k<n;k++)(frame.sleep[k]===1?sleeping++:active++);
  poseCounts.active=active;
  poseCounts.sleeping=sleeping;
  field.applyPoses(frame);
 }
 const sim=createSimChannel({onPoses:frame=>applyPoses(frame)});
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

 // PerfGovernor (spec ladder): tier changes apply the whole plan idempotently
 // — pixel ratio, instance cap (shedding the oldest pooled bodies), sim rate
 // with pose interpolation, bump fragment detail. The body under a drag
 // spring is never culled: user intent outranks the budget.
 const baseCapacity=field.capacity;
 const basePixelRatioCap=initial.pixelRatioCap??1.75; // mirrors the engine default
 const governor=new PerfGovernor({getFps:()=>engine.fps,onTier:applyTier});
 let currentSimHz=120;
 let draggedId=null;
 function applyTier(tier){
  const plan=tierPlan(tier,{basePixelRatioCap,baseCapacity,baseSimHz:120});
  engine.setPixelRatioCap(plan.pixelRatioCap);
  if(plan.capacity<field.capacity){
   const culled=field.cullOldest(Math.max(0,field.used-plan.capacity),{keep:draggedId});
   if(culled.length)sim.send({type:'despawn',ids:culled});
  }
  field.capacity=plan.capacity;
  if(plan.simHz!==currentSimHz){
   currentSimHz=plan.simHz;
   sim.send({type:'config',patch:{simHz:plan.simHz}});
  }
  field.setInterpolation(plan.simHz<120);
  for(const bucket of field.buckets.values()){
   if(bucket.material==='bump')setBumpDetailEnabled(bucket.mesh.material,plan.bumpDetail);
  }
 }

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
  if(Array.isArray(handleOrAll)){
   // Batch form: the editor's regen replaces whole arrangements — one
   // protocol message per diff, not one per body.
   const ids=handleOrAll.map(h=>typeof h==='object'?h.id:h).filter(id=>field.release(id));
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

 // Drag-throw protocol side: the controller computes targets and throw
 // velocity; these only validate-forward. dragRelease without v ends the drag
 // and keeps whatever velocity the spring imparted. The live drag id doubles
 // as the governor's cull protection — a held body is never shed.
 function drag(id,p){draggedId=id;sim.send({type:'drag',id,p});}
 function dragRelease(id,v){draggedId=null;sim.send(v?{type:'dragRelease',id,v}:{type:'dragRelease',id});}

 // Screen -> world mapping on the interaction plane — camera-facing through
 // the scene origin (or `through` for a drag/drop plane). Returns [x,y,z] or
 // null when the ray never reaches the plane. This is also the editor DnD
 // ghost hook: a tile drag maps the pointer through here for its preview.
 function screenToPlane(ndcX,ndcY,through){
  const plane=cameraPlane(engine.camera,through);
  const hit=planePoint(engine.camera,ndcX,ndcY,plane);
  return hit?[hit.x,hit.y,hit.z]:null;
 }

 // Body under the cursor (raycast across every bucket) or null. Pooled slots
 // are skipped — only live handles are pickable.
 const _pickNdc=new THREE.Vector2();
 const _pickRay=new THREE.Raycaster();
 function pickBody(ndcX,ndcY){
  // Matrix writes happen per rendered frame; a pointer event between frames
  // would otherwise raycast last frame's poses — one frame of pick lag.
  field.sync();
  _pickNdc.set(ndcX,ndcY);
  _pickRay.setFromCamera(_pickNdc,engine.camera);
  let best=null,bestDist=Infinity;
  for(const bucket of field.buckets.values()){
   for(const hit of _pickRay.intersectObject(bucket.mesh,false)){
    if(!Number.isFinite(hit.distance))continue; // degenerate zero-scale slots
    const handle=bucket.bySlot[hit.instanceId];
    if(!handle)continue; // free slot inside the high-water range
    if(hit.distance<bestDist){best=handle;bestDist=hit.distance;}
    break; // hits are distance-sorted; the first live one is this bucket's nearest
   }
  }
  return best;
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
   active:poseCounts.active,
   sleeping:poseCounts.sleeping,
   tier:governor.tier,
   simHz:currentSimHz,
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
  // editor panel never needs them. engine is test-only access to the camera;
  // camera is the editor's drop-placement projection surface.
  sim,field,noise,engine,
  camera:engine.camera,
  spawn,despawn,fillGrid,spawnSeries,setPointer,shockwave,drag,dragRelease,
  screenToPlane,pickBody,fractalBump,
  applyPoses,
  stats,dispose,
 };
 engine.start(()=>{
  // Interpolation alpha for this frame comes from pose-arrival timing (tier
  // 3 only): how far into the expected interval the next pose is late.
  if(field.interpolation.enabled){
   const since=performance.now()-poseTiming.last;
   field.interpolation.alpha=Number.isFinite(since)?Math.min(1,Math.max(0,since/poseTiming.interval)):0;
  }
  field.sync();
  governor.tick();
 },initial.onFirstFrame);
 return kit;
}
