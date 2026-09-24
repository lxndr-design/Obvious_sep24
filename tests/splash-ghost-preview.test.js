import * as THREE from 'three';
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGhostPreview} from '../src/splash/interaction/ghost-preview.js';
import {PRESET_DRAG_TYPE,dragPayload} from '../src/splash/editor/bindings.js';

// Fake DOM surfaces: the module only needs add/removeEventListener plus the
// canvas rect for the drop mapping — a headless stand-in covers it.
function fakeTarget(){
 const listeners=new Map();
 return{
  addEventListener(t,fn){(listeners.get(t)??listeners.set(t,[]).get(t)).push(fn);},
  removeEventListener(t,fn){const l=listeners.get(t)??[];const i=l.indexOf(fn);if(i>=0)l.splice(i,1);},
  fire(t,e){for(const fn of[...(listeners.get(t)??[])])fn(e);},
 };
}

function setup(){
 const stage=fakeTarget(),canvas=fakeTarget();
 const scene=new THREE.Scene();
 const camera=new THREE.PerspectiveCamera(50,1,.1,300);
 camera.position.set(0,6,14);camera.lookAt(0,0,0);scene.add(camera);
 const rect={left:0,top:0,width:800,height:600};
 canvas.getBoundingClientRect=()=>rect;
 const remove=installGhostPreview({stage,camera,scene,canvas});
 return{stage,canvas,scene,camera,remove};
}

test('ghost preview arms from a preset dragstart and follows dragover',()=>{
 const{stage,canvas,scene,camera,remove}=setup();
 const dt=()=>({types:[PRESET_DRAG_TYPE,'text/plain'],getData:t=>t===PRESET_DRAG_TYPE?dragPayload('torus'):''});
 stage.fire('dragstart',{dataTransfer:dt()});
 canvas.fire('dragover',{clientX:400,clientY:300,dataTransfer:{types:[PRESET_DRAG_TYPE]}});
 // Ghost exists, is visible, sits on the y=0 drop plane in world space.
 const ghost=scene.children.find(o=>o.isMesh&&!o.isCamera);
 assert.ok(ghost,'ghost mesh added to the scene');
 assert.equal(ghost.visible,true,'ghost visible during drag');
 assert.equal(ghost.geometry.type,'TorusGeometry','ghost uses the dragged preset geometry');
 assert.equal(ghost.position.y,0,'dropPoint maps onto the y=0 plane');
 remove();
});

test('ghost hides on drop/dragend and ignores foreign drags',()=>{
 const{stage,canvas,scene,remove}=setup();
 const foreign=()=>({types:['text/plain'],getData:()=>''});
 stage.fire('dragstart',{dataTransfer:foreign()});
 canvas.fire('dragover',{clientX:400,clientY:300,dataTransfer:{types:['text/plain']}});
 assert.equal(scene.children.some(o=>o.isMesh&&!o.isCamera),false,'foreign drag arms nothing');
 const dt=()=>({types:[PRESET_DRAG_TYPE],getData:t=>t===PRESET_DRAG_TYPE?dragPayload('blob'):''});
 stage.fire('dragstart',{dataTransfer:dt()});
 canvas.fire('dragover',{clientX:400,clientY:300,dataTransfer:{types:[PRESET_DRAG_TYPE]}});
 const ghost=()=>scene.children.find(o=>o.isMesh&&!o.isCamera);
 assert.equal(ghost().visible,true,'armed ghost follows the drag');
 stage.fire('drop',{dataTransfer:dt()});
 assert.equal(ghost().visible,false,'drop hides the ghost');
 canvas.fire('dragover',{clientX:400,clientY:300,dataTransfer:{types:[PRESET_DRAG_TYPE]}});
 assert.equal(ghost().visible,false,'disarmed ghost does not re-arm from dragover alone');
 stage.fire('dragstart',{dataTransfer:dt()});
 canvas.fire('dragover',{clientX:400,clientY:300,dataTransfer:{types:[PRESET_DRAG_TYPE]}});
 assert.equal(ghost().visible,true,'re-armed for a fresh drag');
 stage.fire('dragend',{dataTransfer:dt()});
 assert.equal(ghost().visible,false,'dragend hides the ghost');
 remove();
});

test('remove tears down listeners and the ghost mesh',()=>{
 const{stage,canvas,scene,remove}=setup();
 const dt=()=>({types:[PRESET_DRAG_TYPE],getData:t=>t===PRESET_DRAG_TYPE?dragPayload('ico'):''});
 stage.fire('dragstart',{dataTransfer:dt()});
 canvas.fire('dragover',{clientX:400,clientY:300,dataTransfer:{types:[PRESET_DRAG_TYPE]}});
 remove();
 assert.equal(scene.children.some(o=>o.isMesh&&!o.isCamera),false,'ghost removed from the scene');
 stage.fire('dragstart',{dataTransfer:dt()});
 canvas.fire('dragover',{clientX:400,clientY:300,dataTransfer:{types:[PRESET_DRAG_TYPE]}});
 assert.equal(scene.children.some(o=>o.isMesh&&!o.isCamera),false,'no ghost after teardown');
});
