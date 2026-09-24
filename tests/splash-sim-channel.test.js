import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimChannel} from '../src/splash/sim/sim-channel.js';
import {validateMessage,POSITION_STRIDE,QUATERNION_STRIDE} from '../src/splash/sim/protocol.js';

// Fake worker standing in for sim-worker.js in node: no Worker global here, so
// the channel boots in queue mode and tests drive it through attach(). The
// fake honors postMessage transfer semantics closely enough to prove the
// buffer ping-pong: buffers handed to the main thread are detached from the
// worker side, exactly like a real transfer.
class FakeWorker{
 constructor({echoPoses=false}={}){
  this.received=[];
  this.transfers=[];
  this.terminated=false;
  this.echoPoses=echoPoses;
 }
 onmessage=null;
 postMessage(msg,transfer){
  // Real postMessage clones the payload while MOVING transferred buffers —
  // the sender's originals detach and the worker side gets live copies.
  // structuredClone with transfer reproduces both halves exactly.
  const cloned=structuredClone(msg,{transfer:[...(transfer??[])]});
  this.received.push(cloned);
  this.transfers.push(transfer);
  if(this.echoPoses&&msg.type==='spawn'){
   const count=msg.bodies.length;
   const positions=new ArrayBuffer(count*POSITION_STRIDE*4);
   const quaternions=new ArrayBuffer(count*QUATERNION_STRIDE*4);
   const sleep=new Uint8Array(count);
   const ids=new Uint32Array(count);
   msg.bodies.forEach((b,i)=>{ids[i]=b.id;});
   this.onmessage?.({data:{type:'poses',frame:1,count,positions,quaternions,sleep,ids}});
  }
 }
 // Main -> worker direction of a real worker's message handler.
 receiveFromMain(msg){this.onmessage?.({data:msg});}
 terminate(){this.terminated=true;}
}

test('without a Worker global the channel queues validated commands',()=>{
 const channel=createSimChannel();
 channel.send({type:'pointer',mode:'attract',p:[0,0,0],strength:1,radius:5});
 assert.equal(channel.pending(),1);
 assert.deepEqual(channel.messages()[0].type,'pointer');
 assert.throws(()=>channel.send({type:'nope'}),/unknown message type/i);
 channel.dispose();
 assert.equal(channel.pending(),0);
});

test('drag commands validate and queue like every other command',()=>{
 const channel=createSimChannel();
 channel.send({type:'drag',id:4,p:[1,2,3]});
 channel.send({type:'dragRelease',id:4,v:[0,0,1]});
 assert.deepEqual(channel.messages().map(m=>m.type),['drag','dragRelease']);
 assert.throws(()=>channel.send({type:'drag',id:4}),/drag\.p/);
 channel.dispose();
});

test('attach replays the backlog in order and leaves the queue empty',()=>{
 const channel=createSimChannel();
 const init={type:'init',bodies:[],config:{gravity:[0,-9.81,0]}};
 const spawn={type:'spawn',bodies:[{id:1,preset:'blob',r:1,p:[0,0,0],behavior:'float'}]};
 channel.send(init);
 channel.send(spawn);
 const fake=new FakeWorker();
 channel.attach(fake);
 assert.deepEqual(fake.received,[init,spawn],'backlog must replay before any new command');
 assert.equal(channel.pending(),0);
 assert.throws(()=>channel.attach(new FakeWorker()),/already attached/);
 channel.dispose();
 assert.equal(fake.terminated,true);
});

test('pose frames flow to onPoses as views and their buffers transfer back',()=>{
 let frame=null,snapshot=null;
 const fake=new FakeWorker({echoPoses:true});
 // The channel returns buffers as soon as onPoses returns — views are only
 // valid inside the callback. Snapshot them there; assert detachment after.
 const channel=createSimChannel({worker:fake,onPoses:f=>{
  frame=f;
  snapshot={ids:Array.from(f.ids),posByteLen:f.positions.buffer.byteLength};
 }});
 channel.send({type:'spawn',bodies:[{id:1,preset:'blob',r:1,p:[0,0,0],behavior:'float'}]});
 assert.ok(frame,'echoed poses must reach onPoses');
 assert.equal(frame.count,1);
 assert.deepEqual(snapshot.ids,[1],'ids must be readable inside the callback');
 assert.equal(snapshot.posByteLen,12,'position buffer must be attached while consumed');
 assert.ok(frame.positions instanceof Float32Array,'positions must be a zero-copy view');
 assert.ok(frame.quaternions instanceof Float32Array);
 assert.ok(frame.sleep instanceof Uint8Array);

 // The main->worker traffic: spawn, then the buffer return.
 assert.deepEqual(fake.received.map(m=>m.type),['spawn','return']);
 const returned=fake.received[1];
 assert.equal(validateMessage(returned).type,'return','return messages are protocol-valid');
 assert.ok(returned.positions instanceof ArrayBuffer);
 assert.ok(returned.sleep instanceof Uint8Array);
 assert.ok(returned.ids instanceof Uint32Array);
 assert.equal(returned.ids[0],1,'returned ids still map the consumed frame');
 assert.equal(fake.transfers.at(-1).length,4,'all four buffers ride the transfer list');

 // Transferring back must detach the consumed buffers — proof the main thread
 // held them zero-copy and handed the same memory back, never a copy.
 assert.equal(frame.positions.buffer.byteLength,0,'consumed position buffer must be detached, not copied');
 channel.dispose();
});

test('a schema-violating message from the worker throws, never swallows',()=>{
 const fake=new FakeWorker();
 let caught=null;
 const channel=createSimChannel({worker:fake,onPoses:()=>{}});
 try{
  fake.receiveFromMain({type:'poses',frame:1,count:2,positions:new ArrayBuffer(4),quaternions:new ArrayBuffer(4),sleep:new Uint8Array(0),ids:new Uint32Array(0)});
 }catch(err){caught=err;}
 assert.ok(caught,'mismatched pose frame must throw at the boundary');
 // The validator names the protocol and offending field — never a bare count.
 assert.match(String(caught?.message??caught),/^protocol: poses/);
 channel.dispose();
});

test('non-pose worker messages do not invoke onPoses',()=>{
 let called=0;
 const fake=new FakeWorker();
 const channel=createSimChannel({worker:fake,onPoses:()=>called++});
 fake.receiveFromMain({type:'ready'});
 fake.receiveFromMain({type:'error',message:'spawn: bodies over capacity'});
 assert.equal(called,0);
 channel.dispose();
});
