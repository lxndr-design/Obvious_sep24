import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {CollisionScene} from '../src/collision.js';
import {StackScene} from '../src/stacking.js';
import {dragFloor,placementAt} from '../src/dragging.js';
import {SIGN_LABELS,signPlacement,applySignPlacement,turnSign} from '../src/signs.js';
import {SignFocus,signFocusPose} from '../src/sign-focus.js';
await R.init();
const make=(type,x=0,z=0)=>{const f=makeForm(type,R),o={...f,type,properties:{locked:false},mesh:new THREE.Mesh(f.geometry)};o.mesh.position.set(x,f.height/2,z);return o;};
test('all sign variants have finite low-poly geometry and accurate shape queries',()=>{
 for(const type of Object.keys(SIGN_LABELS)){const c=new CollisionScene(R),o=make(type);assert.ok(o.geometry.attributes.position.count<1200);assert.ok(c.canPlace(o,o.mesh.position));for(const part of o.parts)assert.ok(part.shape);}
});
test('five independent signs attach, a sixth cannot overlap, and slots are reused',()=>{
 const c=new CollisionScene(R),pole=make('sign-pole');c.objects=[pole];
 for(let i=0;i<5;i++){const o=make('sign-arrow-text',5);c.objects.push(o);const p=signPlacement(c,o,0,0);assert.ok(p);applySignPlacement(o,p);assert.equal(o.support,pole);assert.equal(o.signSlot,i);assert.ok(c.canPlace(o,o.mesh.position));}
 const extra=make('sign-pennant-icon',6);c.objects.push(extra);assert.equal(signPlacement(c,extra,0,0),null);
 c.objects.splice(2,1);const p=signPlacement(c,extra,0,0);assert.equal(p.signSlot,1);applySignPlacement(extra,p);assert.ok(c.canPlace(extra,extra.mesh.position));
});
test('drag attach, individual rotation, pole translation and rotation preserve attachments',()=>{
 const c=new CollisionScene(R),stack=new StackScene(c),pole=make('sign-pole'),a=make('sign-arrow-text',5),b=make('sign-plaque-icon',7);c.objects=[pole,a,b];
 assert.ok(dragFloor(stack,a,new THREE.Vector3()).moved);assert.ok(dragFloor(stack,b,new THREE.Vector3()).moved);
 const before=b.mesh.quaternion.clone();assert.ok(turnSign(c,a,Math.PI/4));assert.ok(b.mesh.quaternion.equals(before));assert.equal(a.support,pole);
 const offset=a.mesh.position.clone().sub(pole.mesh.position);assert.ok(dragFloor(stack,pole,new THREE.Vector3(-3,1.35,-3)).moved);assert.ok(a.mesh.position.clone().sub(pole.mesh.position).distanceTo(offset)<1e-6);assert.equal(stack.members(pole).length,3);
 assert.ok(stack.rotate(pole));assert.equal(a.support,pole);assert.ok(c.canPlace(a,a.mesh.position));
 const snapshot=stack.snapshot(a);assert.ok(dragFloor(stack,a,new THREE.Vector3(5,0,5)).moved);assert.equal(a.support,null);assert.equal(a.signSlot,null);stack.restore(snapshot);assert.equal(a.support,pole);assert.equal(a.signSlot,0);
});
test('locked poles reject attachment, blocked destinations preserve signs, toolbar finds same mounts',()=>{
 const c=new CollisionScene(R),stacks=new StackScene(c),pole=make('sign-pole'),a=make('sign-pennant-text',6);c.objects=[pole,a];pole.properties.locked=true;assert.equal(signPlacement(c,a,0,0),null);pole.properties.locked=false;const p=placementAt(stacks,a,0,0);assert.equal(p.support,pole);applySignPlacement(a,p);
 const blocker=make('box',5,5);c.objects.push(blocker);const old=a.mesh.position.clone();assert.equal(dragFloor(stacks,a,new THREE.Vector3(5,0,5)).moved,false);assert.ok(a.mesh.position.equals(old));assert.equal(a.support,pole);
});
test('focus is head-on, fits every mounted sign, locks controls and restores exact camera',()=>{
 const c=new CollisionScene(R),pole=make('sign-pole'),a=make('sign-arrow-text',5);c.objects=[pole,a];applySignPlacement(a,signPlacement(c,a,0,0));turnSign(c,a,Math.PI);
 const camera=new THREE.OrthographicCamera(-12,12,8,-8,.1,1200);camera.position.set(14,18,20);camera.lookAt(0,.4,0);camera.zoom=1.7;camera.updateProjectionMatrix();const controls={target:new THREE.Vector3(0,.4,0),enabled:true};
 const focus=new SignFocus(camera,controls),before=focus.capture();focus.enter(pole,c.objects,1280,720);focus.step(1);assert.equal(controls.enabled,false);assert.equal(camera.position.y,controls.target.y);assert.ok(camera.position.z>controls.target.z);
 camera.updateMatrixWorld();for(const o of c.objects){o.mesh.updateMatrixWorld();const box=o.geometry.boundingBox.clone().applyMatrix4(o.mesh.matrixWorld);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1);}}
 focus.exit();focus.step(1);assert.equal(controls.enabled,true);assert.ok(camera.position.equals(before.position));assert.ok(camera.quaternion.angleTo(before.rotation)<1e-7);assert.equal(camera.zoom,before.zoom);assert.ok(controls.target.equals(before.target));assert.equal(focus.active,false);
});
