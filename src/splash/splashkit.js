import {createEngine} from './core/engine.js';
import {InstanceField} from './core/instance-field.js';
import {BannerConfig} from './banner-config.js';
import {createSimChannel} from './sim/sim-channel.js';
import {sineSeries,layoutPositions,applyJitter} from './gen/series.js';

// SplashKit — the callable layer over three.js. DOM-free: the entry wires the
// canvas, input and editor; everything here is headless-testable. Physics
// never runs here — commands go to the sim worker over the protocol, and the
// main thread never imports Rapier.

export function createSplashKit(canvas,initial={}){
 const engine=createEngine({canvas,stage:initial.stage,rendererFactory:initial.rendererFactory,pixelRatioCap:initial.pixelRatioCap});
 // The sim worker feeds the field directly: transferred pose buffers arrive,
 // get wrapped in views, and land in the instance-field read path every frame.
 const sim=createSimChannel({onPoses:frame=>field.applyPoses(frame)});
 const field=new InstanceField(engine.scene,{capacity:initial.capacity});
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

 function stats(){
  return{
   fps:Number.isFinite(engine.fps)?Math.round(engine.fps):null,
   drawCalls:engine.renderer.info?.render?.calls??0,
   instances:field.used,
   batches:field.bucketCount,
   queued:sim.pending(),
  };
 }

 function dispose(){
  sim.dispose();
  field.dispose();
  engine.dispose();
 }

 const kit={
  banner,
  // Exposed for the sim slice (worker attach + pose feeding) and tests; the
  // editor panel never needs them.
  sim,field,
  spawn,despawn,fillGrid,spawnSeries,setPointer,shockwave,
  applyPoses:frame=>field.applyPoses(frame),
  stats,dispose,
 };
 engine.start(()=>field.sync(),initial.onFirstFrame);
 return kit;
}
