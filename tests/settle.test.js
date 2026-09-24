import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {CollisionScene} from '../src/collision.js';
import {makeForm} from '../src/shapes.js';
import {HoleLayout} from '../src/terrain.js';
import {SettleSolver,releaseVelocity,trackSample,MAX_HORIZONTAL,MAX_DROP,MAX_HOP} from '../src/settle.js';
await R.init();

const form=type=>{const f=makeForm(type,R);return {...f,type,mesh:new THREE.Mesh(f.geometry)};};
// Rests a form on its support at (x,z) and registers it, like a finished drag.
const rest=(collision,object,x,z)=>{object.mesh.position.set(x,collision.supportY(object,x,z),z);collision.objects.push(object);return object;};
const snapped=v=>Math.abs(v/.5-Math.round(v/.5))<1e-9;

test('release velocity is the span displacement, clamped and staleness-guarded',()=>{
 const t=1000,sample=(x,y,z,ms)=>({x,y,z,t:ms});
 assert.equal(releaseVelocity(null,t),null);
 assert.equal(releaseVelocity([sample(0,0,0,t)],t),null);
 // Zero motion and upward-only drags carry nothing to settle.
 assert.equal(releaseVelocity([sample(0,0,0,t),sample(0,0,0,t+100)],t+100),null);
 assert.equal(releaseVelocity([sample(0,0,0,t),sample(0,.3,0,t+100)],t+100),null);
 // A pause before release kills momentum: the last sample is stale.
 assert.equal(releaseVelocity([sample(0,0,0,t),sample(.3,0,0,t+100)],t+400),null);
 // Future timestamps are rejected rather than trusted.
 assert.equal(releaseVelocity([sample(0,0,0,t),sample(.3,0,0,t+100)],t+50),null);
 // Span displacement, unclamped below the caps.
 const gentle=releaseVelocity([sample(0,0,0,t),sample(.3,0,0,t+100)],t+100);
 assert.ok(gentle);assert.ok(Math.abs(gentle.x-3)<1e-9);assert.equal(gentle.y,0);assert.equal(gentle.z,0);
 // Horizontal clamps to the fling cap, downward to the drop cap.
 const fling=releaseVelocity([sample(0,0,0,t),sample(1.2,0,0,t+100)],t+100);
 assert.ok(Math.abs(fling.x-MAX_HORIZONTAL)<1e-9);
 const drop=releaseVelocity([sample(0,0,0,t),sample(0,-1.2,0,t+100)],t+100);
 assert.ok(Math.abs(drop.y+MAX_DROP)<1e-9);
});

test('trackSample keeps the last few drag positions with their times',()=>{
 const samples=[],o=form('box');o.mesh.position.set(1,2,3);
 for(let i=0;i<6;i++){o.mesh.position.x=i;trackSample(samples,o,i);}
 assert.equal(samples.length,4);
 assert.deepEqual(samples.map(s=>s.x),[2,3,4,5]);
 assert.deepEqual(samples[0],{x:2,y:2,z:3,t:2});
});

test('a fling over open floor settles ahead along the momentum, on the grid, on its support',()=>{
 const collision=new CollisionScene(R);collision.setTerrain(new HoleLayout([]));
 const solver=new SettleSolver(collision),box=rest(collision,form('box'),0,0),start=box.mesh.position.clone();
 const plan=solver.planRelease(box,new THREE.Vector3(3,0,0));
 assert.ok(plan,'a 3 m/s release should settle');
 assert.ok(plan.to.x>0.5,'landing travels with the momentum');
 assert.ok(snapped(plan.to.x)&&snapped(plan.to.z),'landing cell is grid-snapped');
 assert.ok(Math.abs(plan.to.y-collision.supportY(box,plan.to.x,plan.to.z))<1e-9,'landing rests on supportY');
 assert.ok(collision.canPlace(box,plan.to),'landing passes canPlace — no interpenetration');
 // The solver is pure: the form itself has not moved.
 assert.ok(box.mesh.position.equals(start),'planRelease never mutates the object');
});

