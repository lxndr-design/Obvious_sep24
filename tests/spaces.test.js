import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeSizedForm,SIZED_FORMS} from '../src/object-size.js';
import {objectRecord,validateSpace,readSpaces,saveSpace} from '../src/spaces.js';
import {CollisionScene} from '../src/collision.js';
await R.init();
test('1, 2 and 3 tile forms resize both the visible geometry and their collision shapes',()=>{
 const c=new CollisionScene(R);
 for(const type of SIZED_FORMS)for(const n of [1,2,3]){const f=makeSizedForm(type,R,n),o={...f,type,mesh:new THREE.Mesh(f.geometry)};o.mesh.position.set(-10,n*2,-10);const size=f.geometry.boundingBox.getSize(new THREE.Vector3());assert.ok(Math.abs(Math.max(size.x,size.y,size.z)-(type==='hedge'?.72*n:n))<1e-5);assert.ok(c.canPlace(o,o.mesh.position));const bounds=c.partsAt(o).bounds;assert.ok(Math.abs(Math.max(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y,bounds.max.z-bounds.min.z)-(type==='hedge'?.72*n:n))<.01,type);}
});
test('space records preserve sizes, messages, cable anchors and independent support links',()=>{
 const f=makeSizedForm('box',R,2),o={...f,id:4,type:'box',mesh:new THREE.Mesh(f.geometry),properties:{locked:false,tone:.3,messages:[{text:'hello',choices:[]}]},hanging:true,cableLength:3,anchor:new THREE.Vector3(0,8.5,0)};
 const record=objectRecord(o);o.properties.messages[0].text='changed';assert.equal(record.properties.messages[0].text,'hello');assert.equal(record.gridSize,2);assert.deepEqual(record.anchor,[0,8.5,0]);
 const space={version:1,objects:[record],camera:{position:[1,2,3],target:[0,0,0],zoom:1},environment:{sun:'80'}};assert.deepEqual(validateSpace(JSON.parse(JSON.stringify(space)),new Set(['box'])),space);
});
test('malformed spaces and support cycles are rejected before replacing the scene',()=>{
 const shape={id:1,type:'box',gridSize:1,position:[0,1,0],rotation:[0,0,0,1],support:null},base={version:1,objects:[shape],camera:{position:[1,2,3],target:[0,0,0],zoom:1}};
 for(const change of [{position:[NaN,0,0]},{type:'unknown'},{gridSize:99},{support:1},{support:2},{properties:{messages:{}}},{properties:{tone:NaN}},{properties:{messages:[{text:'bad',choices:[{target:'not a number'}]}]}}])assert.throws(()=>validateSpace({...base,objects:[{...shape,...change}]},new Set(['box'])));
});
test('named saves survive storage round trips and retain independent snapshots',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};saveSpace('Quiet park',{version:1,objects:[]},storage);saveSpace('Another corner',{version:1,objects:[]},storage);assert.deepEqual(readSpaces(storage).map(s=>s.name),['Another corner','Quiet park']);
});
