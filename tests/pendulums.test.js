import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {CollisionScene} from '../src/collision.js';
import {PendulumScene,CEILING_HEIGHT} from '../src/pendulums.js';
await R.init();
function form(type='sphere',x=-3,z=2,hanging=true,length=4.65){const f=makeForm(type,R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(x,hanging?CEILING_HEIGHT-length-f.height/2:f.height/2,z);return {...f,mesh,type,hanging,cableLength:length};}
function advance(p,seconds,hz=120){for(let i=0;i<Math.round(seconds*hz);i++)p.step(1/hz);}
test('pulling a suspended form leaves its ceiling anchor fixed and release produces a pendulum swing',()=>{
 const p=new PendulumScene(R),o=form();p.add(o);const anchor=o.anchor.clone();
 p.beginPull(o);p.setPullTarget(o.mesh.position.clone().add(new THREE.Vector3(2,0,0)));advance(p,1.5);
 assert.ok(o.mesh.position.x>anchor.x+1);assert.deepEqual(o.anchor,anchor);
 p.releasePull();const start=o.mesh.position.x;let crossed=false,maxStretch=0;
 for(let i=0;i<1200;i++){p.step(1/120);if(o.mesh.position.x<anchor.x-.3)crossed=true;maxStretch=Math.max(maxStretch,p.attachment(o).distanceTo(anchor)-o.cableLength);}
 assert.ok(crossed,`must swing back past vertical, started at ${start}`);assert.ok(maxStretch<.025,`rope stretch ${maxStretch}`);assert.deepEqual(o.anchor,anchor);p.dispose();
});
test('dragging an anchor translates the whole assembly and its full tilted pose together',()=>{
 const p=new PendulumScene(R),o=form('box');p.add(o);const collision=new CollisionScene(R);collision.objects=[o];
 p.beginPull(o);p.setPullTarget(o.mesh.position.clone().add(new THREE.Vector3(1,0,0)));advance(p,1);p.releasePull();
 const oldPosition=o.mesh.position.clone(),oldAnchor=o.anchor.clone(),oldRotation=o.mesh.quaternion.clone();
 p.beginAnchor(o);const target=oldAnchor.clone().add(new THREE.Vector3(.5,0,.5));assert.equal(p.moveAnchor(o,target,collision),true);advance(p,.2);
 assert.ok(o.mesh.position.distanceTo(oldPosition.clone().add(new THREE.Vector3(.5,0,.5)))<1e-5);assert.ok(o.mesh.quaternion.angleTo(oldRotation)<.001);assert.ok(o.anchor.distanceTo(target)<1e-8);
 p.endAnchor(o);assert.equal(o.body.isDynamic(),true);assert.ok(new THREE.Vector3().copy(o.body.linvel()).length()<1e-8);p.dispose();
});
test('anchor translation obeys continuous collision checks',()=>{
 const p=new PendulumScene(R),o=form('sphere',-4,3,true,6.5),block=form('cylinder',-1.5,3,false);p.add(o);p.add(block);
 const collision=new CollisionScene(R);collision.objects=[o,block];p.beginAnchor(o);const old=o.anchor.clone();
 assert.equal(p.moveAnchor(o,new THREE.Vector3(0,8.5,3),collision),false);assert.deepEqual(o.anchor,old);p.dispose();
});
test('spring pulling respects solid contacts rather than teleporting through them',()=>{
 const p=new PendulumScene(R),o=form('sphere',-4,3,true,6.5),block=form('cylinder',-1.5,3,false);p.add(o);p.add(block);
 p.beginPull(o);p.setPullTarget(new THREE.Vector3(-1,1.25,3));advance(p,2);
 assert.ok(o.mesh.position.x<-2.7,`sphere must stop at column, x=${o.mesh.position.x}`);
 p.releasePull();advance(p,8);assert.ok(o.mesh.position.y>.70);p.dispose();
});
test('cancellation restores both anchor and rigid-body state',()=>{
 const p=new PendulumScene(R),o=form();p.add(o);const s=p.snapshot(o),collision=new CollisionScene(R);collision.objects=[o];
 p.beginAnchor(o);p.moveAnchor(o,o.anchor.clone().add(new THREE.Vector3(1,0,1)),collision);p.endAnchor(o);p.restore(o,s);
 assert.deepEqual(o.mesh.position,s.position);assert.deepEqual(o.anchor,s.anchor);assert.deepEqual({...o.body.linvel()},s.velocity);p.dispose();
});
test('changing cable length rebuilds one constraint, and removing forms frees bodies and joints',()=>{
 const p=new PendulumScene(R),o=form();p.add(o);o.cableLength=5.5;o.mesh.position.y=8.5-5.5-o.height/2;p.rebuild(o);advance(p,2);
 assert.ok(Math.abs(p.attachment(o).distanceTo(o.anchor)-5.5)<.025);assert.equal(p.world.bodies.len(),2);assert.equal(p.world.impulseJoints.len(),1);
 p.remove(o);assert.equal(p.world.bodies.len(),0);assert.equal(p.world.impulseJoints.len(),0);p.dispose();
});
test('fixed-step pendulums have the same trajectory at different rendering frame rates',()=>{
 const a=new PendulumScene(R),b=new PendulumScene(R),oa=form(),ob=form();a.add(oa);b.add(ob);
 oa.body.setLinvel({x:2,y:0,z:.7},true);ob.body.setLinvel({x:2,y:0,z:.7},true);advance(a,3,120);advance(b,3,30);
 assert.ok(oa.mesh.position.distanceTo(ob.mesh.position)<1e-5);a.dispose();b.dispose();
});
test('long swings stay finite, keep the ceiling attachment, and lose energy naturally',()=>{
 const p=new PendulumScene(R),o=form('pebble');p.add(o);o.body.setLinvel({x:3,y:0,z:1},true);
 advance(p,1);const energy=()=>{const v=o.body.linvel();return .5*(v.x*v.x+v.y*v.y+v.z*v.z)+9.81*(o.mesh.position.y-(8.5-o.cableLength-o.height/2));};const initial=energy();
 advance(p,30);assert.ok(o.mesh.position.toArray().every(Number.isFinite));assert.ok(energy()<initial*.4);assert.ok(p.attachment(o).distanceTo(o.anchor)<o.cableLength+.025);p.dispose();
});
