import RAPIER from '@dimforge/rapier3d-compat';
import {SplashWorld} from './splash-world.js';
import {validateMessage,SIM_CAPACITY} from './protocol.js';

// Worker shell: the only place the Rapier module is loaded — the main thread
// never imports it, so the WASM ships exclusively inside this chunk. The pump
// steps the world on an accumulator and ships poses back as TRANSFERRED
// buffers from a two-set ping-pong pool; the main thread hands each set back
// after consuming it (protocol "return"), so neither side allocates per frame
// and nothing is ever copied across the boundary. When both sets are still
// with the consumer, pose shipping simply skips a tick — physics keeps
// stepping, and a slow renderer self-throttles instead of leaking buffers.

await RAPIER.init();

const world=new SplashWorld(RAPIER,{capacity:SIM_CAPACITY});

const pool=[];
for(let i=0;i<2;i++){
 pool.push({
  positions:new Float32Array(SIM_CAPACITY*3),
  quaternions:new Float32Array(SIM_CAPACITY*4),
  sleep:new Uint8Array(SIM_CAPACITY),
  ids:new Uint32Array(SIM_CAPACITY),
 });
}

// Main -> worker message handlers. Types the worker may never receive
// (poses/ready/error are main-bound) are rejected loudly — a wiring bug
// should surface here, not as a silent no-op.
const HANDLERS={
 init(msg){
  if(msg.config)world.patch(msg.config);
  if(msg.bodies?.length){
   world.despawnAll();
   const{rejected}=world.spawn(msg.bodies);
   if(rejected.length)postMessage({type:'error',message:`init: ${rejected.length} bodies over capacity`});
  }
 },
 spawn(msg){
  const{rejected}=world.spawn(msg.bodies);
  if(rejected.length)postMessage({type:'error',message:`spawn: ${rejected.length} bodies over capacity`});
 },
 despawn:msg=>world.despawn(msg.ids),
 config:msg=>world.patch(msg.patch),
 pointer:msg=>world.setPointer(msg.mode,msg.p,msg.strength,msg.radius),
 impulse:msg=>world.impulse(msg),
 return(msg){
  // Buffers come back detached from the consumer; re-arm them as a set.
  pool.push({
   positions:new Float32Array(msg.positions),
   quaternions:new Float32Array(msg.quaternions),
   sleep:msg.sleep,
   ids:msg.ids,
  });
 },
};

self.addEventListener('message',e=>{
 try{
  const msg=validateMessage(e.data);
  const handler=HANDLERS[msg.type];
  if(!handler)throw new Error(`sim worker: main-bound or unknown message type: ${msg.type}`);
  handler(msg);
 }catch(err){
  postMessage({type:'error',message:err?.message??String(err)});
 }
});

let frameNo=0;
function postPoses(){
 const set=pool.pop();
 if(!set)return false; // consumer still holds both sets — skip this tick
 const count=world.writePoses(set);
 postMessage(
  {type:'poses',frame:frameNo++,count,positions:set.positions.buffer,quaternions:set.quaternions.buffer,sleep:set.sleep,ids:set.ids},
  [set.positions.buffer,set.quaternions.buffer,set.sleep.buffer,set.ids.buffer]
 );
 return true;
}

// Pump: no requestAnimationFrame in workers — a tight interval feeds the
// accumulator and world.advance clamps long stalls. A fatal step error stops
// the pump and reports once; a dead worker must be visible, not spinning.
let last=performance.now();
const pump=setInterval(()=>{
 try{
  const now=performance.now();
  const steps=world.advance((now-last)/1000);
  last=now;
  if(steps>0)postPoses();
 }catch(err){
  clearInterval(pump);
  postMessage({type:'error',message:err?.message??String(err)});
 }
},8);

postMessage({type:'ready'});
