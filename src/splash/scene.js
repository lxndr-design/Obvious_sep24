import * as THREE from 'three';

// Dark cinematic shell the later slices fill: empty scene, camera, two lights.
export const SPLASH_BACKGROUND='#0c0e12';

// The hardcoded shell above, as data. applySceneVariant with this variant (or
// createSplashScene with no argument) reproduces today's scene exactly — one
// truth for what the default splash scene looks like, shared by the demo
// column's studio rig and the default-parity test.
export const SPLASH_SCENE_DEFAULTS=Object.freeze({
 background:SPLASH_BACKGROUND,
 fog:Object.freeze({color:SPLASH_BACKGROUND,near:30,far:110}),
 key:Object.freeze({color:'#ffffff',intensity:2.4,position:Object.freeze([6,10,8])}),
 rim:Object.freeze({sky:'#9fb4ff',ground:'#14161c',intensity:.75}),
 camera:Object.freeze({fov:50,position:Object.freeze([0,2.5,16])}),
});

// Scene-variant layer (demo column): retunes background, fog, key/rim lights
// and the camera from plain data. Additive — every sub-object is optional and
// only provided keys are applied, so a partial variant inherits the shell it
// mutated from. lights is {key,rim} as created by createSplashScene; camera is
// the perspective camera paired with the scene (createSplashScene returns both,
// but the engine owns its instance, so callers pass kit.camera here).
export function applySceneVariant(scene,lights,variant,camera){
 const v=variant??SPLASH_SCENE_DEFAULTS;
 if(v.background!==undefined)scene.background=new THREE.Color(v.background);
 if(v.fog!==undefined)scene.fog=new THREE.Fog(v.fog.color,v.fog.near,v.fog.far);
 if(v.key&&lights?.key){
  lights.key.color.set(v.key.color);
  lights.key.intensity=v.key.intensity;
  lights.key.position.set(...v.key.position);
 }
 if(v.rim&&lights?.rim){
  lights.rim.color.set(v.rim.sky);
  lights.rim.groundColor.set(v.rim.ground);
  lights.rim.intensity=v.rim.intensity;
 }
 if(v.camera&&camera){
  camera.fov=v.camera.fov;
  camera.position.set(...v.camera.position);
  camera.lookAt(0,0,0);
  camera.updateProjectionMatrix();
 }
 return{scene,camera};
}

export function createSplashScene(variant){
 const scene=new THREE.Scene();
 scene.background=new THREE.Color(SPLASH_BACKGROUND);
 scene.fog=new THREE.Fog(SPLASH_BACKGROUND,30,110);
 const camera=new THREE.PerspectiveCamera(50,1,.1,300);
 camera.position.set(0,2.5,16);
 camera.lookAt(0,0,0);
 const key=new THREE.DirectionalLight(0xffffff,2.4);key.position.set(6,10,8);
 const rim=new THREE.HemisphereLight(0x9fb4ff,0x14161c,.75);
 scene.add(key,rim);
 if(variant)applySceneVariant(scene,{key,rim},variant,camera);
 return{scene,camera};
}
