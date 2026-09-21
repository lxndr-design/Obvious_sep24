import test from 'node:test';
import assert from 'node:assert/strict';
import {bindDragPointer} from '../src/drag-pointer.js';
class Surface extends EventTarget{captured=new Set();hasPointerCapture(id){return this.captured.has(id);}setPointerCapture(id){this.captured.add(id);}}
const event=(type,id=1,extra={})=>Object.assign(new Event(type),{pointerId:id,pointerType:'mouse',buttons:type==='pointerup'?0:1,clientX:0,clientY:0,...extra});
function setup(){const root=new Surface(),canvas=new Surface(),log=[];let drag={id:1};const unbind=bindDragPointer(root,canvas,{getDrag:()=>drag,move:e=>log.push(['move',e.clientX,e.clientY]),end:()=>{log.push(['end']);drag=null;},cancel:()=>{log.push(['cancel']);drag=null;}});return {root,canvas,log,unbind,get drag(){return drag;}};}
test('fast drags survive capture loss and crossing overlays, applying the final release position',()=>{
 const s=setup();s.root.dispatchEvent(event('pointermove',1,{clientX:300}));s.canvas.dispatchEvent(event('lostpointercapture'));assert.ok(s.drag);assert.ok(s.canvas.hasPointerCapture(1));
 s.root.dispatchEvent(event('pointermove',1,{clientX:1000,clientY:450}));s.root.dispatchEvent(event('pointerup',1,{clientX:1200,clientY:510}));
 assert.deepEqual(s.log,[['move',300,0],['move',1000,450],['move',1200,510],['end']]);assert.equal(s.drag,null);
});
test('unrelated or stale cancellation cannot end the current gesture',()=>{
 const s=setup();for(const type of ['pointermove','pointerup','pointercancel'])s.root.dispatchEvent(event(type,2));s.canvas.dispatchEvent(event('lostpointercapture',2));assert.deepEqual(s.log,[]);assert.ok(s.drag);
 s.root.dispatchEvent(event('pointercancel'));assert.deepEqual(s.log,[['cancel']]);
});
test('failed recapture uses window fallback, and an out-of-window mouse release ends on re-entry',()=>{
 const s=setup();s.canvas.setPointerCapture=()=>{throw Error('inactive capture');};s.canvas.dispatchEvent(event('lostpointercapture'));assert.ok(s.drag);
 s.root.dispatchEvent(event('pointermove',1,{clientX:20}));s.root.dispatchEvent(event('pointermove',1,{clientX:900,buttons:0}));assert.deepEqual(s.log,[['move',20,0],['end']]);
 s.root.dispatchEvent(event('pointermove',1,{clientX:1000}));assert.equal(s.log.length,2);
});
test('touch gestures do not depend on mouse button state and cleanup removes listeners',()=>{
 const s=setup();s.root.dispatchEvent(event('pointermove',1,{pointerType:'touch',buttons:0,clientX:200}));assert.ok(s.drag);s.unbind();s.root.dispatchEvent(event('pointerup'));assert.ok(s.drag);assert.deepEqual(s.log,[['move',200,0]]);
});
