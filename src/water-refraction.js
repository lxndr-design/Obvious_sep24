import * as THREE from 'three';
import {anyOnScreen} from './view-cull.js';

// Shared scene capture, sampled by the actual displaced water surfaces. The final
// dither pass still handles the palette and pixel grid after light has refracted.
export function refractiveWaterMaterial(base){
 const material=base.clone();
 const uniforms={waterScene:{value:null},waterDepth:{value:null},waterScreen:{value:new THREE.Vector2(1,1)},waterProjection:{value:new THREE.Matrix4()},waterInverseProjection:{value:new THREE.Matrix4()},waterCameraWorld:{value:new THREE.Matrix4()},waterReady:{value:0},waterBaseOpacity:{value:base.opacity}};
 material.userData.refraction=uniforms;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform sampler2D waterScene;
   uniform sampler2D waterDepth;
   uniform vec2 waterScreen;
   uniform mat4 waterProjection;
   uniform mat4 waterInverseProjection;
   uniform mat4 waterCameraWorld;
   uniform float waterReady;
   uniform float waterBaseOpacity;
   vec3 waterViewPoint(vec2 uv){
    float depth=texture2D(waterDepth,uv).r;
    vec4 p=waterInverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);
    return p.xyz/p.w;
   }
   vec2 waterProject(vec3 p){vec4 clip=waterProjection*vec4(p,1.);return clip.xy/clip.w*.5+.5;}
  `).replace('#include <alphahash_fragment>',`
   #ifdef USE_ALPHAHASH
    // Water normally composites a captured background as opaque. A relocation
    // reveal must use its fade fraction, not its optical tint opacity.
    diffuseColor.a=clamp(diffuseColor.a/max(waterBaseOpacity,.001),0.,1.);
   #endif
   #include <alphahash_fragment>
  `).replace('#include <opaque_fragment>',`
   if(waterReady>0.){
    vec2 originalUV=gl_FragCoord.xy/waterScreen;
    vec3 surface=-vViewPosition;
    vec3 incident=isOrthographic?vec3(0.,0.,-1.):normalize(surface);
    vec3 ray=refract(incident,normal,1./1.333);
    vec3 behind=waterViewPoint(originalUV);
    float distanceBehind=clamp(surface.z-behind.z,0.,2.);
    vec2 refractedUV=originalUV;
    float surfaceY=(waterCameraWorld*vec4(surface,1.)).y;
    // Two depth lookups approximate where the bent ray meets the basin or a
    // submerged form. No procedural wobble remains after the waves settle.
    for(int i=0;i<2;i++){
     vec3 target=surface+ray*distanceBehind/max(-ray.z,.2);
     vec2 candidate=waterProject(target);
     bool onScreen=all(greaterThanEqual(candidate,vec2(.001)))&&all(lessThanEqual(candidate,vec2(.999)));
     vec3 hit=waterViewPoint(clamp(candidate,vec2(.001),vec2(.999)));
     float hitY=(waterCameraWorld*vec4(hit,1.)).y;
     // Do not pull dry rims, nearby ground or foreground objects into the water.
     if(onScreen&&hit.z<surface.z-.001&&hitY<surfaceY+.002){
      refractedUV=candidate;distanceBehind=clamp(surface.z-hit.z,0.,2.);
     }else{refractedUV=originalUV;break;}
    }
    // Neutral absorption preserves the established gray tint and keeps the
    // bright white basin visible instead of clipping it to paper white.
    vec3 transmitted=texture2D(waterScene,refractedUV).rgb*exp(-(.58+distanceBehind*.18));
    float grazing=pow(1.-clamp(dot(-incident,normal),0.,1.),5.);
    float tint=clamp(waterBaseOpacity*.5+grazing*.25+distanceBehind*.035,.12,.65);
    outgoingLight=mix(transmitted,outgoingLight,tint);
    // The capture already contains the background: alpha blending it again
    // would leave a second, perfectly straight copy of every submerged edge.
    diffuseColor.a=clamp(opacity/max(waterBaseOpacity,.001),0.,1.);
   }
   #include <opaque_fragment>
  `);
 };
 material.customProgramCacheKey=()=> 'water-refraction-v2';
 return material;
}
const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
export class WaterRefraction {
 constructor(){
  this.target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});
  this.target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  this.screen=new THREE.Vector2();
  this.captures=0;this.skips=0;
 }
 resize(width,height){this.target.setSize(Math.max(1,Math.round(width)),Math.max(1,Math.round(height)));}
 render(renderer,scene,camera,surfaces){
  const active=surfaces.filter(visible);
  // The full-scene capture only pays for itself while some water is actually
  // in view; counting the skips keeps the gating testable.
  if(!active.length||!anyOnScreen(active,camera)){this.skips++;return false;}
  this.captures++;
  renderer.getDrawingBufferSize(this.screen);
  for(const material of new Set(active.map(m=>m.material))){
   const u=material.userData.refraction;if(!u)continue;
   u.waterScene.value=this.target.texture;u.waterDepth.value=this.target.depthTexture;u.waterScreen.value.copy(this.screen);
   u.waterProjection.value.copy(camera.projectionMatrix);u.waterInverseProjection.value.copy(camera.projectionMatrixInverse);camera.updateMatrixWorld();u.waterCameraWorld.value.copy(camera.matrixWorld);
  }
  const previous=renderer.getRenderTarget();
  try{
   for(const mesh of active)mesh.visible=false;
   renderer.setRenderTarget(this.target);renderer.clear();renderer.render(scene,camera);
  }finally{for(const mesh of active)mesh.visible=true;renderer.setRenderTarget(previous);}
  for(const mesh of active)if(mesh.material.userData.refraction)mesh.material.userData.refraction.waterReady.value=1;
  return true;
 }
 dispose(){this.target.dispose();}
}
