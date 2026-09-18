import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WindField} from '../src/wind.js';
import {WindTrails,trailRate,trailPoint} from '../src/wind-trails.js';
const advance=(fn,t,rate=60)=>{for(let i=0;i<t*rate;i++)fn(1/rate);};
test('turbulence is coherent, deterministic, bounded and disabled with calm wind',()=>{
 const a=new WindField(),b=new WindField();a.strength=b.strength=1;a.turbulence=b.turbulence=1;let changes=0,previous=a.sample(2,3);
 for(let i=0;i<500;i++){a.step(.017);b.step(.017);const v=a.sample(2,3);assert.deepEqual(v,b.sample(2,3));assert.ok(v.length()<1.96);assert.ok(v.distanceTo(a.sample(2.001,3))<.01);assert.ok(v.distanceTo(previous)<.2);changes+=v.distanceTo(previous);previous=v;}
 assert.ok(changes>1);a.turbulence=0;const steady=a.sample(2,3);a.step(40);assert.deepEqual(a.sample(-20,10),steady);a.turbulence=1;a.strength=0;assert.equal(a.sample().lengthSq(),0);
});
test('stronger wind produces more, longer and thicker trails with distinct generated paths',()=>{
 const low=new WindTrails(new THREE.Scene()),high=new WindTrails(new THREE.Scene()),wind=new WindField();wind.strength=.3;low.spawn(wind,new THREE.Vector3());wind.strength=1;high.spawn(wind,new THREE.Vector3());
 const a=low.slots[0].trail,b=high.slots[0].trail;assert.ok(b.width>a.width*2);assert.ok(b.span*b.distance>a.span*a.distance);assert.ok(trailRate(1)>trailRate(.3)*4);assert.equal(trailRate(0),0);
 advance(dt=>high.update(dt,wind),30);assert.ok(high.spawned>60);assert.ok(high.read().active<=10);const live=high.slots.filter(s=>s.trail);assert.equal(new Set(live.map(s=>s.trail.phase)).size,live.length);assert.ok(live.some(s=>s.trail.loop));
 for(const s of live){assert.ok([...s.mesh.geometry.attributes.position.array].every(Number.isFinite));assert.ok([...s.mesh.geometry.attributes.normal.array].every(Number.isFinite));assert.ok(s.mesh.material.opacity>0&&s.mesh.material.opacity<=.8);}
 wind.strength=0;advance(dt=>high.update(dt,wind),1);assert.equal(high.read().active,0);high.dispose();low.dispose();
});
test('wind trail timing does not depend on frame rate, and calm default wind creates none',()=>{
 const a=new WindTrails(new THREE.Scene()),b=new WindTrails(new THREE.Scene()),wind=new WindField();advance(dt=>a.update(dt,wind),10);assert.equal(a.spawned,0);wind.strength=.8;advance(dt=>a.update(dt,wind),12,30);advance(dt=>b.update(dt,wind),12,120);assert.equal(a.spawned,b.spawned);assert.equal(a.read().active,b.read().active);
 a.reset();assert.deepEqual(a.read(),{active:0,spawned:0,loops:0});a.dispose();b.dispose();
});
test('generated loops curl back against the wind and return to their original altitude',()=>{
 const trails=new WindTrails(new THREE.Scene()),wind=new WindField();wind.strength=1;trails.spawn(wind,new THREE.Vector3());const t=trails.slots[0].trail;t.loop=true;t.radius=1.5;t.sway=0;t.roll=0;let previous=trailPoint(t,t.loopStart),reversed=false,highest=0;
 for(let i=1;i<=100;i++){const p=trailPoint(t,t.loopStart+t.loopSpan*i/100);if(p.clone().sub(previous).dot(t.forward)<0)reversed=true;highest=Math.max(highest,p.y);previous=p;}
 assert.ok(reversed);assert.ok(highest-t.height>2.9);assert.ok(Math.abs(previous.y-t.height)<1e-6);trails.dispose();
});
