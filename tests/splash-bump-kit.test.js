import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSplashKit} from '../src/splash/splashkit.js';
import {resolveBumpParams,displacePositions} from '../src/splash/gen/bump3d.js';
import {BUMP_RESULT} from '../src/splash/gen/noise-channel.js';
import {presetGeometry} from '../src/splash/presets.js';

function fakeRenderer(){
 const calls={loops:[],disposed:false};
 return{
  calls,
  setPixelRatio(){},
  setSize(){},
  setAnimationLoop(cb){calls.loops.push(cb);},
  render(){},
  dispose(){calls.disposed=true;},
  info:{render:{calls:3}},
 };
}

// The noise-worker transport: captures the job, answers after `defer` ms with
// the same math the real worker runs, so tests can observe that the calling
// thread never ran it.
function fakeNoiseWorker({defer=0,onRun,reply}={}){
 const jobs=[];
 const w={terminated:false};
 w.postMessage=msg=>{
  jobs.push(msg);
  setTimeout(()=>{
   if(reply){w.onmessage?.({data:{type:BUMP_RESULT,jobId:msg.jobId,...reply(msg)}});return;}
   try{
    onRun?.();
    w.onmessage?.({data:{
     type:BUMP_RESULT,jobId:msg.jobId,
     positions:displacePositions(msg.source.positions,resolveBumpParams(msg.params)),
    }});
   }catch(error){
    w.onmessage?.({data:{type:BUMP_RESULT,jobId:msg.jobId,error:error.message}});
   }
  },defer);
 };
 w.terminate=()=>{w.terminated=true;};
 w.jobs=jobs;
 return w;
}

function kitDriven(extra={}){
 return createSplashKit(undefined,{
  rendererFactory:()=>fakeRenderer(),
  capacity:64,
  noiseWorkerFactory:()=>fakeNoiseWorker(),
  ...extra,
 });
}

// kit.fractalBump on two presets, end to end: geometry registered, buckets
// swapped, materials pinned, deterministic, off-thread.
test('kit.fractalBump displaces blob and torus end to end',async()=>{
 const kit=kitDriven();
 const blobBefore=Float32Array.from(presetGeometry('blob').attributes.position.array);
 const a=await kit.fractalBump('blob',{seed:7});
 const b=await kit.fractalBump('torus',{seed:7});
 assert.equal(a.transport,'worker');
 assert.equal(b.transport,'worker');
 assert.equal(a.seed,7);
 const blobOverride=kit.field.geometryOverrides.get('blob');
 const torusOverride=kit.field.geometryOverrides.get('torus');
 assert.ok(blobOverride&&torusOverride,'overrides registered for both presets');
 assert.notEqual(blobOverride,presetGeometry('blob'),'shared preset cache untouched');
 assert.notDeepEqual(Float32Array.from(blobOverride.attributes.position.array),blobBefore);
 // userData provenance is per-geometry, not leaked across clones.
 assert.equal(blobOverride.userData.bump3d.seed,7);
 assert.notEqual(blobOverride.userData,torusOverride.userData);
 kit.dispose();
});

test('kit.fractalBump generation runs off-thread through the worker',async()=>{
 let ran=false;
 const kit=kitDriven({noiseWorkerFactory:()=>fakeNoiseWorker({defer:20,onRun:()=>ran=true})});
 const pending=kit.fractalBump('ico',{seed:5});
 assert.equal(ran,false,'displacement math ran on the calling thread');
 assert.equal(kit.stats().bumpTransport,'worker');
 const out=await pending;
 assert.equal(out.transport,'worker');
 assert.equal(ran,true);
 assert.equal(out.vertices,kit.field.geometryOverrides.get('ico').attributes.position.count);
 kit.dispose();
});

test('bump material buckets are pinned per preset and re-pinned on regenerate',async()=>{
 const kit=kitDriven();
 kit.spawn('blob',{material:'bump'});
 const bucket=kit.field.buckets.get('blob:bump');
 assert.equal(bucket.mesh.material.defines.SPLASH_BUMP_SEED,'7u'); // defaults until configured
 await kit.fractalBump('blob',{seed:11,amplitude:.6});
 assert.equal(bucket.mesh.material.defines.SPLASH_BUMP_SEED,'11u');
 assert.equal(bucket.mesh.material.defines.SPLASH_BUMP_STRENGTH,(.6*.35).toFixed(6));
 assert.equal(bucket.mesh.geometry,kit.field.geometryOverrides.get('blob'));
 // A second blob bucket (post-config) inherits the same pinned config…
 kit.spawn('blob',{material:'bump'});
 const second=kit.field.buckets.get('blob:bump'); // same pooled bucket key
 assert.equal(second.mesh.material.defines.SPLASH_BUMP_SEED,'11u');
 // …while an untouched preset keeps its own independent config.
 kit.spawn('torus',{material:'bump'});
 assert.equal(kit.field.buckets.get('torus:bump').mesh.material.defines.SPLASH_BUMP_SEED,'7u');
 kit.dispose();
});

test('spawned bodies keep rendering across the geometry swap',async()=>{
 const kit=kitDriven();
 const h=kit.spawn('blob',{});
 const bucket=kit.field.buckets.get('blob:gloss');
 assert.equal(bucket.mesh.count,1);
 const positionsBefore=Float32Array.from(bucket.mesh.geometry.attributes.position.array);
 await kit.fractalBump('blob',{seed:7});
 assert.equal(bucket.mesh.geometry,kit.field.geometryOverrides.get('blob'));
 assert.notDeepEqual(Float32Array.from(bucket.mesh.geometry.attributes.position.array),positionsBefore);
 assert.equal(bucket.mesh.count,1,'pooled slot survived the swap');
 assert.equal(kit.despawn(h.id),true);
 kit.dispose();
});

test('same seed produces identical geometry across independent kits',async()=>{
 const a=kitDriven();
 const b=kitDriven();
 await a.fractalBump('blob',{seed:42});
 await b.fractalBump('blob',{seed:42});
 assert.deepEqual(
  Array.from(a.field.geometryOverrides.get('blob').attributes.position.array),
  Array.from(b.field.geometryOverrides.get('blob').attributes.position.array),
 );
 a.dispose();
 b.dispose();
});

test('kit.fractalBump surfaces worker failures as rejected promises',async()=>{
 const kit=kitDriven({noiseWorkerFactory:()=>fakeNoiseWorker({reply:()=>({error:'renderer out of tea'})})});
 await assert.rejects(kit.fractalBump('blob',{seed:1}),/noise worker: renderer out of tea/);
 assert.equal(kit.field.geometryOverrides.get('blob'),undefined,'failed generation must not register');
 kit.dispose();
});

test('kit.fractalBump validates the preset loudly',async()=>{
 const kit=kitDriven();
 await assert.rejects(kit.fractalBump('nonexistent',{seed:1}),/Unknown preset/);
 kit.dispose();
});
