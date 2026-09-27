import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSplashScene,SPLASH_BACKGROUND,applySceneVariant,SPLASH_SCENE_DEFAULTS} from '../src/splash/scene.js';
import {LIGHT_RIGS} from '../src/splash/demo/variants.js';

// Scene-variant layer (spec art_WSIRxV9E): per-banner lighting/background
// become data. The locked acceptance: the DEFAULT variant must reproduce
// today's hardcoded shell exactly — additive, never a default drift.

function lightsOf(scene){
 return{
  key:scene.children.find(o=>o.isDirectionalLight),
  rim:scene.children.find(o=>o.isHemisphereLight),
 };
}
const hex=c=>c instanceof THREE.Color?c.getHexString():new THREE.Color(c).getHexString();

test('default variant reproduces the hardcoded shell byte-for-byte',()=>{
 // Two independent scenes: one from the untouched no-arg path, one rebuilt
 // through the variant layer with the exported default.
 const plain=createSplashScene();
 const variant=createSplashScene(SPLASH_SCENE_DEFAULTS);
 for(const scene of[variant.scene]){
  assert.equal(scene.background.getHexString(),SPLASH_BACKGROUND.slice(1));
  assert.equal(hex(scene.fog.color),SPLASH_BACKGROUND.slice(1));
  assert.equal(scene.fog.near,30);
  assert.equal(scene.fog.far,110);
  const{key,rim}=lightsOf(scene);
  assert.equal(hex(key.color),'ffffff');
  assert.equal(key.intensity,2.4);
  assert.deepEqual(key.position.toArray(),[6,10,8]);
  assert.equal(hex(rim.color),'9fb4ff');
  assert.equal(hex(rim.groundColor),'14161c');
  assert.equal(rim.intensity,.75);
  assert.equal(scene.children.length,plain.scene.children.length,'no extra lights on the default path');
 }
 const{camera}=variant;
 const{camera:plainCamera}=plain;
 assert.equal(camera.fov,plainCamera.fov);
 assert.deepEqual(camera.position.toArray(),plainCamera.position.toArray());
 assert.equal(camera.fov,50);
 assert.deepEqual(camera.position.toArray(),[0,2.5,16]);
});

test('applySceneVariant drives background, fog, lights and camera from data',()=>{
 const rig=LIGHT_RIGS.neon; // expectations read FROM the rig — this test pins the application, not a data copy
 const {scene,camera}=createSplashScene();
 applySceneVariant(scene,lightsOf(scene),rig,camera);
 assert.equal(scene.background.getHexString(),new THREE.Color(rig.background).getHexString());
 assert.equal(hex(scene.fog.color),new THREE.Color(rig.fog.color).getHexString());
 assert.equal(scene.fog.near,rig.fog.near);
 assert.equal(scene.fog.far,rig.fog.far);
 const{key,rim}=lightsOf(scene);
 assert.equal(hex(key.color),new THREE.Color(rig.key.color).getHexString());
 assert.equal(key.intensity,rig.key.intensity);
 assert.deepEqual(key.position.toArray(),rig.key.position);
 assert.equal(hex(rim.color),new THREE.Color(rig.rim.sky).getHexString());
 assert.equal(hex(rim.groundColor),new THREE.Color(rig.rim.ground).getHexString());
 assert.equal(rim.intensity,rig.rim.intensity);
 assert.equal(camera.fov,rig.camera.fov);
 assert.deepEqual(camera.position.toArray(),rig.camera.position);
});

test('a variant applying the default values restores the default shell',()=>{
 const {scene,camera}=createSplashScene();
 scene.background=new THREE.Color('#ff00ff');
 applySceneVariant(scene,lightsOf(scene),SPLASH_SCENE_DEFAULTS,camera);
 assert.equal(scene.background.getHexString(),SPLASH_BACKGROUND.slice(1));
});

test('applySceneVariant without lights is a safe no-op on lights',()=>{
 const {scene}=createSplashScene();
 const rim=lightsOf(scene).rim;
 const before=rim.color.getHexString();
 const applied=applySceneVariant(scene,{},SPLASH_SCENE_DEFAULTS);
 assert.equal(applied.scene,scene);
 assert.equal(rim.color.getHexString(),before,'no lights passed — nothing touched, no throw');
});

test('every variant scene validates and applies without throwing',()=>{
 for(const rig of Object.values(LIGHT_RIGS)){
  const {scene,camera}=createSplashScene();
  assert.doesNotThrow(()=>applySceneVariant(scene,lightsOf(scene),rig,camera));
 }
});
