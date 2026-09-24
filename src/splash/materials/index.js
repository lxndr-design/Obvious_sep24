import * as THREE from 'three';

// Banner material presets. instanceColor carries per-body color, so every
// material here stays white. Iridescence is injected with onBeforeCompile —
// one hue function over object-space position, so the shading is position-
// derived (the same honest-3D idea the bump slice uses for its fBm normals).

export const MATERIAL_KINDS=['gloss','matte','iridescent'];

export function createMaterial(kind){
 switch(kind){
  case 'gloss':return new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.18,metalness:.08,clearcoat:1,clearcoatRoughness:.14});
  case 'matte':return new THREE.MeshStandardMaterial({color:0xffffff,roughness:.94,metalness:0});
  case 'iridescent':return iridescentMaterial();
  default:throw new Error(`Unknown material: ${kind}`);
 }
}

// Thin-film-ish hue shift from view angle + object-space position, injected at
// shader compile time. Compiles only in a real GL context — node tests assert
// structure, not GLSL output.
function iridescentMaterial(){
 const m=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.3,metalness:.12,clearcoat:.6,clearcoatRoughness:.3});
 m.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nvarying vec3 vSplashLocal;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvSplashLocal=position;');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nvarying vec3 vSplashLocal;\nvec3 splashHue(float t){return .5+.5*cos(6.28318*(t+vec3(0.,.33,.67)));}')
   .replace('#include <color_fragment>',[
    '#include <color_fragment>',
    '{',
    ' float t=dot(normalize(vNormal),normalize(vViewPosition))*.5+vSplashLocal.y*.06+vSplashLocal.x*.04;',
    ' diffuseColor.rgb*=.6+.85*splashHue(t);',
    '}',
   ].join('\n'));
 };
 return m;
}
