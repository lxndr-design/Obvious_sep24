import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {SeedSlingshot,SlingGuide,launchVelocity,MAX_PULL} from '../src/slingshot.js';
import {Ecology} from '../src/ecology.js';
import {PendulumScene} from '../src/pendulums.js';
import {CollisionScene} from '../src/collision.js';
import {WindField} from '../src/wind.js';
import {birdMesh,BIRD_PALETTES} from '../src/nature-shapes.js';
await R.init();
function setup(){const p=new PendulumScene(R),wind=new WindField();wind.strength=0;const ecology=new Ecology(new THREE.Scene(),p,new CollisionScene(R),wind,R);p.beforeStep=dt=>ecology.beforeStep(dt);for(let i=0;i<120;i++)p.step(1/120);return {p,ecology,seed:ecology.loose.find(o=>o.type==='seed'),sling:new SeedSlingshot(R)};}
test('pullback launches in the opposite direction, scales with distance, and has a bounded maximum',()=>{
 assert.deepEqual(launchVelocity(new THREE.Vector3(.01,0,0)).toArray(),[0,0,0]);
 const a=launchVelocity(new THREE.Vector3(1,0,0)),b=launchVelocity(new THREE.Vector3(2,0,0));assert.ok(a.x<0&&a.y>0);assert.ok(b.length()>a.length());assert.equal(launchVelocity(new THREE.Vector3(100,0,0)).x,-4.5*MAX_PULL);
 const {p,seed,sling}=setup(),start={...seed.body.translation()};sling.begin(seed);sling.aim(new THREE.Vector3(start.x+1.2,start.y,start.z+.6));const guide=new SlingGuide(new THREE.Scene());guide.update(sling);assert.ok(guide.group.visible&&guide.arrow.visible);assert.ok(sling.release());guide.update(sling);assert.equal(guide.group.visible,false);
 for(let i=0;i<25;i++)p.step(1/120);const end=seed.body.translation();assert.ok(end.x<start.x-.5&&end.z<start.z-.2&&end.y>start.y+.1);assert.ok(seed.body.isDynamic());p.dispose();
});
test('cancel and a tap restore the seed without an accidental launch',()=>{
 const {p,seed,sling}=setup(),pos={...seed.body.translation()},vel={...seed.body.linvel()};sling.begin(seed);sling.aim(new THREE.Vector3(pos.x+2,pos.y,pos.z));for(let i=0;i<60;i++)p.step(1/120);assert.deepEqual({...seed.body.translation()},pos);sling.cancel();assert.deepEqual({...seed.body.translation()},pos);assert.deepEqual({...seed.body.linvel()},vel);assert.ok(seed.body.isDynamic());sling.begin(seed);assert.equal(sling.release(),false);assert.deepEqual({...seed.body.linvel()},vel);p.dispose();
});
test('birds use distinct body and wing palettes with small, fading eyes',()=>{
 assert.equal(new Set(BIRD_PALETTES.map(p=>p.body)).size,5);for(const palette of BIRD_PALETTES){const view=birdMesh(palette);assert.equal(view.materials[0].color.getHex(),palette.body);assert.equal(view.materials[1].color.getHex(),palette.wing);assert.ok(view.materials.every(m=>m.transparent&&m.opacity===0));let triangles=0;view.group.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});assert.ok(triangles<84);}
});
