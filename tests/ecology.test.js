import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {WaveField} from '../src/waves.js';
import {WindField} from '../src/wind.js';
import {GrassStrand,makeGrassCollider} from '../src/grass.js';
import {BirdColony,seededRandom} from '../src/birds.js';
import {Ecology} from '../src/ecology.js';
import {PendulumScene} from '../src/pendulums.js';
import {CollisionScene} from '../src/collision.js';
import {makeForm} from '../src/shapes.js';
await R.init();
const advance=(fn,seconds,rate=60)=>{for(let i=0;i<Math.round(seconds*rate);i++)fn(1/rate);};
const pile=()=>({id:0,count:8,position:new THREE.Vector3(0,0,0)});
test('calm wind produces no forcing and direction changes drive the same field',()=>{const w=new WindField();w.strength=0;w.step(50);assert.equal(w.sample(3,4).lengthSq(),0);w.strength=.5;w.direction=0;const east=w.sample();w.direction=180;assert.ok(east.dot(w.sample())<0);});
test('water wakes have physical height, propagate, and settle when the wind stops',()=>{const w=new WaveField(129);w.energy=0;w.stroke({u:.2,v:.4},{u:.8,v:.4},.4);let peak=0;advance(dt=>{w.step(dt);peak=Math.max(peak,Math.max(...w.height),-Math.min(...w.height));},2);assert.ok(peak>.06,`dimensional wake peak ${peak}`);advance(dt=>w.step(dt),25);assert.ok(Math.max(...w.height.map(Math.abs))<.001);});
test('wake placement follows the mouse path without event-rate-dependent gaps',()=>{const a=new WaveField(),b=new WaveField();a.energy=b.energy=0;a.stroke({u:.2,v:.5},{u:.8,v:.5},.6);for(let i=0;i<12;i++)b.stroke({u:.2+i*.05,v:.5},{u:.25+i*.05,v:.5},.05);let error=0,total=0;for(let i=0;i<a.velocity.length;i++){error+=Math.abs(a.velocity[i]-b.velocity[i]);total+=Math.abs(a.velocity[i]);}assert.ok(error/total<.08,`event sampling error ${error/total}`);assert.equal(a.height.length,97*97);});
test('grass roots remain fixed while wind bends the stem, and calm air lets it recover',()=>{const root=new THREE.Vector3(),g=new GrassStrand(root,1.2);advance(dt=>g.step(dt,new THREE.Vector3(.7,0,0)),3);assert.ok(g.nodes.at(-1).x>.2);assert.deepEqual(g.nodes[0],root);advance(dt=>g.step(dt,new THREE.Vector3()),8);assert.ok(Math.abs(g.nodes.at(-1).x-g.rest.at(-1).x)<.04);assert.ok(g.nodes.every(p=>p.toArray().every(Number.isFinite)));});
test('soft grass collides with actual solid geometry without moving its root',()=>{const g=new GrassStrand(new THREE.Vector3(),1.3),f=makeForm('sphere',R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(.55,.9,0);const o={...f,mesh};const collide=makeGrassCollider(R,[o],g.root,g.height);advance(dt=>g.step(dt,new THREE.Vector3(.8,0,0),collide),2);for(const node of g.nodes.slice(1)){const distance=node.distanceTo(mesh.position);assert.ok(distance>=.76,`node should remain outside sphere: ${distance}`);}assert.deepEqual(g.nodes[0],new THREE.Vector3());});
test('birds require leaves and quiet, arrive through a fade, and gather near calm birds',()=>{const c=new BirdColony(seededRandom(7)),p=pile();advance(dt=>c.step(dt,[]),10);assert.equal(c.birds.length,0);advance(dt=>c.step(dt,[p],p.position),10);assert.equal(c.birds.length,0);let arrivalSeen=false;advance(dt=>{c.step(dt,[p]);if(c.birds.some(b=>b.state==='arriving'&&b.opacity>0&&b.opacity<1))arrivalSeen=true;},38);assert.ok(arrivalSeen);assert.ok(c.birds.filter(b=>b.state==='foraging').length>=2);assert.ok(c.birds.every(b=>b.pileId===0));});
test('nearby mouse scares birds, fades them out, and prevents immediate respawn',()=>{const c=new BirdColony(),p=pile();advance(dt=>c.step(dt,[p]),12);assert.ok(c.birds.some(b=>b.state==='foraging'));c.disturb(new THREE.Vector3(0,0,0),[p]);assert.ok(c.birds.every(b=>b.state==='departing'));advance(dt=>c.step(dt,[p],p.position),1);assert.ok(c.birds.every(b=>b.opacity<1));advance(dt=>c.step(dt,[p],p.position),10);assert.equal(c.birds.length,0);});
test('birds leave when leaf clusters disappear and remain bounded in number',()=>{const c=new BirdColony(),p=pile();advance(dt=>c.step(dt,[p]),60);assert.ok(c.birds.length<=5&&c.birds.length>0);p.count=0;advance(dt=>c.step(dt,[p]),3);assert.equal(c.birds.length,0);});
test('complete meadow initializes render geometry, simulates loose matter, and keeps foliage finite',()=>{
 const scene=new THREE.Scene(),p=new PendulumScene(R),collision=new CollisionScene(R),wind=new WindField(),e=new Ecology(scene,p,collision,wind,R);e.water=new WaveField();p.beforeStep=dt=>e.beforeStep(dt);
 assert.equal(e.grassClusters.length,18);
 assert.equal(e.strands.length,e.grassClusters.reduce((n,c)=>n+c.blades.length,3));
 assert.equal(e.strands.filter(s=>s.head).length,3);
 assert.ok(new Set(e.grassClusters.map(c=>c.blades.length)).size>=4,'clusters should vary in density');
 for(const cluster of e.grassClusters){
  assert.ok(cluster.blades.length>=2&&cluster.blades.length<=7);
  for(const blade of cluster.blades){
   assert.ok(blade.strand.root.distanceTo(cluster.root)<=.12,'roots stay in a sparse, compact cluster');
   assert.equal(blade.strand.nodes.length,4,'each blade retains its simple geometry and physics');
  }
 }
 assert.equal(e.loose.filter(o=>o.type==='leaf').length,16);assert.equal(e.loose.filter(o=>o.type==='seed').length,3);
 wind.strength=.7;const start=e.loose.find(o=>o.type==='seed').mesh.position.clone();advance(dt=>{p.step(dt);e.update(dt,null,0,0);},3);
 const seed=e.loose.find(o=>o.type==='seed');assert.ok(seed.mesh.position.distanceTo(start)>.1,'wind should roll a seed pod');
 assert.ok(e.strands.every(s=>s.mesh.geometry.attributes.position.array.every(Number.isFinite)));assert.ok(e.loose.every(o=>o.mesh.position.toArray().every(Number.isFinite)));
 e.reset();assert.equal(e.colony.birds.length,0);assert.ok(seed.mesh.position.distanceTo(start)<1e-5);p.dispose();
});

test('seed pods settle instead of gaining energy in calm air, and birds peck at real leaf piles',()=>{
 const p=new PendulumScene(R),wind=new WindField();wind.strength=0;const e=new Ecology(new THREE.Scene(),p,new CollisionScene(R),wind,R);p.beforeStep=dt=>e.beforeStep(dt);const seed=e.loose.find(o=>o.type==='seed'),start=seed.spawn.clone();let peakSpeed=0,pecks=0;const peck=e.colony.onPeck;e.colony.onPeck=(...args)=>{pecks++;peck(...args);};
 advance(dt=>{p.step(dt);e.update(dt,null,0,0);const v=seed.body.linvel();peakSpeed=Math.max(peakSpeed,Math.hypot(v.x,v.y,v.z));},25);
 assert.ok(peakSpeed<1.5,`calm peak speed ${peakSpeed}`);assert.ok(seed.mesh.position.distanceTo(start)<.6);assert.ok(new THREE.Vector3().copy(seed.body.linvel()).length()<.01);assert.ok(pecks>0);assert.ok(e.colony.birds.length>=2);p.dispose();
});
test('the physical ground supports loose bodies beyond the former platform edge',()=>{
 const p=new PendulumScene(R),body=p.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(20,2,20));p.world.createCollider(R.ColliderDesc.ball(.2),body);advance(dt=>p.step(dt),3);assert.ok(Math.abs(body.translation().y-.2)<.015);assert.ok(body.translation().x>7);p.dispose();
});
