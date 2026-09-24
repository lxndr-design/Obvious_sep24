import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {FURNISHING_LABELS} from '../src/furnishings.js';
import {CollisionScene} from '../src/collision.js';
import {PendulumScene,CEILING_HEIGHT} from '../src/pendulums.js';
await R.init();
function form(type){const f=makeForm(type,R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(-5,f.height/2,3);return {...f,mesh,type,hanging:false,cableLength:1};}
function probe(){const geometry=new THREE.SphereGeometry(.025);geometry.computeBoundingBox();return {geometry,parts:[{shape:new R.Ball(.025),offset:new THREE.Vector3()}],mesh:new THREE.Mesh()};}
test('every plant and table variant has finite geometry, valid colliders and stable rigid-body creation',()=>{
 const p=new PendulumScene(R),collision=new CollisionScene(R);
 for(const type of Object.keys(FURNISHING_LABELS)){
  const o=form(type);assert.ok(o.geometry.attributes.position.array.every(Number.isFinite),type);assert.ok(o.height>0,type);
  assert.ok(Math.abs(o.geometry.boundingBox.min.y+o.height/2)<1e-6,type);
  assert.equal(collision.canPlace(o,o.mesh.position),true,type);p.add(o);
  assert.equal(o.body.numColliders(),o.parts.length,type);p.remove(o);o.geometry.dispose();
 }
 assert.equal(p.world.bodies.len(),0);p.dispose();
});
test('tables leave their undersides open and collide at each leg and tabletop, including after rotation',()=>{
 for(const shape of ['round','square'])for(const size of ['half','full']){
  const table=form(`table-${shape}-${size}`),ball=probe(),collision=new CollisionScene(R);collision.objects=[table,ball];
  const scale=size==='half'?.5:1,spread=(shape==='round'?.53:.79)*scale;
  for(const angle of [0,Math.PI/4]){
   table.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),angle);
   const at=(x,y,z)=>new THREE.Vector3(x,y-table.height/2,z).applyQuaternion(table.mesh.quaternion).add(table.mesh.position);
   assert.equal(collision.canPlace(ball,at(0,.5*scale,0)),true,'open center');
   for(const x of [-spread,spread])for(const z of [-spread,spread])assert.equal(collision.canPlace(ball,at(x,.5*scale,z)),false,'solid leg');
   assert.equal(collision.canPlace(ball,at(0,1.24*scale,0)),false,'solid top');
   assert.equal(collision.canPlace(ball,at(.86*scale,1.24*scale,.86*scale)),shape==='round','round top has no square corners');
  }
  table.geometry.dispose();ball.geometry.dispose();
 }
});
test('plant pots are solid while gaps around stems are not blocked by a foliage bounding box',()=>{
 const plant=form('plant-rubber-large'),ball=probe(),collision=new CollisionScene(R);collision.objects=[plant,ball];
 assert.equal(collision.canPlace(ball,new THREE.Vector3(-5,.25,3)),false,'pot');
 assert.equal(collision.canPlace(ball,new THREE.Vector3(-5+.7,.76,3)),true,'air beside stem above pot');
 assert.equal(collision.canPlace(ball,new THREE.Vector3(-5+.03,1.4,3)),false,'central stem');
 plant.geometry.dispose();ball.geometry.dispose();
});
test('one-metre cables support, pull and release both simple and compound objects without excess stretching',()=>{
 for(const type of ['sphere','plant-rubber-medium','table-square-half']){
  const p=new PendulumScene(R),o=form(type);o.hanging=true;o.mesh.position.y=CEILING_HEIGHT-1-o.height/2;p.add(o);
  p.beginPull(o);p.setPullTarget(o.mesh.position.clone().add(new THREE.Vector3(.65,0,0)));
  for(let i=0;i<120;i++)p.step(1/120);p.releasePull();
  let maxStretch=0;for(let i=0;i<600;i++){p.step(1/120);maxStretch=Math.max(maxStretch,p.attachment(o).distanceTo(o.anchor)-1);}
  assert.ok(o.mesh.position.toArray().every(Number.isFinite),type);assert.ok(maxStretch<.025,`${type}: ${maxStretch}`);
  p.dispose();o.geometry.dispose();
 }
});
