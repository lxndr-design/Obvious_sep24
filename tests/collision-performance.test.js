import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {CollisionScene} from '../src/collision.js';
import {makeForm} from '../src/shapes.js';
await R.init();
function form(type,x,z){const f=makeForm(type,R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(x,f.height/2,z);return {...f,mesh,type};}
test('birdbath drag only queries nearby pieces and repeated positions do no collision work',()=>{
 const c=new CollisionScene(R),bath=form('birdbath',8,0);c.objects=[bath,...Array.from({length:12},(_,i)=>form('birdbath',-8-i*3,0))];let queries=0;
 for(const {shape} of bath.parts)for(const name of ['contactShape','castShape']){const fn=shape[name];shape[name]=function(...args){queries++;return fn.apply(this,args);};}
 assert.ok(c.move(bath,new THREE.Vector3(9,bath.height/2,0)));
 assert.ok(queries<20,`clear-ground move made ${queries} narrowphase queries`);
 queries=0;assert.ok(c.move(bath,bath.mesh.position.clone()));assert.equal(queries,0);
});
test('swept broadphase catches a birdbath between clear endpoints and updates cached poses',()=>{
 const c=new CollisionScene(R),bath=form('birdbath',-8,0),ball=form('sphere',-11,0);c.objects=[bath,ball];
 const target=new THREE.Vector3(-5,ball.height/2,0);assert.ok(c.canPlace(ball,target));assert.ok(c.castFraction(ball,ball.mesh.position,target)<1);
 bath.mesh.position.z=4;assert.equal(c.castFraction(ball,ball.mesh.position,target),1);
 bath.mesh.position.z=0;bath.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/4);assert.ok(c.castFraction(ball,ball.mesh.position,target)<1);
});

