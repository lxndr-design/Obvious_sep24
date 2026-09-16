import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {BATH} from '../src/furnishings.js';
import {BirdColony,seededRandom} from '../src/birds.js';
import {BathWater} from '../src/birdbath.js';
import {Ecology} from '../src/ecology.js';
import {WindField} from '../src/wind.js';
import {PendulumScene} from '../src/pendulums.js';
import {CollisionScene} from '../src/collision.js';
await R.init();
const advance=(fn,seconds)=>{for(let i=0;i<seconds*60;i++)fn(1/60);};
const site=()=>({id:'bath-42',kind:'bath',position:new THREE.Vector3(-8,0,2),rimY:BATH.height,waterY:BATH.waterY,rimRadius:BATH.rimRadius});
function form(type){const f=makeForm(type,R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(-8,f.height/2,2);return {...f,mesh,type,id:42,hanging:false};}
test('birds use an elevated bath without leaves, take turns bathing, flap and splash, and fear the ground cursor',()=>{
 const colony=new BirdColony(seededRandom(81)),bath=site(),states=new Set();let splashes=0,flaps=0,peakBathers=0,arrivalFade=false;
 colony.onSplash=()=>splashes++;
 advance(dt=>{colony.step(dt,[bath]);for(const b of colony.birds){states.add(b.state);if(b.state==='arriving'&&b.opacity>0&&b.opacity<1)arrivalFade=true;if(b.state==='bathing'&&Math.abs(b.wing)>.5)flaps++;if(['perching','bathing'].includes(b.state))assert.ok(b.position.y>BATH.waterY);}
 peakBathers=Math.max(peakBathers,colony.birds.filter(b=>b.state==='bathing').length);},36);
 for(const state of ['arriving','perching','hopping','bathing'])assert.ok(states.has(state),state);
 assert.ok(arrivalFade&&flaps>20&&splashes>20);assert.equal(peakBathers,1);assert.ok(colony.birds.length>=2&&colony.birds.length<=3);
 colony.disturb(bath.position,[bath]);assert.ok(colony.birds.every(b=>b.state==='departing'));
 advance(dt=>colony.step(dt,[bath],bath.position),10);assert.equal(colony.birds.length,0);
});
test('moving, removing or obstructing the bath makes its visitors depart',()=>{
 for(const action of ['move','remove','block']){
  const c=new BirdColony(),bath=site();advance(dt=>c.step(dt,[bath]),16);assert.ok(c.birds.length);
  if(action==='move')bath.position.x+=1;
  c.step(1/60,action==='remove'?[]:[bath],null,()=>action!=='block');
  assert.ok(c.birds.every(b=>b.state==='departing'),action);
 }
});
test('the bath basin is hollow and bench slats and supports preserve open spaces',()=>{
 const collision=new CollisionScene(R),geometry=new THREE.SphereGeometry(.02);geometry.computeBoundingBox();const probe={geometry,parts:[{shape:new R.Ball(.02),offset:new THREE.Vector3()}],mesh:new THREE.Mesh()};
 const bath=form('birdbath');collision.objects=[bath,probe];
 assert.equal(collision.canPlace(probe,new THREE.Vector3(-8,1.43,2)),true,'inside bowl');
 assert.equal(collision.canPlace(probe,new THREE.Vector3(-8,1.25,2)),false,'basin floor');
 assert.equal(collision.canPlace(probe,new THREE.Vector3(-8+.7,1.47,2)),false,'basin wall');
 const bench=form('bench');collision.objects=[bench,probe];
 assert.equal(collision.canPlace(probe,new THREE.Vector3(-8,.48,2)),true,'under seat');
 assert.equal(collision.canPlace(probe,new THREE.Vector3(-8,.72,2-.265)),false,'seat slat');
 assert.equal(collision.canPlace(probe,new THREE.Vector3(-8+.92,.40,2+.24)),false,'leg');
 assert.equal(collision.canPlace(probe,new THREE.Vector3(-8,1.18,2-.32)),false,'back slat');
});
test('bathing displaces circular water, spray falls back, and calm water settles without leaking beyond the basin',()=>{
 const bath=form('birdbath'),view=new BathWater(bath),wind=new THREE.Vector3();view.splash(new THREE.Vector3(-8,BATH.waterY,2));let peak=0;
 advance(dt=>{view.update(dt,wind);peak=Math.max(peak,...view.field.height.map(Math.abs));},1);
 assert.ok(peak>.004,`ripple height ${peak}`);assert.ok(view.drops.every(d=>!d),'spray expires');
 assert.ok(view.geometry.attributes.position.array.every(Number.isFinite));
 advance(dt=>view.update(dt,wind),14);
 assert.ok(Math.max(...view.field.height.map(Math.abs))<.0001);
 for(let i=0;i<view.field.mask.length;i++)if(!view.field.mask[i])assert.equal(view.field.height[i],0);
 assert.ok(Math.abs(view.field.height.reduce((sum,h)=>sum+h,0))<1e-6);view.dispose();assert.equal(bath.mesh.children.length,0);
});
test('ecology discovers placed baths, drives real splash geometry and retires moved, hung or deleted habitats',()=>{
 const scene=new THREE.Scene(),p=new PendulumScene(R),collision=new CollisionScene(R),wind=new WindField();wind.strength=0;
 const bath=form('birdbath');scene.add(bath.mesh);collision.objects=[bath];p.add(bath);
 const e=new Ecology(scene,p,collision,wind,R);p.beforeStep=dt=>e.beforeStep(dt);
 advance(dt=>{p.step(dt);e.update(dt,null,0,0);},25);
 const view=e.bathViews.get(bath);assert.ok(view.splashCount>0);assert.ok(e.colony.birds.some(b=>b.pileId==='bath-42'));
 bath.mesh.position.x+=1;p.syncPose(bath);e.update(1/60,null,0,0);
 assert.ok(e.colony.birds.filter(b=>b.pileId==='bath-42').every(b=>b.state==='departing'));
 bath.hanging=true;e.update(1/60,null,0,0);assert.equal(view.group.visible,false);assert.ok(e.habitats.every(h=>h.id!=='bath-42'));
 collision.objects=[];e.update(1/60,null,0,0);assert.equal(e.bathViews.size,0);assert.equal(bath.mesh.children.length,0);
 e.reset();p.dispose();
});
