import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createNoiseChannel,BUMP_JOB,BUMP_RESULT} from '../src/splash/gen/noise-channel.js';
import {resolveBumpParams,displacePositions} from '../src/splash/gen/bump3d.js';

function sphereSource(){
 return new THREE.SphereGeometry(1,12,8).attributes.position.array.slice();
}

// Fake module-worker transport: captures the job, runs the same pure function
// the real worker runs, answers after `defer` ms so tests can observe that the
// caller was never blocked by the math.
function fakeWorker({defer=0,onRun}={}){
 const jobs=[];
 const w={terminated:false};
 w.postMessage=msg=>{
  jobs.push(msg);
  setTimeout(()=>{
   try{
    onRun?.();
    const params=resolveBumpParams(msg.params);
    w.onmessage?.({data:{type:BUMP_RESULT,jobId:msg.jobId,positions:displacePositions(msg.source.positions,params)}});
   }catch(error){
    w.onmessage?.({data:{type:BUMP_RESULT,jobId:msg.jobId,error:error.message}});
   }
  },defer);
 };
 w.terminate=()=>{w.terminated=true;};
 w.jobs=jobs;
 return w;
}

test('channel falls back to sync generation without a Worker global',async()=>{
 const channel=createNoiseChannel();
 assert.equal(channel.transport(),'sync');
 const source=sphereSource();
 const {positions,transport}=await channel.generate({positions:source,params:{seed:9}});
 assert.equal(transport,'sync');
 assert.deepEqual(positions,displacePositions(sphereSource(),{seed:9}));
 assert.equal(channel.pending(),0);
 channel.dispose();
});

test('channel generates off-thread through the worker transport',async()=>{
 let ran=false;
 let worker;
 const channel=createNoiseChannel({workerFactory:()=>worker=fakeWorker({defer:20,onRun:()=>ran=true})});
 const source=sphereSource();
 const pending=channel.generate({positions:source,params:{seed:9}});
 // The math has not run on the calling thread: generate() posted a job and
 // returned control before the fake worker's timer fired.
 assert.equal(ran,false,'generation must not run synchronously when a worker is attached');
 assert.equal(channel.transport(),'worker');
 assert.equal(channel.pending(),1);
 const {positions,transport}=await pending;
 assert.equal(transport,'worker');
 assert.equal(ran,true);
 assert.deepEqual(positions,displacePositions(sphereSource(),{seed:9}));
 // The job crossed the boundary as the validated contract: bump job, job id,
 // resolved params (no raw defaults ambiguity).
 assert.equal(worker.jobs.length,1);
 assert.equal(worker.jobs[0].type,BUMP_JOB);
 assert.equal(typeof worker.jobs[0].jobId,'number');
 assert.deepEqual(worker.jobs[0].params,resolveBumpParams({seed:9}));
 channel.dispose();
});

test('worker and sync transports produce identical geometry for a seed',async()=>{
 const params={seed:5,amplitude:.5};
 const syncResult=await createNoiseChannel().generate({positions:sphereSource(),params});
 const workerResult=await createNoiseChannel({workerFactory:()=>fakeWorker()})
  .generate({positions:sphereSource(),params});
 assert.deepEqual(workerResult.positions,syncResult.positions);
});

test('invalid params reject the generation promise at the boundary',async()=>{
 const channel=createNoiseChannel({workerFactory:()=>fakeWorker()});
 await assert.rejects(
  channel.generate({positions:sphereSource(),params:{seed:'not-a-number'}}),
  /bump\.seed must be a finite number/,
 );
 channel.dispose();
});

test('worker-reported errors reject the waiting promise instead of hanging it',async()=>{
 // A worker-side failure answers the contract with an error message; the
 // caller's promise rejects — never a hang.
 const failing=()=>({postMessage(msg){this.onmessage?.({data:{type:BUMP_RESULT,jobId:msg.jobId,error:'boom'}});},terminate(){}});
 const channel=createNoiseChannel({workerFactory:failing});
 await assert.rejects(
  channel.generate({positions:sphereSource(),params:{seed:1}}),
  /noise worker: boom/,
 );
 channel.dispose();
});

test('worker onerror rejects every pending job',async()=>{
 let worker;
 const channel=createNoiseChannel({workerFactory:()=>worker=fakeWorker({defer:50})});
 const first=channel.generate({positions:sphereSource(),params:{}});
 const second=channel.generate({positions:sphereSource(),params:{}});
 worker.onerror?.({error:new Error('context lost')});
 await assert.rejects(first,/context lost/);
 await assert.rejects(second,/context lost/);
 channel.dispose();
});

test('dispose terminates the worker and rejects late callers',async()=>{
 let worker;
 const channel=createNoiseChannel({workerFactory:()=>worker=fakeWorker({defer:50})});
 const pending=channel.generate({positions:sphereSource(),params:{}});
 channel.dispose();
 assert.equal(worker.terminated,true);
 await assert.rejects(pending,/noise channel disposed/);
 await assert.rejects(channel.generate({positions:sphereSource(),params:{}}),/after dispose/);
});

test('malformed calls fail loudly at the boundary',async()=>{
 const channel=createNoiseChannel();
 await assert.rejects(channel.generate({positions:[0,1,0],params:{}}),/Float32Array/);
 channel.dispose();
});

// The REAL worker file, executed in-process: its handler must displace and
// post back a transferred buffer under the same contract.
test('noise-worker file: bumps and posts back under the channel contract',async()=>{
 const posted=[];
 globalThis.self={postMessage:msg=>posted.push(msg)};
 try{
  await import('../src/splash/gen/noise-worker.js');
  const source=sphereSource();
  globalThis.self.onmessage({data:{type:BUMP_JOB,jobId:7,source:{positions:source},params:{seed:13}}});
  assert.equal(posted.length,1);
  assert.equal(posted[0].type,BUMP_RESULT);
  assert.equal(posted[0].jobId,7);
  assert.deepEqual(posted[0].positions,displacePositions(sphereSource(),{seed:13}));
  // Bad params come back as an error message, never a hang.
  globalThis.self.onmessage({data:{type:BUMP_JOB,jobId:8,source:{positions:source},params:{seed:'x'}}});
  assert.equal(posted[1].jobId,8);
  assert.match(posted[1].error,/must be/);
  // Foreign messages are ignored, not crashed on.
  globalThis.self.onmessage({data:{type:'poses',frame:1}});
  assert.equal(posted.length,2);
 }finally{
  delete globalThis.self;
 }
});
