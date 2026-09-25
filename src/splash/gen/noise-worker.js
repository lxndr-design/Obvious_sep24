import {displacePositions,resolveBumpParams} from './bump3d.js';

// Noise worker: the bump generator's off-thread half. Deliberately three-free
// — it only ever sees typed arrays, so the worker chunk stays tiny while the
// main thread owns all geometry assembly. module worker; the noise channel
// owns its lifecycle and validates everything coming back.

self.onmessage=event=>{
 const msg=event?.data;
 if(!msg||msg.type!=='bump')return;
 try{
  const params=resolveBumpParams(msg.params);
  const positions=displacePositions(msg.source.positions,params);
  self.postMessage({type:'bumped',jobId:msg.jobId,positions},[positions.buffer]);
 }catch(error){
  // A bad job must reject the waiting promise, not hang it: report the error
  // back over the channel (the channel rethrows it to the caller).
  self.postMessage({type:'bumped',jobId:msg.jobId,error:error instanceof Error?error.message:String(error)});
 }
};
