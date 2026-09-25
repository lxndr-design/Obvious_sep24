import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {dropPoint} from '../src/splash/editor/dnd.js';
import {PRESET_DRAG_TYPE,readDragPayload,dragPayload} from '../src/splash/editor/bindings.js';

// The splash scene camera (scene.js): above the drop plane, looking at origin.
function splashCamera(){
 const camera=new THREE.PerspectiveCamera(50,1,.1,300);
 camera.position.set(0,2.5,16);
 camera.lookAt(0,0,0);
 return camera;
}
const rect={left:0,top:0,width:800,height:600};

test('dropPoint hits the y=0 plane at the view center',()=>{
 const point=dropPoint({clientX:400,clientY:300,camera:splashCamera(),rect});
 assert.ok(point,'a ray through the view center must hit the plane');
 assert.equal(point[1],0,'drops land on the floor plane');
 assert.ok(Math.abs(point[0])<1e-3,`center ray x≈0, got ${point[0]}`);
 assert.ok(Math.abs(point[2])<1e-3,`center ray z≈0, got ${point[2]}`);
});

test('dropPoint keeps screen sides on their world sides',()=>{
 const left=dropPoint({clientX:0,clientY:300,camera:splashCamera(),rect});
 const right=dropPoint({clientX:800,clientY:300,camera:splashCamera(),rect});
 assert.ok(left[0]<0,'screen left is world -x');
 assert.ok(right[0]>0,'screen right is world +x');
});

test('dropPoint refuses rays that never hit the plane',()=>{
 // Camera above the plane but looking parallel to it: no hit, no placement.
 const camera=new THREE.PerspectiveCamera(50,1,.1,300);
 camera.position.set(0,2.5,16);
 camera.lookAt(0,2.5,0); // horizontal view
 assert.equal(dropPoint({clientX:400,clientY:300,camera,rect}),null);
 // Camera exactly on the plane looking horizontally: divide-by-zero path.
 const flat=new THREE.PerspectiveCamera(50,1,.1,300);
 flat.position.set(0,0,16);
 flat.lookAt(0,0,0);
 assert.equal(dropPoint({clientX:400,clientY:300,camera:flat,rect}),null);
});

test('drag payloads round-trip through the typed dataTransfer key',()=>{
 const transfer=preset=>({
  getData:type=>type===PRESET_DRAG_TYPE?dragPayload(preset):'',
 });
 assert.equal(readDragPayload(transfer('torus')),'torus');
 assert.equal(readDragPayload({getData:()=>''}),null,'a drag without our type places nothing');
});
