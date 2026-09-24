import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {Ecology} from '../src/ecology.js';
import {PendulumScene} from '../src/pendulums.js';
import {CollisionScene} from '../src/collision.js';
import {HoleLayout} from '../src/terrain.js';
import {HoleTerrain} from '../src/hole-terrain.js';
import {WindField} from '../src/wind.js';
import {makeForm} from '../src/shapes.js';
await R.init();
test('live ecology renders a duck pair and couples bird contacts to bath water even without bathing spray',()=>{
 const scene=new THREE.Scene(),p=new PendulumScene(R),collision=new CollisionScene(R),wind=new WindField();wind.strength=0;
 const layout=new HoleLayout([{id:1,x:0,z:0,size:2}]),terrain=new HoleTerrain(scene,new THREE.MeshStandardMaterial());terrain.rebuild(layout);collision.setTerrain(layout);p.setTerrain(layout);
 const form=makeForm('birdbath',R),mesh=new THREE.Mesh(form.geometry);mesh.position.set(3,form.height/2,0);const bath={...form,mesh,type:'birdbath',id:9,hanging:false};collision.objects=[bath];p.add(bath);
 const ecology=new Ecology(scene,p,collision,wind,R);ecology.terrain=terrain;ecology.feedingMode=true;ecology.colony.limit=1;ecology.colony.onSplash=null;
 let bathPeak=0,poolPeak=0;
 for(let i=0;i<40*60;i++){p.step(1/60);ecology.update(1/60,null,0,0);terrain.step(1/60,wind);bathPeak=Math.max(bathPeak,...ecology.bathViews.get(bath).field.height.map(Math.abs));poolPeak=Math.max(poolPeak,...terrain.views[0].field.height.map(Math.abs));}
 assert.ok(ecology.ducks.ducks.length>=2);assert.equal(ecology.duckViews.size,ecology.ducks.ducks.length);assert.ok(bathPeak>.001,`bath contact amplitude ${bathPeak}`);assert.ok(poolPeak>.003);assert.ok(ecology.read().waterContacts.impulses>0);
 for(const d of ecology.ducks.ducks){const v=ecology.duckViews.get(d.id);assert.ok(v.group.position.distanceTo(d.position)<1e-8);assert.equal(v.feet[0].visible,!d.swimming&&!['arriving','departing'].includes(d.state));}
 ecology.reset();assert.equal(ecology.duckViews.size,0);assert.equal(ecology.waterContacts.contacts.size,0);p.dispose();
});

test('ordinary birds stay dry most of the time and make short flapping visits at a pool edge',()=>{
 const scene=new THREE.Scene(),p=new PendulumScene(R),collision=new CollisionScene(R),wind=new WindField();wind.strength=0;const layout=new HoleLayout([{id:1,x:0,z:0,size:2}]);collision.setTerrain(layout);p.setTerrain(layout);const terrain=new HoleTerrain(scene,new THREE.MeshStandardMaterial());terrain.rebuild(layout);
 const e=new Ecology(scene,p,collision,wind,R);e.terrain=terrain;e.piles=[];e.ducks.nextArrival=Infinity;e.colony.limit=1;let dry=0,wet=0,flaps=0;const states=new Set();
 for(let i=0;i<50*60;i++){p.step(1/60);e.update(1/60,null,0,0);terrain.step(1/60,wind);for(const b of e.colony.birds){states.add(b.state);if(b.state==='perching'){dry++;assert.equal(!!terrain.at(b.position.x,b.position.z),false);}if(b.state==='bathing'){wet++;assert.ok(terrain.at(b.position.x,b.position.z));if(b.wingState==='flapping')flaps++;}}}
 assert.ok(states.has('hopping'));assert.ok(wet>30&&flaps>20);assert.ok(dry>wet*3,`dry ${dry} wet ${wet}`);assert.ok(terrain.views[0].field.emission>0,'flapping throws physical spray');e.reset();p.dispose();
});
