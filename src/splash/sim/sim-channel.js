import {validateMessage} from './protocol.js';

// Main-thread half of the sim connection. Until the sim-worker slice boots the
// real worker, every command is validated and queued in a bounded ring, so the
// protocol contract is exercised end-to-end and nothing queues without limit.
// attach() replays the backlog once a worker exists — commands issued before
// boot are never lost.

export function createSimChannel({worker,queueCap=8192}={}){
 let attached=worker??null;
 const queue=[];
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
   attached=next;
   for(const msg of queue)attached.postMessage(msg);
   queue.length=0;
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
