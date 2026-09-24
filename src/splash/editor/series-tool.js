import {arrayCall,seriesCall,TOOL_DEFAULTS} from './bindings.js';

// The generator controller. Banner changes request a regen; a regen diffs
// batches — one batched despawn of the previous handles, one spawn call — and
// never rebuilds the world. DOM-free: the rail owns inputs, this owns state.

function defaultSchedule(fn){
 // rAF coalesces slider bursts to one regen per frame; queueMicrotask is the
 // headless fallback so node --test can drive the controller directly.
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(fn);
 else queueMicrotask(fn);
}

export function createSeriesTool(kit,{schedule=defaultSchedule,initialMode='series'}={}){
 let mode=initialMode,handles=[],pending=false,dirty=false,off=null;
 const tool={...TOOL_DEFAULTS};

 function regen(){
  pending=false;
  dirty=false;
  const previous=handles;
  handles=[];
  if(previous.length)kit.despawn(previous);
  handles=mode==='series'
   ?kit.spawnSeries(seriesCall(kit.banner))
   :kit.fillGrid(arrayCall(kit.banner,tool));
  return handles;
 }

 function requestRegen(){
  dirty=true;
  if(pending)return; // one in-flight regen per frame — earlier patches fold in
  pending=true;
  schedule(()=>{
   pending=false;
   if(dirty)regen();
  });
 }

 const instance={
  get mode(){return mode;},
  get handles(){return handles;},
  tool,
  setMode(next){
   if(next!==mode){
    mode=next;
    requestRegen();
   }
  },
  requestRegen,
  // Clear cancels a pending regen too — "clear" then nothing else should
  // leave an empty stage, not resurrect the last arrangement.
  clear(){
   dirty=false;
   handles=[];
   return kit.despawn('all');
  },
  dispose(){
   if(off)off();
   off=null;
  },
 };

 // Any banner patch (rail sliders, gallery tile click) re-runs the active
 // generator with the new config — the merged banner-config contract.
 off=kit.banner.subscribe(()=>requestRegen());
 return instance;
}
