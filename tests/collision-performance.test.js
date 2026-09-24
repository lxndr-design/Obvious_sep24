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
