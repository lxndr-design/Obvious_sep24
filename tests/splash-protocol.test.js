import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMessage,POINTER_MODES,BEHAVIORS,POSITION_STRIDE,QUATERNION_STRIDE} from '../src/splash/sim/protocol.js';

const BODY={id:1,preset:'blob',r:1,p:[0,0,0]};

function poseFrame(count){
 return{
  type:'poses',frame:7,count,
  positions:new ArrayBuffer(count*POSITION_STRIDE*4),
  quaternions:new ArrayBuffer(count*QUATERNION_STRIDE*4),
  sleep:new Uint8Array(count),
  ids:new Uint32Array(count),
 };
}

test('valid main->sim messages pass validation',()=>{
 validateMessage({type:'init',bodies:[BODY],config:{gravity:[0,-9.81,0]}});
 validateMessage({type:'spawn',bodies:[{...BODY,id:2,p:[1,2,3],behavior:'float'}]});
 validateMessage({type:'despawn',ids:[1,2,3]});
 validateMessage({type:'config',patch:{damping:.5}});
 for(const mode of POINTER_MODES)validateMessage({type:'pointer',mode,p:[0,0,0],strength:1,radius:5});
 validateMessage({type:'impulse',kind:'radial',p:[0,0,0],strength:2,radius:6});
 validateMessage({type:'drag',id:4,p:[1,2,3]});
 validateMessage({type:'dragRelease',id:4,v:[0,0,1]});
 validateMessage({type:'dragRelease',id:4}); // release without a throw velocity
 validateMessage({type:'ready'});
 assert.ok(BEHAVIORS.includes('bounce'),'bounce is a protocol behavior');
 validateMessage({type:'spawn',bodies:[{...BODY,id:3,behavior:'bounce'}]});
});

test('poses message pins buffer lengths to count',()=>{
 const count=3;
 validateMessage(poseFrame(count));
 const wrongPositions={...poseFrame(count),positions:new ArrayBuffer(4)};
 assert.throws(()=>validateMessage(wrongPositions),/positions/);
 const wrongSleep={...poseFrame(count),sleep:new Uint8Array(count+1)};
 assert.throws(()=>validateMessage(wrongSleep),/sleep/);
 // ids ride per frame — wrong type or count is a schema violation, and the
 // consumer has no other way to map poses back to bodies.
 const wrongIdsType={...poseFrame(count),ids:[1,2,3]};
 assert.throws(()=>validateMessage(wrongIdsType),/ids/);
 const wrongIdsLength={...poseFrame(count),ids:new Uint32Array(count+1)};
 assert.throws(()=>validateMessage(wrongIdsLength),/ids/);
});

test('return message pins buffer types for the ping-pong pool',()=>{
 validateMessage({type:'return',positions:new ArrayBuffer(12),quaternions:new ArrayBuffer(16),sleep:new Uint8Array(1),ids:new Uint32Array(1)});
 assert.throws(()=>validateMessage({type:'return',positions:new Float32Array(3),quaternions:new ArrayBuffer(16),sleep:new Uint8Array(1),ids:new Uint32Array(1)}),/return\.positions/);
 assert.throws(()=>validateMessage({type:'return',positions:new ArrayBuffer(12),quaternions:new ArrayBuffer(16),sleep:new ArrayBuffer(1),ids:new Uint32Array(1)}),/return\.sleep/);
 assert.throws(()=>validateMessage({type:'return',positions:new ArrayBuffer(12),quaternions:new ArrayBuffer(16),sleep:new Uint8Array(1),ids:new Uint8Array(1)}),/return\.ids/);
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
 assert.throws(()=>validateMessage({type:'drag',id:-1,p:[0,0,0]}),/id/);
 assert.throws(()=>validateMessage({type:'drag',id:1,p:[0,0]}),/drag\.p/);
 assert.throws(()=>validateMessage({type:'dragRelease',id:1,v:[0,0]}),/v/);
 assert.throws(()=>validateMessage({type:'despawn',ids:[1.5]}),/ids/);
 assert.throws(()=>validateMessage({type:'config',patch:[1]}),/plain object/);
});
