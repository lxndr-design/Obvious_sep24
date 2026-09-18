import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {BirdseedField,seedLanding,feedBird,SEED_RADIUS} from '../src/birdseed.js';
import {BirdColony,seededRandom} from '../src/birds.js';
import {PendulumScene} from '../src/pendulums.js';
import {makeForm} from '../src/shapes.js';
await R.init();
const advance=(fn,t)=>{for(let i=0;i<t*60;i++)fn(1/60);};
const createForm=(type,id=1)=>{const form=makeForm(type,R),mesh=new THREE.Mesh(form.geometry);mesh.position.y=form.height/2;return {...form,mesh,id,type};};
test('one plop creates one smaller grain which falls onto a table and falls again when support moves away',()=>{
 const p=new PendulumScene(R),table=createForm('table-square-full');p.add(table);const f=new BirdseedField(seededRandom(4));f.attachPhysics(p.world,R);assert.ok(SEED_RADIUS<.05);
 assert.equal(f.drop(new THREE.Vector3(0,table.height,0)),1);assert.equal(f.sequence,1);const seed=f.available()[0],start=seed.position.y;assert.equal(seed.settled,false);assert.equal(f.claim(new THREE.Vector3(),1),null);
 advance(dt=>{p.step(dt);f.updatePhysics(dt);},.15);assert.ok(seed.position.y<start-.04);advance(dt=>{p.step(dt);f.updatePhysics(dt);},3);
 assert.equal(seed.settled,true);assert.ok(Math.abs(seed.position.y-table.height)<.06);assert.ok(seedLanding(seed).y>table.height+.05);
 table.mesh.position.x=3;p.syncPose(table);advance(dt=>{p.step(dt);f.updatePhysics(dt);},4);assert.ok(seed.position.y<.06,'the grain falls off the moved table');assert.equal(seed.settled,true);
 const handle=seed.body.handle;f.claim(seed.position,1);assert.equal(f.consume(seed.id,1),true);assert.equal(p.world.getRigidBody(handle),null);assert.equal(f.remaining,0);p.dispose();
});
test('grains collide with curved forms, remain finite, and reset removes every grain body',()=>{
 const p=new PendulumScene(R),sphere=createForm('sphere');p.add(sphere);const f=new BirdseedField(seededRandom(21));f.attachPhysics(p.world,R);for(let i=0;i<6;i++)f.drop(new THREE.Vector3(.4+i*.02,sphere.height,0));const handles=f.available().map(s=>s.body.handle);
 advance(dt=>{p.step(dt);f.updatePhysics(dt);},7);assert.ok(f.available().every(s=>s.position.toArray().every(Number.isFinite)));assert.ok(f.available().every(s=>s.position.y<.07),'grains roll down the sphere onto the ground');f.reset();assert.ok(handles.every(h=>p.world.getRigidBody(h)===null));assert.equal(f.remaining,0);p.dispose();
});
test('birds notice separately, then take different reaction times before moving toward seed',()=>{
 const c=new BirdColony(),f=new BirdseedField(seededRandom(4)),pile={id:'leaves',position:new THREE.Vector3(),count:4};c.nextArrival=Infinity;f.scatter(new THREE.Vector3(),()=>true,8);
 c.birds=[0,1].map((caution,i)=>{const position=new THREE.Vector3(i?1:-1,.08,0);return {id:i+1,caution,state:'foraging',age:0,visitAge:0,pileId:pile.id,habitat:'leaves',position,target:position.clone(),walkTarget:position.clone(),nextWalk:99,opacity:1,fullness:0,capacity:10,yaw:0};});
 const noticed=new Map(),reacted=new Map();advance(dt=>{c.step(dt,[pile,...f.sites()]);for(const b of c.birds){if(b.state==='considering'&&!noticed.has(b.id))noticed.set(b.id,{time:c.time,duration:b.reactDuration});if(b.state==='feeding'&&!reacted.has(b.id))reacted.set(b.id,c.time);}},9);
 assert.equal(noticed.size,2);assert.ok(noticed.get(2).time-noticed.get(1).time>2);assert.ok(noticed.get(2).duration>noticed.get(1).duration+1);assert.ok(reacted.get(2)>reacted.get(1)+3);
});
test('cautious birds approach more slowly and elevated seed is eaten at its actual height',()=>{
 const birds=[];for(const caution of [0,1]){const f=new BirdseedField(()=>.5);f.scatter(new THREE.Vector3(0,1.3,0));const b={id:1,caution,state:'feeding',position:new THREE.Vector3(2,1.38,0),fullness:0,capacity:9};advance(dt=>feedBird(b,f.sites()[0],dt),1);birds.push(b);}
 assert.ok(birds[0].position.x<birds[1].position.x-.4);assert.ok(Math.abs(birds[0].position.y-1.38)<1e-5);
 const f=new BirdseedField(()=>.5);f.scatter(new THREE.Vector3(0,1.3,0));const b={id:1,caution:.5,state:'feeding',position:new THREE.Vector3(0,1.38,0),fullness:0,capacity:1};advance(dt=>feedBird(b,{...f.patches[0],field:f},dt),1);assert.equal(b.fullness,1);assert.equal(f.eaten,1);
});
