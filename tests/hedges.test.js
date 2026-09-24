import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {HedgeScene} from '../src/hedges.js';
import {CollisionScene} from '../src/collision.js';
import {PendulumScene} from '../src/pendulums.js';
import {BathWater} from '../src/birdbath.js';
await R.init();
function setup(){
 const collision=new CollisionScene(R),p=new PendulumScene(R),hedges=new HedgeScene(R,collision,p);
 const add=(x,z)=>{const f=makeForm('hedge',R),mesh=new THREE.Mesh(f.geometry),o={...f,mesh,type:'hedge',hanging:false};mesh.position.set(x,f.height/2,z);collision.objects.push(o);p.add(o);return o;};
 const ball={geometry:new THREE.SphereGeometry(.02),mesh:new THREE.Mesh(),parts:[{shape:new R.Ball(.02),offset:new THREE.Vector3()}]};ball.geometry.computeBoundingBox();
 return {collision,p,hedges,add,clear:(x,y,z)=>collision.canPlace(ball,new THREE.Vector3(x,y,z))};
}
test('hedges reject coincident and partially overlapping pieces',()=>{
 const {collision,p,add}=setup();add(0,0);const f=makeForm('hedge',R),b={...f,type:'hedge',mesh:new THREE.Mesh(f.geometry)};
 for(const x of [0,.01,.1,.2,.3,.5,.7]){b.mesh.position.set(x,f.height/2,0);assert.equal(collision.canPlace(b,b.mesh.position),false,`offset ${x}`);}p.dispose();
});
test('hedges inset their tile, fill connected gaps and restore open space when separated',()=>{
 const {collision,p,hedges,add,clear}=setup(),a=add(0,0);
 assert.ok(clear(.46,.3,0));const b=add(1,0);assert.ok(clear(.5,.3,0));
 // Prepare cached colliders before growing the shape to catch stale broadphase data.
 collision.partsAt(a);assert.ok(hedges.refresh());assert.equal(a.hedgeJoins,2);assert.equal(b.hedgeJoins,1);
 assert.equal(clear(.5,.3,0),false);assert.ok(clear(.5,.3,.46));
 assert.ok(hedges.refresh(b));b.mesh.position.x=3;p.syncPose(b);assert.ok(hedges.refresh());
 assert.equal(a.hedgeJoins,0);assert.ok(clear(.46,.3,0));assert.ok(clear(.5,.3,0));
 assert.equal(a.body.numColliders(),a.parts.length);p.dispose();
});
test('four hedge tiles close their central gap without joining diagonal-only or different-height neighbours',()=>{
 const {p,hedges,add,clear}=setup(),a=add(0,0),d=add(1,1);assert.ok(hedges.refresh());assert.equal(a.hedgeJoins,0);
 const b=add(1,0),c=add(0,1);assert.ok(hedges.refresh());assert.equal(clear(.5,.3,.5),false);
 d.mesh.position.y+=1;assert.ok(hedges.refresh());assert.equal(d.hedgeJoins,0);assert.equal(b.hedgeJoins,1);assert.equal(c.hedgeJoins,4);p.dispose();
});
test('connections cannot grow through another object and failed growth restores geometry and colliders',()=>{
 const {collision,p,hedges,add,clear}=setup(),a=add(0,0),b=add(1,0);
 const geometry=new THREE.BoxGeometry(.06,.2,.06);geometry.computeBoundingBox();const mesh=new THREE.Mesh(geometry);mesh.position.set(.5,.1,0);
 const blocker={geometry,mesh,parts:[{shape:new R.Cuboid(.03,.1,.03),offset:new THREE.Vector3()}]};collision.objects.push(blocker);
 assert.equal(hedges.refresh(),false);assert.equal(a.hedgeJoins,0);assert.equal(b.hedgeJoins,0);assert.ok(clear(.42,.3,0));
 collision.objects.pop();assert.ok(hedges.refresh());assert.equal(clear(.5,.3,0),false);p.dispose();
});
test('fountain contains live water and emits a small rising spray',()=>{
 const f=makeForm('fountain',R),o={...f,type:'fountain',mesh:new THREE.Mesh(f.geometry)};o.mesh.position.y=f.height/2;
 const view=new BathWater(o);for(let i=0;i<60;i++)view.update(1/60,new THREE.Vector3());
 assert.ok(view.drops.some(d=>d&&d.position.y>.25));assert.ok(view.field.height.some(h=>Math.abs(h)>1e-5));assert.ok(view.geometry.attributes.position.array.every(Number.isFinite));view.dispose();
});
