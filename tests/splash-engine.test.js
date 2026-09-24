import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createEngine} from '../src/splash/core/engine.js';

// Headless fake renderer: the engine must only need setPixelRatio, setSize,
// setAnimationLoop, render and dispose from its renderer.
function fakeRenderer(){
 const calls={sizes:[],loops:[],frames:0,disposed:false};
 return{
  calls,
  setPixelRatio(){},
  setSize(w,h){calls.sizes.push([w,h]);},
  setAnimationLoop(cb){calls.loops.push(cb);},
  render(){calls.frames++;},
  dispose(){calls.disposed=true;},
  info:{render:{calls:1}},
 };
}

test('engine boots a scene, camera and injectable renderer',()=>{
 const renderer=fakeRenderer();
 const engine=createEngine({rendererFactory:()=>renderer});
 assert.ok(engine.scene instanceof THREE.Scene);
 assert.ok(engine.camera instanceof THREE.PerspectiveCamera);
 assert.equal(engine.renderer,renderer);
 assert.equal(renderer.calls.loops.length,0,'renderer starts without a loop');
 engine.dispose();
});

test('start drives ticks through the renderer loop, first frame fires once',()=>{
 const renderer=fakeRenderer();
 const engine=createEngine({rendererFactory:()=>renderer});
 let ticks=0,first=0;
 engine.start(()=>ticks++,()=>first++);
 assert.equal(renderer.calls.loops.length,1,'exactly one animation loop after start');
 const frame=renderer.calls.loops[0];
 frame();
 assert.equal(ticks,1);
 assert.equal(first,1,'first-frame fires after the first successful render');
 frame();
 assert.equal(ticks,2);
 assert.equal(first,1,'first-frame fires exactly once');
 engine.dispose();
 assert.equal(renderer.calls.disposed,true);
});

test('engine.start is idempotent and stop detaches the loop',()=>{
 const renderer=fakeRenderer();
 const engine=createEngine({rendererFactory:()=>renderer});
 engine.start();
 engine.start();
 assert.equal(renderer.calls.loops.length,1);
 engine.stop();
 assert.equal(renderer.calls.loops.at(-1),null);
 engine.dispose();
});

test('engine tracks a smoothed fps readout',()=>{
 const renderer=fakeRenderer();
 const engine=createEngine({rendererFactory:()=>renderer});
 engine.start();
 const frame=renderer.calls.loops[0];
 const now=performance.now();
 frame(now-1000);
 frame(now);
 assert.ok(Number.isFinite(engine.fps)&&engine.fps>0,`fps should be a positive number, got ${engine.fps}`);
 engine.dispose();
});
