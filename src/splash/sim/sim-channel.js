import {validateMessage} from './protocol.js';

// Main-thread half of the sim connection. When a Worker global exists
// (browser) it boots sim-worker.js as a module worker — the Rapier module is
// loaded only there. Without one (node --test, workerless embeds) every
// command is validated and queued in a bounded ring; attach() replays the
// backlog once a worker exists, so commands issued before boot are never lost.
//
// Pose frames come back as transferred buffers: validate, wrap in views (zero
// copy), hand to onPoses, then transfer the buffers back so the worker's
// ping-pong pool re-arms them — never copied, never allocated per frame.

export function createSimChannel({worker,onPoses,queueCap=8192}={}){
 let attached=worker??null;
 const queue=[];

 function handle(msg){
  validateMessage(msg); // throws loudly on a schema violation — never swallow
  if(msg.type!=='poses'||!onPoses)return;
  onPoses({
   frame:msg.frame,
   count:msg.count,
   ids:msg.ids,
   sleep:msg.sleep,
   positions:new Float32Array(msg.positions),
   quaternions:new Float32Array(msg.quaternions),
  });
  if(attached)attached.postMessage(
   {type:'return',positions:msg.positions,quaternions:msg.quaternions,sleep:msg.sleep,ids:msg.ids},
   [msg.positions,msg.quaternions,msg.sleep.buffer,msg.ids.buffer]
  );
 }

 function connect(next){
  attached=next;
  attached.onmessage=e=>handle(e.data);
  for(const msg of queue)attached.postMessage(msg);
  queue.length=0;
 }

 if(attached){
  // Pre-attached worker (tests, workerless embeds): connect() owns wiring the
  // message handler — a worker assigned without it would silently drop poses.
  connect(attached);
 }else if(typeof Worker!=='undefined'){
  // A Worker construction failure is a real bug and propagates — degrading
  // to a silent no-physics page would hide it.
  connect(new Worker(new URL('./sim-worker.js',import.meta.url),{type:'module'}));
 }
 if(attached&&typeof attached.addEventListener==='function'){
  attached.addEventListener('error',event=>{
   throw new Error(`sim worker failed: ${event.message??'unknown error'}`);
  });
 }

 return{
  send(msg){
   validateMessage(msg);
   if(attached)attached.postMessage(msg);
   else{
    if(queue.length>=queueCap)queue.shift();
    queue.push(msg);
   }
  },
  attach(next){
   if(attached)throw new Error('sim channel: worker already attached');
   connect(next);
  },
  pending:()=>queue.length,
  messages:()=>[...queue],
  dispose(){
   if(attached&&typeof attached.terminate==='function')attached.terminate();
   attached=null;
   queue.length=0;
  },
 };
}
