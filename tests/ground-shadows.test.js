import test from 'node:test';
import assert from 'node:assert/strict';
import {DirectionalLight,MeshStandardMaterial,ShaderLib} from 'three';
import {makeGroundMaterial} from '../src/ground-shadows.js';

test('distance shadows affect the ground shader without changing object materials or other lights',()=>{
 const base=new MeshStandardMaterial({color:0xffffff,roughness:.88});
 const originalHook=base.onBeforeCompile;
 const material=makeGroundMaterial(base,new DirectionalLight());
 const shader={uniforms:{},fragmentShader:ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader);
 assert.notEqual(material,base);
 assert.equal(base.onBeforeCompile,originalHook);
 assert.equal(material.color.getHex(),0xffffff);
 assert.match(shader.fragmentShader,/groundShadow\( directionalShadowMap\[ i \]/);
 assert.match(shader.fragmentShader,/getShadow\( spotShadowMap\[ i \]/);
 assert.match(shader.fragmentShader,/#include <tonemapping_fragment>/);
 assert.doesNotMatch(shader.fragmentShader,/#include <lights_fragment_begin>/);
 assert.ok(shader.uniforms.groundShadowDepthRange);
});

test('softness stays in world units when the sun shadow camera resizes or its depth range changes',()=>{
 const sun=new DirectionalLight();
 Object.assign(sun.shadow.camera,{near:1,far:45,left:-16,right:16,top:16,bottom:-16});
 const material=makeGroundMaterial(new MeshStandardMaterial(),sun);
 const shader={uniforms:{},fragmentShader:ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader);
 assert.equal(shader.uniforms.groundShadowDepthRange.value,44);
 assert.deepEqual(shader.uniforms.groundShadowWorldSize.value.toArray(),[32,32]);
 const worldSize=shader.uniforms.groundShadowWorldSize;
 Object.assign(sun.shadow.camera,{near:2,far:60,left:-24,right:24,top:18,bottom:-18});
 material.onBeforeRender();
 assert.equal(shader.uniforms.groundShadowWorldSize,worldSize);
 assert.deepEqual(worldSize.value.toArray(),[48,36]);
 assert.equal(shader.uniforms.groundShadowDepthRange.value,58);
});
