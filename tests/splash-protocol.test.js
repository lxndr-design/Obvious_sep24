import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMessage,POINTER_MODES,POSITION_STRIDE,QUATERNION_STRIDE} from '../src/splash/sim/protocol.js';

const BODY={id:1,preset:'blob',r:1,p:[0,0,0]};

test('valid main->sim messages pass validation',()=>{
 validateMessage({type:'init',bodies:[BODY],config:{gravity:[0,-9.81,0]}});
 validateMessage({type:'spawn',bodies:[{...BODY,id:2,p:[1,2,3],behavior:'float'}]});
 validateMessage({type:'despawn',ids:[1,2,3]});
 validateMessage({type:'config',patch:{damping:.5}});
 for(const mode of POINTER_MODES)validateMessage({type:'pointer',mode,p:[0,0,0],strength:1,radius:5});
 validateMessage({type:'impulse',kind:'radial',p:[0,0,0],strength:2,radius:6});
 validateMessage({type:'ready'});
});

test('poses message pins buffer lengths to count',()=>{
 const count=3;
 validateMessage({
  type:'poses',frame:7,count,
  positions:new ArrayBuffer(count*POSITION_STRIDE*4),
  quaternions:new ArrayBuffer(count*QUATERNION_STRIDE*4),
  sleep:new Uint8Array(count),
 });
 assert.throws(()=>validateMessage({
  type:'poses',frame:7,count,
  positions:new ArrayBuffer(4),
  quaternions:new ArrayBuffer(count*QUATERNION_STRIDE*4),
  sleep:new Uint8Array(count),
 }),/positions/);
 assert.throws(()=>validateMessage({
  type:'poses',frame:7,count,
  positions:new ArrayBuffer(count*POSITION_STRIDE*4),
  quaternions:new ArrayBuffer(count*QUATERNION_STRIDE*4),
  sleep:new Uint8Array(count+1),
 }),/sleep/);
});

test('malformed messages throw TypeError naming the offending field',()=>{
 assert.throws(()=>validateMessage({type:'nope'}),/unknown message type/i);
 assert.throws(()=>validateMessage(null),/message/);
 assert.throws(()=>validateMessage({type:'spawn',bodies:[]}),/non-empty/);
 assert.throws(()=>validateMessage({type:'spawn',bodies:[{id:-1,preset:'blob',r:1,p:[0,0,0]}]}),/id/);
 assert.throws(()=>validateMessage({type:'spawn',bodies:[{id:1,preset:'blob',r:0,p:[0,0,0]}]}),/\.r/);
 assert.throws(()=>validateMessage({type:'spawn',bodies:[{id:1,preset:'blob',r:1,p:[0,0]}]}),/\.p/);
 assert.throws(()=>validateMessage({type:'spawn',bodies:[{id:1,preset:'blob',r:1,p:[0,0,0],behavior:'yank'}]}),/behavior/);
 assert.throws(()=>validateMessage({type:'pointer',mode:'yank',p:[0,0,0],strength:1,radius:5}),/mode/);
 assert.throws(()=>validateMessage({type:'despawn',ids:[1.5]}),/ids/);
 assert.throws(()=>validateMessage({type:'config',patch:[1]}),/plain object/);
});
