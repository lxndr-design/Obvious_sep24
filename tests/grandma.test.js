import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm,LABELS} from '../src/shapes.js';
import {CollisionScene} from '../src/collision.js';
import {StackScene} from '../src/stacking.js';
import {PendulumScene} from '../src/pendulums.js';
import {dragFloor,placementAt} from '../src/dragging.js';
import {GrandmaFeeding,applyGrandmaPlacement} from '../src/grandma.js';
import {BirdseedField} from '../src/birdseed.js';
await R.init();
function setup(){const collision=new CollisionScene(R),stacks=new StackScene(collision),p=new PendulumScene(R);let id=0;
 const add=(type,x,z=0)=>{const f=makeForm(type,R),mesh=new THREE.Mesh(f.geometry),o={...f,mesh,type,id:++id};mesh.position.set(x,f.height/2,z);collision.objects.push(o);p.add(o);return o;};return {collision,stacks,p,add};}
test('Grandma sits on a bench facing its front, moves with it, and stands when dragged away',()=>{
 const {collision,stacks,p,add}=setup(),bench=add('bench',0),g=add('grandma',3);assert.equal(LABELS.grandma,'Grandma');
 assert.ok(dragFloor(stacks,g,new THREE.Vector3()).moved);assert.equal(g.support,bench);assert.ok(g.seated);assert.ok(collision.canPlace(g,g.mesh.position));p.syncPose(g);assert.equal(g.bodyGeometry,g.geometry);
 assert.ok(stacks.move(bench,new THREE.Vector3(-3,bench.mesh.position.y,0)));assert.equal(g.mesh.position.x,-3);assert.ok(stacks.rotate(bench));assert.ok(g.mesh.quaternion.angleTo(bench.mesh.quaternion)<1e-8);
 const snapshot=stacks.snapshot(g);assert.ok(dragFloor(stacks,g,new THREE.Vector3(3,0,3)).moved);assert.equal(g.seated,false);assert.equal(g.support,null);assert.ok(Math.abs(g.mesh.position.y-g.height/2)<1e-6);p.syncPose(g);
 stacks.restore(snapshot);p.syncPose(g);assert.equal(g.seated,true);assert.equal(g.support,bench);assert.ok(collision.canPlace(g,g.mesh.position));assert.equal(g.bodyGeometry,g.geometry);p.dispose();
});
test('toolbar seating, occupied seats, blocked destinations and bench removal keep exact colliders',()=>{
 const {collision,stacks,p,add}=setup(),bench=add('bench',0),g=add('grandma',3);bench.mesh.rotation.y=Math.PI/2;p.syncPose(bench);
 const placement=placementAt(stacks,g,0,0);assert.ok(placement?.seated);applyGrandmaPlacement(g,placement,collision);p.syncPose(g);
 const other=add('grandma',-3);assert.equal(placementAt(stacks,other,0,0),null);assert.equal(other.seated,false);
 const block=add('box',3,3),snapshot=stacks.snapshot(g);assert.equal(dragFloor(stacks,g,block.mesh.position).moved,false);assert.ok(g.seated);assert.deepEqual(g.mesh.position.toArray(),snapshot[0].position.toArray());
 collision.objects.splice(collision.objects.indexOf(bench),1);p.remove(bench);g.support=null;assert.ok(stacks.settle(g));p.syncPose(g);assert.equal(g.seated,false);assert.ok(collision.canPlace(g,g.mesh.position));p.dispose();
});
test('Grandma tosses individually accounted physical seeds forward at occasional intervals, and pauses while carried',()=>{
 const {stacks,p,add}=setup(),bench=add('bench',0),g=add('grandma',3),food=new BirdseedField(()=>.5),feeding=new GrandmaFeeding(()=>.5);food.attachPhysics(p.world,R);
 feeding.step(5,[g],food);assert.equal(food.remaining,0);feeding.step(.6,[g],food);assert.equal(food.remaining,6);
 assert.ok(food.available().every(s=>!s.settled&&s.body.linvel().z>.7&&s.position.y>.9));
 for(let i=0;i<180;i++){p.step(1/60);food.updatePhysics(1/60);}assert.ok(food.available().every(s=>s.position.z>.5&&s.position.y<.06));
 feeding.busy=()=>true;feeding.step(30,[g],food);assert.equal(food.remaining,6);feeding.busy=()=>false;stacks.placeGrandma(g,new THREE.Vector3());p.syncPose(g);g.mesh.rotation.y=Math.PI;feeding.step(15,[g],food);assert.equal(food.remaining,12);assert.ok(food.available().slice(6).every(s=>s.body.linvel().z<-.7));
 feeding.step(30,[],food);assert.equal(food.remaining,12);assert.equal(feeding.timers.size,0);feeding.reset();assert.equal(feeding.scatters,0);food.reset();p.dispose();
});
