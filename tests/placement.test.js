import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {CollisionScene} from '../src/collision.js';
import {StackScene} from '../src/stacking.js';
import {makeForm} from '../src/shapes.js';
import {placementAt} from '../src/dragging.js';
import {HoleLayout} from '../src/terrain.js';
await R.init();
const form=type=>{const f=makeForm(type,R);return {...f,type,mesh:new THREE.Mesh(f.geometry)};};
test('toolbar placement probes choose tables and reject occupied destinations without changing the scene',()=>{
 const collision=new CollisionScene(R),stacks=new StackScene(collision),table=form('table-square-full'),pot=form('plant-snake-small'),block=form('box');
 table.mesh.position.set(-6,table.height/2,0);block.mesh.position.set(-3,block.height/2,0);collision.objects.push(table,block);
 const position=table.mesh.position.clone(),probe=placementAt(stacks,pot,-6,0);
 assert.equal(probe.support,table);assert.ok(probe.position.y>table.height);
 assert.equal(placementAt(stacks,form('box'),-3,0),null);
 assert.equal(collision.objects.length,2);assert.deepEqual(table.mesh.position,position);assert.equal(pot.support,undefined);
});
test('toolbar placement reaches pool bottoms and clear ground directly',()=>{
 const collision=new CollisionScene(R),stacks=new StackScene(collision),pot=form('plant-snake-small');
 collision.setTerrain(new HoleLayout([{id:1,x:0,z:0,size:2}]));
 const ground=placementAt(stacks,pot,4,0),pool=placementAt(stacks,pot,0,0);
 assert.ok(ground&&pool);assert.ok(Math.abs(ground.position.y-pool.position.y-.71)<.002);assert.equal(pool.support,null);
});
