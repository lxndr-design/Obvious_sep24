import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {StickCollection,stickLanding,attachCarriedStick} from '../src/sticks.js';
import {BirdColony,seededRandom} from '../src/birds.js';
import {birdMesh} from '../src/nature-shapes.js';
import {Ecology} from '../src/ecology.js';
import {PendulumScene} from '../src/pendulums.js';
import {CollisionScene} from '../src/collision.js';
import {WindField} from '../src/wind.js';
await R.init();
const stick=(id=1)=>{const f=makeForm('stick',R),mesh=new THREE.Mesh(f.geometry,new THREE.MeshStandardMaterial({color:0xffffff}));mesh.position.y=f.height/2;return {...f,mesh,type:'stick',id,properties:{locked:false}};};
const advance=(fn,t)=>{for(let i=0;i<t*60;i++)fn(1/60);};
test('sticks are tiny forked forms with separate matching branch colliders',()=>{
 const o=stick();assert.equal(o.parts.length,2);assert.ok(o.geometry.attributes.position.count<100);assert.ok(o.height<.05);assert.ok(o.geometry.boundingBox.getSize(new THREE.Vector3()).x<.5);assert.equal(o.stacking.head,0);
 const c=new CollisionScene(R);c.objects=[o];assert.equal(c.canPlace(o,o.mesh.position,new THREE.Quaternion(),new Set([o])),true);
});
test('one bird reserves a stick; pickup removes the original once and attaches an independent copy at the beak',()=>{
 const o=stick(),objects=[o],sticks=new StickCollection(()=>objects),site=sticks.sites()[0];let taken=0;sticks.onTake=item=>{assert.equal(item,o);objects.splice(0,1);taken++;};
 assert.ok(sticks.claim(site,1));assert.equal(sticks.claim(site,2),false);assert.equal(sticks.take(site,2),null);const carried=sticks.take(site,1);assert.ok(carried);assert.equal(taken,1);assert.equal(sticks.take(site,1),null);assert.equal(sticks.sites().length,0);assert.notEqual(carried.geometry,o.geometry);assert.notEqual(carried.material,o.mesh.material);
 const bird={carriedStick:carried},view=birdMesh();attachCarriedStick(view,bird);attachCarriedStick(view,bird);assert.equal(carried.parent,view.body);assert.equal(view.materials.filter(m=>m===carried.material).length,1);assert.deepEqual(carried.position.toArray(),[.14,.053,0]);assert.equal(carried.rotation.y,Math.PI/2);assert.equal(carried.userData.stickId,1);
});
test('birds arrive for sticks without leaves, dip to pick up, then fly and fade with the stick',()=>{
 const o=stick(),objects=[o],sticks=new StickCollection(()=>objects),colony=new BirdColony(seededRandom(6));sticks.onTake=()=>objects.splice(0,1);let sawPickup=false,sawFlight=false;
 advance(dt=>{colony.step(dt,sticks.sites());for(const b of colony.birds){if(b.state==='collecting'&&b.peck>.2)sawPickup=true;if(b.carriedStick&&b.state==='departing'&&b.position.y>1&&b.opacity>0&&b.opacity<1){sawFlight=true;assert.equal(b.wingState,'flapping');}}},18);
 assert.ok(sawPickup);assert.ok(sawFlight);assert.equal(objects.length,0);assert.equal(colony.birds.length,0);assert.deepEqual([...sticks.taken],[1]);
});
test('disturbance releases a claim without losing the stick, and locked or moving sticks cannot be collected',()=>{
 const o=stick(),objects=[o],sticks=new StickCollection(()=>objects),c=new BirdColony();sticks.onTake=()=>objects.splice(0,1);advance(dt=>c.step(dt,sticks.sites()),8);assert.equal(sticks.owners.size,1);c.disturb(c.birds[0].position.clone(),sticks.sites());assert.equal(sticks.owners.size,0);assert.equal(objects.length,1);assert.equal(sticks.taken.size,0);
 o.properties.locked=true;assert.equal(sticks.sites().length,0);o.properties.locked=false;sticks.canTake=()=>false;assert.equal(sticks.sites().length,0);sticks.canTake=()=>true;
 const c2=new BirdColony();advance(dt=>c2.step(dt,sticks.sites()),8);o.mesh.position.x=2;c2.step(1/60,sticks.sites());assert.equal(c2.birds[0].state,'departing');assert.equal(sticks.owners.size,0);assert.equal(objects.length,1);
});
test('the ecology carries and fades the actual stick view, removes physics and frees carry resources on departure',()=>{
 const scene=new THREE.Scene(),p=new PendulumScene(R),collision=new CollisionScene(R),o=stick();collision.objects=[o];p.add(o);scene.add(o.mesh);const e=new Ecology(scene,p,collision,new WindField(),R);e.piles=[];e.loose=[];e.feedingMode=true;
 e.sticks.onTake=item=>{collision.objects.splice(collision.objects.indexOf(item),1);p.remove(item);item.mesh.removeFromParent();item.geometry.dispose();item.mesh.material.dispose();return true;};let carried=null,disposed=false,faded=false;
 advance(dt=>{e.update(dt,null,0,0);const bird=e.colony.birds.find(b=>b.carriedStick);if(bird){if(!carried){carried=bird.carriedStick;carried.geometry.addEventListener('dispose',()=>disposed=true);}assert.equal(carried.parent,e.birdViews.get(bird.id).body);assert.equal(carried.material.opacity,bird.opacity);if(bird.opacity<.8&&bird.opacity>0)faded=true;}},18);
 assert.ok(carried);assert.ok(faded);assert.ok(disposed);assert.equal(collision.objects.length,0);assert.equal(e.birdViews.size,0);e.reset();assert.equal(e.sticks.taken.size,0);p.dispose();
});
