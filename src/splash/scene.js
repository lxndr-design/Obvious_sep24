import * as THREE from 'three';

// Dark cinematic shell the later slices fill: empty scene, camera, two lights.
export const SPLASH_BACKGROUND='#0c0e12';
export function createSplashScene(){
 const scene=new THREE.Scene();
 scene.background=new THREE.Color(SPLASH_BACKGROUND);
 scene.fog=new THREE.Fog(SPLASH_BACKGROUND,30,110);
 const camera=new THREE.PerspectiveCamera(50,1,.1,300);
 camera.position.set(0,2.5,16);
 camera.lookAt(0,0,0);
 const key=new THREE.DirectionalLight(0xffffff,2.4);key.position.set(6,10,8);
 const rim=new THREE.HemisphereLight(0x9fb4ff,0x14161c,.75);
 scene.add(key,rim);
 return{scene,camera};
}
