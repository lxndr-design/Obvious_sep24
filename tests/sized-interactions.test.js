import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeSizedForm} from '../src/object-size.js';
import {HedgeScene} from '../src/hedges.js';
import {CollisionScene} from '../src/collision.js';
import {StackScene} from '../src/stacking.js';
import {PendulumScene} from '../src/pendulums.js';
import {BathWater,bathWaterContexts} from '../src/birdbath.js';
import {bathDimensions} from '../src/bath-shapes.js';
import {HoleLayout} from '../src/terrain.js';
await R.init();
const object=(type,size,x=0)=>{const f=makeSizedForm(type,R,size),o={...f,type,id:x,mesh:new THREE.Mesh(f.geometry)};o.mesh.position.set(x,f.height/2,0);return o;};
test('each size retains connected hedge and bath geometry, collision bodies and water',()=>{
 for(const size of [1,2,3])for(const type of ['hedge','birdbath']){
  const collision=new CollisionScene(R),physics=new PendulumScene(R),a=object(type,size),b=object(type,size,size);collision.objects.push(a,b);physics.add(a);physics.add(b);
  const joins=new HedgeScene(R,collision,physics,()=>{},type);assert.ok(joins.refresh());const key=type==='hedge'?'hedgeJoins':'bathJoins';assert.equal(a[key],2);assert.equal(b[key],1);
  assert.ok(Math.abs(a.geometry.boundingBox.max.x-size/2)<1e-6);assert.equal(a.body.numColliders(),a.parts.length);
  if(type==='birdbath'){
   const contexts=bathWaterContexts([a,b]);assert.equal(contexts.get(a),contexts.get(b));const water=new BathWater(a,contexts.get(a));
   assert.ok(Math.abs(water.group.position.y+a.height/2-bathDimensions(a).waterY)<1e-6);assert.ok(water.field.mask.some(Boolean));
   water.geometry.computeBoundingBox();assert.ok(Math.abs(water.geometry.boundingBox.max.x-size/2)<1e-6);water.dispose();
  }
  b.mesh.position.x+=size*2;assert.ok(joins.refresh());assert.equal(a[key],0);assert.equal(a.gridSize,size);physics.dispose();
 }
});
test('scaled Grandma sits on a same-size bench and stands again with scaled hands and colliders',()=>{
 for(const size of [1,2,3]){
  const collision=new CollisionScene(R),stacks=new StackScene(collision),bench=object('bench',size),grandma=object('grandma',size,5);collision.objects.push(bench,grandma);
  assert.ok(stacks.placeGrandma(grandma,new THREE.Vector3()),`size ${size} sits`);assert.ok(grandma.seated);assert.equal(grandma.support,bench);assert.ok(collision.canPlace(grandma,grandma.mesh.position));
  assert.ok(stacks.placeGrandma(grandma,new THREE.Vector3(5,0,0)));assert.equal(grandma.seated,false);assert.ok(Math.abs(grandma.height-size)<1e-6);
 }
});
test('small, medium and large pools retain their exact footprints and merge at mixed-size edges',()=>{
 const layout=new HoleLayout([{id:1,x:0,z:0,size:1},{id:2,x:1.5,z:0,size:2},{id:3,x:4,z:0,size:3}]);
 assert.equal(layout.components.length,1);assert.equal(layout.bottom.reduce((sum,r)=>sum+r.w*r.d,0),14);assert.ok(layout.contains(.5,0));assert.ok(layout.contains(2.5,0));
});
