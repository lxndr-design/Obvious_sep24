import test from 'node:test';
import assert from 'node:assert/strict';
import {createSplashKit} from '../src/splash/splashkit.js';
import {POSITION_STRIDE,QUATERNION_STRIDE} from '../src/splash/sim/protocol.js';

// The activation facade (spec art_WSIRxV9E): paused = no rAF ticks AND no sim
// steps. The world's own simHz lever floors at 30 Hz, so pausing TERMINATES
// the sim worker; the next activation attaches a fresh worker and fires
// onReseed so the deterministic arrangement respawns.

function fakeRenderer(){
 const calls={loops:[],disposed:false};
 return{
  calls,
  setPixelRatio(){},
  setSize(){},
  setAnimationLoop(cb){calls.loops.push(cb??null);},
  render(){},
  dispose(){calls.disposed=true;},
  info:{render:{calls:3}},
 };
}

// Fake sim worker: receives the backlog/spawns, can echo a pose frame so the
// field has something to sync. Mirrors the FakeWorker in the sim-channel tests.
class FakeSimWorker{
 constructor(){
  this.received=[];
  this.terminated=false;
  this.onmessage=null;
 }
 postMessage(msg,transfer){
  this.received.push(structuredClone(msg,{transfer:[...(transfer??[])]}));
  if(msg.type==='spawn'){
   const count=msg.bodies.length;
   const positions=new ArrayBuffer(count*POSITION_STRIDE*4);
   const quaternions=new ArrayBuffer(count*QUATERNION_STRIDE*4);
   const sleep=new Uint8Array(count);
   const ids=new Uint32Array(count);
   msg.bodies.forEach((b,i)=>{ids[i]=b.id;});
   this.onmessage?.({data:{type:'poses',frame:1,count,positions,quaternions,sleep,ids}});
  }
 }
 terminate(){this.terminated=true;}
}

function activeKit(extra={}){
 const workers=[];
 const reseeds=[];
 const renderers=[];
 const spawned=[];
 const kit=createSplashKit(undefined,{
  rendererFactory:()=>{const r=fakeRenderer();renderers.push(r);return r;},
  simWorkerFactory:()=>{const w=new FakeSimWorker();workers.push(w);return w;},
  capacity:64,
  onReseed(){
   reseeds.push(workers.length); // which worker the reseed rode on
   // Mirrors the column's reseed: the fresh world respawns the arrangement,
   // so the previous instance set is despawned first.
   for(const id of spawned)kit.despawn(id);
   spawned.length=0;
   spawned.push(kit.spawn('ico',{color:'#223344'}).id);
  },
  ...extra,
 });
 return{kit,workers,reseeds,renderers};
}

test('a fresh kit is live: worker attached, loop running, reseed on first activation',()=>{
 const{kit,workers,reseeds,renderers}=activeKit();
 assert.equal(workers.length,1,'one sim worker at construction');
 assert.equal(renderers.at(-1).calls.loops.length,1,'render loop registered');
 assert.equal(reseeds.length,0,'nothing reseeded until the column activates the kit');
 kit.setActive(true);
 assert.deepEqual(reseeds,[1],'first activation reseeds the initial world');
 assert.equal(kit.stats().instances,1);
 kit.dispose();
});

test('pause stops the loop and terminates the worker — zero cost off-screen',()=>{
 const{kit,workers,renderers}=activeKit();
 kit.setActive(true);
 kit.setActive(false);
 const loops=renderers[0].calls.loops;
 assert.equal(loops.at(-1),null,'setAnimationLoop(null) — zero rAF ticks');
 assert.equal(workers[0].terminated,true,'sim worker terminated — zero sim steps');
 assert.equal(workers.length,1,'no revival while paused');
 kit.dispose();
});

test('resume attaches a fresh worker and reseeds the deterministic arrangement',()=>{
 const{kit,workers,reseeds,renderers}=activeKit();
 kit.setActive(true);
 kit.setActive(false);
 kit.setActive(true);
 assert.equal(workers.length,2,'a fresh sim worker for the fresh world');
 assert.equal(workers[1].terminated,false);
 assert.deepEqual(reseeds,[1,2],'reseed rode the new worker');
 assert.equal(kit.stats().instances,1,'arrangement respawned after revival');
 assert.equal(typeof renderers[0].calls.loops.at(-1),'function','render loop re-registered');
 kit.dispose();
});

test('pause while already paused and resume while active are no-ops',()=>{
 const{kit,workers,reseeds,renderers}=activeKit();
 kit.setActive(true);
 const loopsAfterStart=renderers[0].calls.loops.length;
 kit.setActive(true);
 assert.equal(workers.length,1,'no duplicate worker on double activation');
 assert.equal(reseeds.length,1,'no duplicate reseed');
 assert.equal(renderers[0].calls.loops.length,loopsAfterStart,'loop not double-registered');
 kit.setActive(false);
 kit.setActive(false);
 assert.equal(workers.length,1,'no double dispose of the sim channel');
 kit.dispose();
});

test('dispose after a pause does not double-terminate',()=>{
 const{kit,workers}=activeKit();
 kit.setActive(true);
 kit.setActive(false);
 kit.dispose();
 assert.equal(workers[0].terminated,true);
});

test('the initial spawn path is unchanged for studio consumers (no setActive)',()=>{
 // The editor entry never calls setActive — the kit must behave exactly as
 // before: loop running, spawns flow to the attached worker.
 const{kit,workers,reseeds}=activeKit();
 const handle=kit.spawn('blob',{color:'#112233'});
 assert.equal(handle.preset,'blob');
 assert.equal(reseeds.length,0);
 assert.ok(workers[0].received.some(m=>m.type==='spawn'));
 kit.dispose();
});
