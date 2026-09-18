import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {BirdseedField,feedBird} from '../src/birdseed.js';
import {BirdColony,seededRandom} from '../src/birds.js';
import {birdMesh,setBirdFatness} from '../src/nature-shapes.js';
import {Ecology} from '../src/ecology.js';
import {PendulumScene} from '../src/pendulums.js';
import {CollisionScene} from '../src/collision.js';
import {WindField} from '../src/wind.js';
await R.init();
const advance=(fn,seconds)=>{for(let i=0;i<seconds*60;i++)fn(1/60);};
test('each seed is reserved and consumed only once, with a conserved ledger and bounded live population',()=>{
 const f=new BirdseedField(seededRandom(4));f.scatter(new THREE.Vector3(),()=>true,30);const a=f.claim(new THREE.Vector3(),1),b=f.claim(new THREE.Vector3(),2);assert.notEqual(a.id,b.id);assert.equal(f.consume(a.id,2),false);assert.equal(f.consume(a.id,1),true);assert.equal(f.consume(a.id,1),false);f.release(2);assert.equal(b.owner,null);assert.equal(f.remaining,29);assert.equal(f.eaten,1);assert.equal(f.read().seeds.filter(s=>s.eatenBy!==null).length,1);
 f.scatter(new THREE.Vector3(),()=>true,999);assert.equal(f.remaining,512);assert.equal(f.sequence,f.remaining+f.eaten);f.reset();assert.equal(f.sequence,0);assert.equal(f.seeds.size,0);
});
test('feeding walks to actual seeds, fattens the bird, and stops exactly at its capacity',()=>{
 const f=new BirdseedField(seededRandom(2));f.scatter(new THREE.Vector3(),()=>true,20);const b={id:1,state:'feeding',position:new THREE.Vector3(1,.08,0),fullness:0,capacity:7,fatness:0};advance(dt=>feedBird(b,f.sites()[0],dt),20);
 assert.equal(b.fullness,7);assert.equal(b.state,'sated');assert.equal(b.fatness,1);assert.equal(f.eaten,7);assert.equal(f.remaining,13);assert.ok(f.available().every(s=>s.owner===null));
});
test('birds find food without leaves, have varied appetites and never eat past their own limit',()=>{
 const f=new BirdseedField(seededRandom(52)),c=new BirdColony(seededRandom(5)),capacities=new Map();f.scatter(new THREE.Vector3(),()=>true,70);f.scatter(new THREE.Vector3(1.8,0,0),()=>true,50);
 advance(dt=>{c.step(dt,f.sites());for(const b of c.birds){capacities.set(b.id,b.capacity);assert.ok(b.fullness<=b.capacity);}},100);
 assert.ok(f.eaten>30,`eaten ${f.eaten}`);assert.ok(new Set(capacities.values()).size>1);assert.ok([...capacities.values()].every(n=>n>=6&&n<=15));
 const eaten=new Map();for(const s of f.seeds.values())if(s.eatenBy!==null)eaten.set(s.eatenBy,(eaten.get(s.eatenBy)??0)+1);for(const [id,n]of eaten)assert.ok(n<=capacities.get(id));assert.equal(f.sequence,f.remaining+f.eaten);
});
test('fullness broadens the belly while preserving head geometry and the low polygon count',()=>{
 const v=birdMesh(),a=v.torso.geometry.attributes.position,rest=[...a.array],count=a.count;setBirdFatness(v,1);assert.equal(a.count,count);assert.ok([...a.array].every(Number.isFinite));let widened=false;
 for(let i=0;i<count;i++){if(Math.abs(rest[i*3]-.005)>=.095){assert.equal(a.getY(i),rest[i*3+1]);assert.equal(a.getZ(i),rest[i*3+2]);}if(Math.abs(a.getZ(i))>Math.abs(rest[i*3+2])*1.2)widened=true;}assert.ok(widened);setBirdFatness(v,0);assert.deepEqual([...a.array],rest);
});
test('birdseed mode suppresses both world and screen cursor fear; Move restores it',()=>{
 const p=new PendulumScene(R),e=new Ecology(new THREE.Scene(),p,new CollisionScene(R),new WindField(),R);e.feedingMode=true;for(let i=0;i<8;i++)e.scatterFood(new THREE.Vector3());e.setPointer(new THREE.Vector3(),{x:50,y:50});
 const camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,100);camera.position.set(0,10,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();advance(dt=>e.update(dt,camera,100,100),12);
 assert.ok(e.food.eaten>0);const birds=e.colony.birds.filter(b=>b.habitat==='seed'&&b.state!=='departing');assert.ok(birds.length>0);e.feedingMode=false;e.update(1/60,camera,100,100);assert.ok(birds.every(b=>b.state==='departing'));e.reset();assert.equal(e.food.remaining,0);p.dispose();
});
