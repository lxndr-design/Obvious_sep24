import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {CollisionScene} from '../src/collision.js';
import {WaveField} from '../src/waves.js';
await R.init();
function object(type,x,z,y){const f=makeForm(type,R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(x,y??f.height/2,z);return {...f,mesh,type};}
test('all supported shapes have usable matching geometry and colliders',()=>{for(const type of ['box','sphere','cylinder','arch','pebble']){const o=object(type,-4,3);assert.ok(o.parts.length);assert.ok(o.height>0);assert.ok(o.geometry.boundingBox);assert.equal(new CollisionScene(R).canPlace(o,o.mesh.position),true);}});
test('solid overlap is rejected while separated solids are allowed',()=>{const p=new CollisionScene(R),a=object('box',-3,2),b=object('sphere',-3,2);p.objects=[a,b];assert.equal(p.canPlace(a,a.mesh.position),false);assert.equal(p.canPlace(a,new THREE.Vector3(-5,.675,2)),true);});
test('sphere corners do not behave as oversized bounding boxes',()=>{const p=new CollisionScene(R),a=object('sphere',-3,2),b=object('sphere',-1.8,3.2);p.objects=[a,b];assert.equal(p.canPlace(a,a.mesh.position),true);});
test('a small solid passes through the arch opening but hits its legs',()=>{const arch=object('arch',-3,0),p=new CollisionScene(R),probe={geometry:new THREE.BoxGeometry(.3,.3,.3),parts:[{shape:new R.Cuboid(.15,.15,.15),offset:new THREE.Vector3()}],mesh:new THREE.Mesh()};probe.geometry.computeBoundingBox();p.objects=[arch,probe];assert.equal(p.canPlace(probe,new THREE.Vector3(-3,.5,0)),true);assert.equal(p.canPlace(probe,new THREE.Vector3(-3.8,.5,0)),false);assert.equal(p.canPlace(probe,new THREE.Vector3(-3,2,0)),false);});
test('continuous shape casts prevent tunneling between clear endpoints',()=>{const p=new CollisionScene(R),a=object('box',-5,3),b=object('box',-2,3);p.objects=[a,b];assert.equal(p.canPlace(a,new THREE.Vector3(1,.675,3)),true);assert.equal(p.canTravel(a,new THREE.Vector3(1,.675,3)),false);assert.equal(p.move(a,new THREE.Vector3(-5,.675,4)),true);});
test('open ground permits distant placements and pool bottoms support submerged forms',()=>{const p=new CollisionScene(R),o=object('sphere',-3,2);assert.equal(p.canPlace(o,new THREE.Vector3(-70,.75,20)),true);assert.equal(p.canPlace(o,new THREE.Vector3(3,.04,-1)),true);assert.equal(p.canPlace(o,new THREE.Vector3(3,3,-1)),true);});
test('height-aware collisions permit vertically separated suspended objects',()=>{const p=new CollisionScene(R),a=object('box',-3,2),b=object('box',-3,2,3);p.objects=[a,b];assert.equal(p.canPlace(a,a.mesh.position),true);assert.equal(p.canTravel(b,new THREE.Vector3(-3,.675,2)),false);});
test('wave solver remains finite at maximum wind and repeated disturbances',()=>{const w=new WaveField();w.energy=1;for(let i=0;i<2400;i++){if(i%120===0)w.disturb(.45,.55,3,.18);w.integrate();}assert.ok(w.height.every(Number.isFinite));assert.ok(Math.max(...w.height)<.3);assert.ok(Math.min(...w.height)>-.3);const mean=w.height.reduce((a,b)=>a+b,0)/w.height.length;assert.ok(Math.abs(mean)<1e-6);});
test('waves propagate to the pool wall and decay without forcing',()=>{const w=new WaveField();w.energy=0;w.disturb(.5,.5,2,.15);for(let i=0;i<160;i++)w.integrate();assert.ok(Math.abs(w.height[48*w.size])>.0001);const energy=()=>w.height.reduce((s,h)=>s+h*h,0)+w.velocity.reduce((s,v)=>s+v*v,0);const initial=energy();for(let i=0;i<2400;i++)w.integrate();assert.ok(energy()<initial*.01);});
test('fixed stepping is independent of render rate',()=>{const a=new WaveField(33),b=new WaveField(33);a.disturb(.5,.5);b.disturb(.5,.5);for(let i=0;i<120;i++)a.step(1/120);for(let i=0;i<30;i++)b.step(1/30);assert.deepEqual(a.height,b.height);});
test('touching spheres can move apart without sticking',()=>{const p=new CollisionScene(R),a=object('sphere',-3,3),b=object('sphere',-1.5,3);p.objects=[a,b];assert.equal(p.canTravel(a,new THREE.Vector3(-3.5,.75,3)),true);assert.equal(p.canTravel(a,new THREE.Vector3(-2.5,.75,3)),false);});
test('grid movement ends flush against the actual surface, without jumping through it',()=>{
 for(const type of ['box','sphere','cylinder','pebble']){
  const p=new CollisionScene(R),a=object(type,-6,3),b=object(type,-3,3);p.objects=[a,b];
  assert.equal(p.move(a,new THREE.Vector3(0,a.mesh.position.y,3)),true);
  const contact=a.parts[0].shape.contactShape(a.mesh.position,a.mesh.quaternion,b.parts[0].shape,b.mesh.position,b.mesh.quaternion,.01);
  assert.ok(contact&&Math.abs(contact.distance)<.001,`${type} should touch, gap ${contact?.distance}`);
  assert.ok(a.mesh.position.x<b.mesh.position.x);assert.ok(p.canPlace(a,a.mesh.position));
  assert.equal(p.move(a,a.mesh.position.clone().add(new THREE.Vector3(-.5,0,0))),true,'can pull away from contact');
 }
});
test('flush blocks can slide along their shared face',()=>{
 const p=new CollisionScene(R),a=object('box',-6,3),b=object('box',-3,3);p.objects=[a,b];
 p.move(a,new THREE.Vector3(-4,.675,3));
 assert.ok(Math.abs(a.mesh.position.x+4.35)<.001);
 assert.equal(p.move(a,a.mesh.position.clone().add(new THREE.Vector3(0,0,.5))),true);
 assert.ok(Math.abs(a.mesh.position.x+4.35)<.001);assert.ok(Math.abs(a.mesh.position.z-3.5)<.001);
});
