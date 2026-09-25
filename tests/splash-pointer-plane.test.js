import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cameraPlane,planePoint,pointerVelocity,THROW_SCALE,THROW_MAX_SPEED,THROW_WINDOW_MS} from '../src/splash/interaction/pointer-plane.js';

// Headless drive of the pure pointer math with a real camera: a camera on the
// +Z axis looking at the origin gives an easy camera-facing plane (z = const).
function axialCamera(){
 const c=new THREE.PerspectiveCamera(50,1,.1,300);
 c.position.set(0,0,10);
 c.lookAt(0,0,0);
 c.updateMatrixWorld(true); // project() reads matrixWorldInverse — keep it current
 return c;
}

test('planePoint maps ndc center to the world origin on a camera-facing plane',()=>{
 const cam=axialCamera();
 const p=planePoint(cam,0,0,cameraPlane(cam));
 assert.ok(p,'the center ray must reach the plane');
 assert.ok(p.distanceTo(new THREE.Vector3(0,0,0))<1e-6,`center must land on the origin, got ${p.toArray()}`);
});

test('off-center ndc lands on the matching side of the scene plane',()=>{
 const cam=axialCamera();
 const left=planePoint(cam,-.5,0,cameraPlane(cam));
 const right=planePoint(cam,.5,0,cameraPlane(cam));
 assert.ok(left.x<0&&right.x>0,'screen sides must map to world sides');
 assert.ok(Math.abs(left.z)<1e-6&&Math.abs(right.z)<1e-6,'both points stay on the z=0 plane');
});

test('a drag plane through the picked point maps that point back at its own ndc',()=>{
 const cam=axialCamera();
 const P=new THREE.Vector3(2,1,3);
 const ndc=P.clone().project(cam);
 const p=planePoint(cam,ndc.x,ndc.y,cameraPlane(cam,[P.x,P.y,P.z]));
 assert.ok(p,`the picked point's ray must reach its own drag plane (ndc ${ndc.x.toFixed(3)},${ndc.y.toFixed(3)})`);
 assert.ok(p.distanceTo(P)<1e-6,`round trip must return the picked point, got ${p.toArray()}`);
});

test('pointerVelocity differences the recent window with the throw scale',()=>{
 const v=pointerVelocity([{t:20,p:[0,0,0]},{t:100,p:[1,0,0]}],100);
 assert.ok(Math.abs(v[0]-1/.08*THROW_SCALE)<1e-9,`vx must be (1 unit / 80ms) scaled, got ${v[0]}`);
 assert.equal(v[1],0);
 assert.equal(v[2],0);
});

test('samples older than the window are dropped; too few samples throw nothing',()=>{
 // t=0 is outside the 90ms window at now=100 — only one usable sample remains.
 assert.equal(pointerVelocity([{t:0,p:[0,0,0]},{t:100,p:[1,0,0]}],100),null);
 assert.equal(pointerVelocity([{t:100,p:[0,0,0]}],100),null);
 assert.equal(pointerVelocity([],100),null);
 assert.equal(THROW_WINDOW_MS>0,true,'window must be positive');
});

test('a stationary drag throws nothing',()=>{
 const v=pointerVelocity([{t:50,p:[1,2,3]},{t:100,p:[1,2,3]}],100);
 assert.deepEqual(v,[0,0,0]);
});

test('violent flings are clamped to THROW_MAX_SPEED',()=>{
 const samples=Array.from({length:11},(_,i)=>({t:i*10,p:[i*10,0,0]}));
 const v=pointerVelocity(samples,100); // ~1000 u/s raw — far past the cap
 assert.equal(Math.hypot(...v),THROW_MAX_SPEED,'velocity magnitude must be capped');
});