// The pre-hash whole-scene scan, kept as the live equivalence reference: every
// hash-backed result below is asserted against this class on identical scenes.
class BruteScene extends CollisionScene{
 neighbors(object,bounds,ignore){const found=[];for(const other of this.objects){if(other===object||ignore?.has(other))continue;
  if(!this.bounds(other,other.mesh.position).expandByScalar(.001).intersectsBox(bounds))continue;
  const prepared=this.partsAt(other);for(const part of prepared.parts)if(part.bounds.intersectsBox(bounds))found.push(part);
 }return found;}
}
function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const TYPES=['box','sphere','cylinder','arch','pebble','plant-rubber-medium','table-round-half','bench','birdbath'];
function layout(seed,count){const random=mulberry32(seed),spots=[];for(let i=0;i<count;i++)spots.push({type:TYPES[Math.floor(random()*TYPES.length)],x:Math.round((random()*22-11)*2)/2,z:Math.round((random()*22-11)*2)/2});return spots;}
function build(scene,spots){for(const spot of spots){const f=makeForm(spot.type,R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(spot.x,f.height/2,spot.z);scene.objects.push({...f,mesh,type:spot.type});}}

test('hash-backed queries match the brute-force scan exactly across a randomized layout and op sequence',()=>{
 const spots=layout(20260924,24),hashScene=new CollisionScene(R),brute=new BruteScene(R);
 build(hashScene,spots);build(brute,spots);
 const random=mulberry32(424242),probes=hashScene.objects.map((o,i)=>({o,b:brute.objects[i]}));
 for(let step=0;step<48;step++){
  const probe=probes[Math.floor(random()*probes.length)],kind=random();
  if(kind<.45){
   const to=new THREE.Vector3(Math.round((random()*22-11)*2)/2,0,Math.round((random()*22-11)*2)/2);
   assert.equal(hashScene.move(probe.o,to.clone()),brute.move(probe.b,to.clone()),`move result diverged at step ${step}`);
   assert.deepEqual(probe.o.mesh.position.toArray(),probe.b.mesh.position.toArray(),`moved position diverged at step ${step}`);
  }else if(kind<.6){
   assert.equal(hashScene.rotate(probe.o),brute.rotate(probe.b),`rotate result diverged at step ${step}`);
   assert.deepEqual(probe.o.mesh.quaternion.toArray(),probe.b.mesh.quaternion.toArray(),`rotation diverged at step ${step}`);
  }else if(kind<.8){
   const position=new THREE.Vector3(random()*22-11,probe.o.height/2,random()*22-11);
   assert.equal(hashScene.canPlace(probe.o,position.clone()),brute.canPlace(probe.b,position.clone()),`canPlace diverged at step ${step}`);
  }else if(kind<.9){
   const from=new THREE.Vector3(random()*22-11,probe.o.height/2,random()*22-11),to=new THREE.Vector3(random()*22-11,probe.o.height/2,random()*22-11);
   assert.equal(hashScene.castFraction(probe.o,from,to),brute.castFraction(probe.b,from,to),`castFraction diverged at step ${step}`);
  }else{
   const x1=random()*22-11,z1=random()*22-11,x2=x1+1+random()*4,z2=z1+1+random()*4,bounds=new THREE.Box3(new THREE.Vector3(x1,-2,z1),new THREE.Vector3(x2,2,z2));
   // Scenes own independent shape instances, so compare scene-independent
   // fingerprints: owning object index + part index, sorted for order.
   const fingerprint=scene=>{const map=new Map();scene.objects.forEach((o,oi)=>o.parts.forEach((p,pi)=>map.set(p.shape,`${oi}:${pi}`)));return list=>list.map(p=>map.get(p.shape)).sort().join(',');};
   const hashFinger=fingerprint(hashScene),bruteFinger=fingerprint(brute);
   assert.equal(hashFinger(hashScene.neighbors(null,bounds,null)),bruteFinger(brute.neighbors(null,bounds,null)),`neighbor sets diverged at step ${step}`);
  }
  const x=Math.round((random()*20-10)*2)/2,z=Math.round((random()*20-10)*2)/2;
  assert.equal(hashScene.supportY(probe.o,x,z),brute.supportY(probe.b,x,z),`supportY diverged at step ${step}`);
 }
});

test('the index tracks a shared array mutated in place: push, splice and same-length replacement',()=>{
 const spots=layout(777,6),hashScene=new CollisionScene(R),brute=new BruteScene(R);
 build(hashScene,spots.slice(0,3));build(brute,spots.slice(0,3));
 const add=(scene,spot)=>{const f=makeForm(spot.type,R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(spot.x,f.height/2,spot.z);const o={...f,mesh,type:spot.type};scene.objects.push(o);return o;}; // in-place push, like main.js aliasing state.objects
 const addedA=add(hashScene,spots[3]),addedB=add(brute,spots[3]);
 const target=new THREE.Vector3(spots[3].x,addedA.height/2,spots[3].z+3);
 assert.equal(hashScene.canPlace(addedA,target),brute.canPlace(addedB,target));
 hashScene.objects.splice(hashScene.objects.indexOf(addedA),1);brute.objects.splice(brute.objects.indexOf(addedB),1);
 assert.equal(hashScene.canPlace(addedA,target),brute.canPlace(addedB,target));
 const swapA=add(hashScene,spots[4]),swapB=add(brute,spots[4]);
 hashScene.objects[0]=swapA;brute.objects[0]=swapB; // same-length replacement
 assert.equal(hashScene.canPlace(swapA,target),brute.canPlace(swapB,target));
});

test('a 40-form scene keeps a clear-corridor drag at zero far narrowphase work',()=>{
 const c=new CollisionScene(R),bath=form('birdbath',8,0),others=Array.from({length:39},(_,i)=>form('birdbath',-16+(i%13)*2.5,i<20?-6:6));
 c.objects=[bath,...others];
 let queries=0;
 for(const {shape} of bath.parts)for(const name of ['contactShape','castShape']){const fn=shape[name];shape[name]=function(...args){queries++;return fn.apply(this,args);};}
 const start=performance.now();
 assert.ok(c.move(bath,new THREE.Vector3(9,bath.height/2,0)));
 const elapsed=performance.now()-start;
 // Terrain casts on the moving form's own shapes are legitimate narrowphase work;
 // the guard trips only if far FORMS leak into the query (whole-scene degradation).
 assert.ok(queries<20,`far forms reached the narrowphase: ${queries} queries`);
 assert.ok(elapsed<2000,`single clear-ground move took ${elapsed}ms`);
 let placements=0;const probeStart=performance.now();
 for(let i=0;i<500;i++)if(c.canPlace(bath,new THREE.Vector3(8.5+((i*37)%100)*.001,bath.height/2,0)))placements++;
 assert.equal(placements,500);
 assert.ok(performance.now()-probeStart<2000,`500 canPlace calls took too long`);
});