test('momentum scales the settle: a gentle release barely moves, a fling sails',()=>{
 const collision=new CollisionScene(R);collision.setTerrain(new HoleLayout([]));
 const solver=new SettleSolver(collision);
 const short=rest(collision,form('box'),0,0),far=rest(collision,form('box'),8,0);
 const gentle=solver.planRelease(short,new THREE.Vector3(.3,0,0));
 const fling=solver.planRelease(far,new THREE.Vector3(3,0,0));
 const travel=plan=>plan?plan.to.x:0;
 assert.ok(travel(fling)-8>travel(gentle),'faster release lands further');
 assert.ok(!gentle||Math.abs(gentle.to.x)<.001,'a gentle release is a no-op or null');
 assert.ok(!fling||travel(fling)-8<=3*2*MAX_HOP/9.81+.5,'fling travel stays bounded');
});

test('a form flung over a pool settles to the basin bottom',()=>{
 const collision=new CollisionScene(R);collision.setTerrain(new HoleLayout([{id:1,x:0,z:0,size:5}]));
 const solver=new SettleSolver(collision),box=rest(collision,form('box'),2.7,0);
 const plan=solver.planRelease(box,new THREE.Vector3(-4,0,0));
 assert.ok(plan,'a rim-clearing fling should settle into the pool');
 assert.ok(plan.to.y<0,'lands below the rim, inside the basin');
 assert.ok(Math.abs(plan.to.y-collision.supportY(box,plan.to.x,plan.to.z))<1e-9,'rests at basin-bottom support');
 assert.ok(snapped(plan.to.x)&&snapped(plan.to.z));
 assert.ok(collision.canPlace(box,plan.to));
});

test('a settle rejected by canPlace aborts, leaving the last valid drag position untouched',()=>{
 const collision=new CollisionScene(R);collision.setTerrain(new HoleLayout([]));
 const solver=new SettleSolver(collision),box=rest(collision,form('box'),0,0);
 // A blocker one cell past the fling range: the arc smacks its face and the
 // snapped landing cell interpenetrates it, so canPlace must reject.
 rest(collision,form('box'),1.75,0);
 const start=box.mesh.position.clone();
 const plan=solver.planRelease(box,new THREE.Vector3(3,0,0));
 assert.equal(plan,null,'blocked landing must abort');
 assert.ok(box.mesh.position.equals(start),'fallback is byte-identical: the form stays');
});

test('locked objects are never settle-manipulated',()=>{
 const collision=new CollisionScene(R);collision.setTerrain(new HoleLayout([]));
 const solver=new SettleSolver(collision),box=rest(collision,form('box'),0,0);
 box.properties={locked:true};
 assert.equal(solver.planRelease(box,new THREE.Vector3(3,0,0)),null);
 // An unlocked object with properties present still settles — the guard is the lock.
 const free=rest(collision,form('box'),8,0);free.properties={locked:false};
 assert.ok(solver.planRelease(free,new THREE.Vector3(-3,0,0)));
});

test('hanging forms are excluded from the settle',()=>{
 const collision=new CollisionScene(R);collision.setTerrain(new HoleLayout([]));
 const solver=new SettleSolver(collision),lantern=rest(collision,form('box'),0,0);
 lantern.hanging=true;
 assert.equal(solver.planRelease(lantern,new THREE.Vector3(3,-2,0)),null);
});

test('an upward release with no horizontal motion never settles',()=>{
 const collision=new CollisionScene(R);collision.setTerrain(new HoleLayout([]));
 const solver=new SettleSolver(collision),box=rest(collision,form('box'),0,0);
 assert.equal(solver.planRelease(box,new THREE.Vector3(0,3,0)),null);
 assert.equal(solver.planRelease(box,null),null);
});

test('the settle is deterministic under identical inputs',()=>{
 const build=()=>{const collision=new CollisionScene(R);collision.setTerrain(new HoleLayout([]));return {collision,box:rest(collision,form('box'),0,0),solver:new SettleSolver(collision)};};
 const a=build(),b=build(),velocity=new THREE.Vector3(3,0,2);
 const first=a.solver.planRelease(a.box,velocity),second=b.solver.planRelease(b.box,velocity);
 assert.ok(first&&second);
 assert.deepEqual(second.to.toArray(),first.to.toArray());
 assert.ok(second.to.distanceTo(first.to)<1e-12);
});
