import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {CollisionScene} from '../src/collision.js';
import {makeForm} from '../src/shapes.js';
await R.init();
function form(type,x,z){const f=makeForm(type,R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(x,f.height/2,z);return {...f,mesh,type};}
test('simple and compound forms enter pools, rest on the bottom, and lift back over the rim',()=>{
 for(const type of ['box','sphere','cylinder','pebble','table-square-half','bench']){
  const c=new CollisionScene(R),o=form(type,3,3);c.objects=[o];
  assert.equal(c.move(o,new THREE.Vector3(3,o.mesh.position.y,-1.5)),true,type);
  assert.ok(Math.abs(o.mesh.position.y-(o.height/2-.71))<.002,`${type}: bottom Y ${o.mesh.position.y}`);assert.ok(c.canPlace(o,o.mesh.position));
  assert.equal(c.move(o,new THREE.Vector3(3,o.mesh.position.y,3)),true,`${type} exits`);
  assert.ok(Math.abs(o.mesh.position.y-o.height/2)<.002);assert.ok(c.canPlace(o,o.mesh.position));
 }
});
test('wide forms straddling a rim stay supported, and objects still block each other inside pools',()=>{
 const c=new CollisionScene(R),a=form('box',3,3),b=form('box',3,-1.5);b.mesh.position.y-=.71;c.objects=[a,b];
 assert.ok(c.supportY(a,.6,-1.5)>.674,'a block across the edge cannot sink through the land');
 assert.equal(c.move(a,new THREE.Vector3(3,a.mesh.position.y,-1.5)),true);
 assert.ok(a.mesh.position.z>b.mesh.position.z+1.2||a.mesh.position.y>b.mesh.position.y+1.3,'other solid remains an obstacle');assert.ok(c.canPlace(a,a.mesh.position));
 assert.equal(c.canPlace(b,new THREE.Vector3(3,-.8,-1.5)),false,'pool bottom remains solid');
});
