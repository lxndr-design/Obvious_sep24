import * as THREE from 'three';
import {FBM3_GLSL,resolveBumpParams} from '../gen/bump3d.js';

// Banner material presets. instanceColor carries per-body color, so every
// material here stays white. Iridescence is injected with onBeforeCompile —
// one hue function over object-space position, so the shading is position-
// derived (the same honest-3D idea the bump tier uses for its fBm normals).

export const MATERIAL_KINDS=['gloss','matte','iridescent','bump'];

export function createMaterial(kind,bumpParams){
 switch(kind){
  case 'gloss':return new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.18,metalness:.08,clearcoat:1,clearcoatRoughness:.14});
  case 'matte':return new THREE.MeshStandardMaterial({color:0xffffff,roughness:.94,metalness:0});
  case 'iridescent':return iridescentMaterial();
  case 'bump':return fractalBumpMaterial(bumpParams);
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

// --- fractal bump tier -----------------------------------------------------

// Noise params for the fragment tier as GLSL #defines (material.defines reach
// both shader stages). The fragment field is the SAME fbm3 definition as the
// geometry displacement (same hash, fade, octaves — one noise definition),
// evaluated one detail band up: frequency·lacunarity² is the octave band the
// vertex tessellation cannot resolve, so geometry carries the macro silhouette
// and the fragment tier shades the micro detail on top — no double-counting of
// the band the vertex normals already express.
function bumpDefines(params){
 const cfg=resolveBumpParams(params);
 return{
  SPLASH_BUMP_OCTAVES:String(cfg.octaves),
  SPLASH_BUMP_LACUNARITY:cfg.lacunarity.toFixed(6),
  SPLASH_BUMP_GAIN:cfg.gain.toFixed(6),
  SPLASH_BUMP_SEED:`${cfg.seed}u`,
  SPLASH_BUMP_DETAIL_FREQ:(cfg.frequency*cfg.lacunarity**2).toFixed(6),
  // Perceptual strength of the micro tilt; scaled by amplitude so the
  // fragment tier tracks the geometric displacement it belongs to.
  SPLASH_BUMP_STRENGTH:(cfg.amplitude*.35).toFixed(6),
  SPLASH_BUMP_EPS:'0.01',
 };
}

export function fractalBumpMaterial(params){
 const m=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.42,metalness:.05});
 m.defines=bumpDefines(params);
 m.onBeforeCompile=shader=>{
  // Object-space position + the object→view rotation basis (per instance,
  // since instanceMatrix is vertex-stage only) ride the normal perturbation.
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nvarying vec3 vSplashLocal;\nvarying vec3 vSplashBasis0;\nvarying vec3 vSplashBasis1;\nvarying vec3 vSplashBasis2;')
   .replace('#include <begin_vertex>',[
    '#include <begin_vertex>',
    'vSplashLocal=position;',
    '#ifdef USE_INSTANCING',
    'mat3 splashObjToView=mat3(modelViewMatrix)*mat3(instanceMatrix);',
    '#else',
    'mat3 splashObjToView=mat3(modelViewMatrix);',
    '#endif',
    'vSplashBasis0=splashObjToView[0];',
    'vSplashBasis1=splashObjToView[1];',
    'vSplashBasis2=splashObjToView[2];',
   ].join('\n'));
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nvarying vec3 vSplashLocal;\nvarying vec3 vSplashBasis0;\nvarying vec3 vSplashBasis1;\nvarying vec3 vSplashBasis2;\n'+FBM3_GLSL)
   .replace('#include <normal_fragment_begin>',[
    '#include <normal_fragment_begin>',
    '{',
    ' vec3 splashP=vSplashLocal;',
    ' float splashH=splashFbm(splashP,SPLASH_BUMP_DETAIL_FREQ,SPLASH_BUMP_SEED);',
    ' float splashHX=splashFbm(splashP+vec3(SPLASH_BUMP_EPS,0.0,0.0),SPLASH_BUMP_DETAIL_FREQ,SPLASH_BUMP_SEED);',
    ' float splashHY=splashFbm(splashP+vec3(0.0,SPLASH_BUMP_EPS,0.0),SPLASH_BUMP_DETAIL_FREQ,SPLASH_BUMP_SEED);',
    ' float splashHZ=splashFbm(splashP+vec3(0.0,0.0,SPLASH_BUMP_EPS),SPLASH_BUMP_DETAIL_FREQ,SPLASH_BUMP_SEED);',
    // Object-space gradient of the detail band, rotated into view space,
    // tangential part only — the same position-derived field the geometry
    // was cut with, so shading and silhouette cannot disagree.
    ' vec3 splashGObj=vec3(splashHX-splashH,splashHY-splashH,splashHZ-splashH)/(SPLASH_BUMP_EPS*SPLASH_BUMP_DETAIL_FREQ);',
    ' vec3 splashGView=mat3(vSplashBasis0,vSplashBasis1,vSplashBasis2)*splashGObj;',
    ' splashGView-=normal*dot(splashGView,normal);',
    ' normal=normalize(normal-SPLASH_BUMP_STRENGTH*splashGView);',
    '}',
   ].join('\n'));
 };
 return m;
}

// Re-parameterizes an existing fractal-bump material (kit.fractalBump patches
// buckets whose geometry already displaced). Recompiles on next render.
export function setBumpMaterialParams(material,params){
 if(!material.defines||material.defines.SPLASH_BUMP_SEED===undefined){
  throw new TypeError('setBumpMaterialParams expects a fractal-bump material');
 }
 material.defines=bumpDefines(params);
 material.needsUpdate=true;
}
