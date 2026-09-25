import {displacePositions,resolveBumpParams} from './bump3d.js';

// Main-thread half of the noise connection, mirroring sim/sim-channel.js's
// contract-first style for the bump boundary. A generate() request carries a
// Float32Array of source positions and validated bump params; the worker
// posts displaced positions back as a transferred buffer. Without a Worker
// global (node --test, degraded environments) generation falls back to the
// calling thread through the same pure function, so the protocol contract is
// exercised end-to-end either way — and every result reports which transport
// ran it, so "off-thread" is observable, not assumed.

export const BUMP_JOB='bump'; // main → worker
export const BUMP_RESULT='bumped'; // worker → main

export function createNoiseChannel({workerFactory}={}){
 // workerFactory: optional () => Worker-like transport ({postMessage, terminate,
 // settable onmessage/onerror}). Injected by tests; production boots a real
 // module worker. Construction errors propagate — no silent downgrade.
 let worker=null,jobs=new Map(),nextId=1,booted=false,disposed=false;

 function boot(){
  if(booted)return;
  booted=true;
  // An injected factory IS the worker runtime (tests, embedded hosts) — the
  // Worker-global guard only applies to the default module-worker boot.
  if(!workerFactory&&typeof Worker==='undefined')return; // node --test / no worker runtime: sync fallback
  worker=workerFactory
   ?workerFactory()
   :new Worker(new URL('./noise-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=event=>{
   const msg=event?.data;
   if(!msg||msg.type!==BUMP_RESULT)return;
   const job=jobs.get(msg.jobId);
   if(!job)return;
   jobs.delete(msg.jobId);
   if(msg.error!==undefined)job.reject(new Error(`noise worker: ${msg.error}`));
   else if(msg.positions instanceof Float32Array)job.resolve({positions:msg.positions,transport:'worker'});
   else job.reject(new TypeError('noise worker returned no positions'));
  };
  // Surface worker failures to every waiter — a dead worker must never leave
  // a generation promise pending forever.
  worker.onerror=event=>{
   const error=(event&&event.error)??new Error('noise worker failed');
   for(const job of jobs.values())job.reject(error);
   jobs.clear();
  };
 }

 // Displaces one position array. Ownership of `positions.buffer` moves to the
 // worker (transfer list) — pass a copy if the source is shared. Async so
 // validation failures reject the promise like every other failure mode.
 async function generate({positions,params}){
  if(disposed)throw new Error('noise channel: generate after dispose');
  if(!(positions instanceof Float32Array))throw new TypeError('noise channel: positions must be a Float32Array');
  const cfg=resolveBumpParams(params);
  boot();
  if(worker){
   const jobId=nextId++;
   return new Promise((resolve,reject)=>{
    jobs.set(jobId,{resolve,reject});
    worker.postMessage({type:BUMP_JOB,jobId,source:{positions},params:cfg},[positions.buffer]);
   });
  }
  return{positions:displacePositions(positions,cfg),transport:'sync'};
 }

 function dispose(){
  disposed=true;
  for(const job of jobs.values())job.reject(new Error('noise channel disposed'));
  jobs.clear();
  if(worker&&typeof worker.terminate==='function')worker.terminate();
  worker=null;
 }

 return{
  generate,
  dispose,
  transport:()=>worker?'worker':'sync',
  pending:()=>jobs.size,
 };
}
