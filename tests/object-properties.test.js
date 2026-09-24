import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {properties,applyMaterialProperties,canManipulate,MessagePlayer} from '../src/object-properties.js';
import {HoleLayout} from '../src/terrain.js';
import {HoleTerrain} from '../src/hole-terrain.js';

test('messages cycle in order, random avoids repeats, and branching waits for a valid choice',()=>{
 const o={properties:{...properties(),messages:[{text:'One'},{text:'Two'},{text:'Three'}]}},p=new MessagePlayer(()=>.99);p.enter(o);
 p.step(2.9);assert.equal(p.current().text,'One');p.step(.1);assert.equal(p.current().text,'Two');p.step(3);assert.equal(p.current().text,'Three');p.step(3);assert.equal(p.current().text,'One');
 o.properties.messageMode='random';p.step(3);assert.equal(p.current().text,'Three');p.step(3);assert.equal(p.current().text,'Two');
 o.properties.messageMode='branching';p.step(30);assert.equal(p.current().text,'Two');assert.equal(p.choose(7),false);assert.equal(p.choose(0),true);assert.equal(p.current().text,'One');p.enter(null);assert.equal(p.current(),null);
});
test('material settings are independent, change sheen and tone, and add and remove a real light',()=>{
 const make=()=>({properties:properties(),mesh:new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial())}),a=make(),b=make();a.properties.tone=.65;a.properties.reflectance=.9;a.properties.emittance=.4;applyMaterialProperties(a);
 assert.ok(Math.abs(a.mesh.material.color.r-.35)<1e-8);assert.ok(a.mesh.material.roughness<.15);assert.equal(b.mesh.material.color.r,1);assert.ok(a.emissionLight.isPointLight);assert.equal(a.emissionLight.parent,a.mesh);assert.ok(a.emissionLight.intensity>0);assert.equal(a.mesh.material.emissiveIntensity,.8);
 const light=a.emissionLight;a.properties.emittance=0;applyMaterialProperties(a);assert.equal(a.emissionLight,null);assert.equal(light.parent,null);
});
test('a locked member prevents moving its base stack but does not lock an unrelated object',()=>{
 const base={properties:properties()},top={properties:properties()},other={properties:properties()};top.properties.locked=true;assert.equal(canManipulate(base,[base,top]),false);assert.equal(canManipulate(top),false);assert.equal(canManipulate(other),true);top.properties.locked=false;assert.equal(canManipulate(base,[base,top]),true);
});
test('joined pools retain independent lining materials',()=>{
 const layout=new HoleLayout();layout.set([{id:1,x:0,z:0,size:2},{id:2,x:2,z:0,size:2}]);
 const terrain=new HoleTerrain(new THREE.Scene(),new THREE.MeshStandardMaterial()),a=new THREE.MeshStandardMaterial(),b=new THREE.MeshStandardMaterial();terrain.materialForHole=id=>id===1?a:b;terrain.rebuild(layout);
 const bottoms=terrain.group.children.filter(m=>m.position.y===-.8);assert.ok(bottoms.some(m=>m.material===a));assert.ok(bottoms.some(m=>m.material===b));assert.ok(bottoms.every(m=>m.material===(m.position.x<1?a:b)));
});
