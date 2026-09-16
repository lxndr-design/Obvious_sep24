import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {bladeGeometry,flowerHead,birdMesh,seedForm} from '../src/nature-shapes.js';
import {Ecology} from '../src/ecology.js';
import {PendulumScene} from '../src/pendulums.js';
import {CollisionScene} from '../src/collision.js';
import {WindField} from '../src/wind.js';
await R.init();
const triangles=g=>(g.index?.count??g.attributes.position.count)/3;
const totalTriangles=o=>{let count=0;o.traverse(part=>{if(part.isMesh)count+=triangles(part.geometry);});return count;};
test('nature silhouettes remain small and within their low-polygon budgets',()=>{
 const ribbon=bladeGeometry(4);assert.ok(triangles(ribbon)<=6);
 const material=new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.DoubleSide});
 for(const kind of ['daisy','dandelion']){const head=flowerHead(kind,material);assert.ok(totalTriangles(head)<=30);const size=new THREE.Box3().setFromObject(head).getSize(new THREE.Vector3());assert.ok(Math.max(size.x,size.z)<.18);}
 const bird=birdMesh();assert.ok(totalTriangles(bird.group)<60);assert.ok(new THREE.Box3().setFromObject(bird.group).getSize(new THREE.Vector3()).x<.37);assert.equal(bird.wings.length,2);for(const m of bird.materials)assert.equal(m.color.getHex(),0xffffff);
 const seed=seedForm(R);assert.ok(triangles(seed.geometry)<=80);seed.geometry.computeBoundingSphere();assert.ok(seed.geometry.boundingSphere.radius<.12);assert.equal(seed.parts.length,9);
});
test('small scattered leaves have clear gaps and all nature surfaces use pure white',()=>{
 const p=new PendulumScene(R),e=new Ecology(new THREE.Scene(),p,new CollisionScene(R),new WindField(),R);
 assert.equal(e.material.color.getHex(),0xffffff);
 const leaves=e.loose.filter(o=>o.type==='leaf');assert.equal(leaves.length,16);
 for(const leaf of leaves){leaf.geometry.computeBoundingBox();assert.ok(leaf.geometry.boundingBox.getSize(new THREE.Vector3()).x<.21);for(const other of leaves)if(other!==leaf)assert.ok(leaf.spawn.distanceTo(other.spawn)>.35,'leaves must not overlap or form stacks');}
 for(const item of e.strands){assert.ok(triangles(item.mesh.geometry)<=6);assert.equal(item.strand.nodes.length,4);}
 p.dispose();
});
