import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {messageDotPosition} from '../src/message-dot.js';
await R.init();
test('message dots overlap real mesh surfaces for round, concave and rotated objects',()=>{
 const camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,100);camera.position.set(12,10,12);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 for(const type of ['fountain','birdbath','sphere','arch','bench','box']){
  const form=makeForm(type,R),mesh=new THREE.Mesh(form.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  for(const angle of [0,.6,1.8]){
   mesh.rotation.y=angle;mesh.updateMatrixWorld();const point=messageDotPosition(mesh,camera,800,800);assert.ok(point,type);
   const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(point.x/400-1,1-point.y/400),camera);
   assert.ok(ray.intersectObject(mesh,false).length>0,`${type} ${angle}: dot must be on actual triangles`);
  }
 }
});
test('anchor cache follows mesh movement, viewport changes and geometry replacement',()=>{
 const camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,100);camera.position.set(10,10,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2)),a=messageDotPosition(mesh,camera,800,800);
 assert.equal(messageDotPosition(mesh,camera,800,800),a);
 mesh.position.x=2;const b=messageDotPosition(mesh,camera,800,800);assert.notDeepEqual(a,b);
 const c=messageDotPosition(mesh,camera,400,400);assert.notDeepEqual(b,c);
 mesh.geometry=new THREE.SphereGeometry(.5);assert.notDeepEqual(messageDotPosition(mesh,camera,400,400),c);
});
