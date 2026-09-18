import {ShaderChunk,Vector2} from 'three';

// A fixed disk keeps the penumbra stable as the camera and dither grid move.
const disk=Array.from({length:24},(_,i)=>{
 const angle=i*2.399963229728653,radius=Math.sqrt((i+.5)/24);
 return `vec2(${(Math.cos(angle)*radius).toFixed(8)},${(Math.sin(angle)*radius).toFixed(8)})`;
});
const shadowGLSL=/* glsl */`
#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
uniform float groundShadowDepthRange;
uniform vec2 groundShadowWorldSize;
const vec2 groundShadowDisk[24]=vec2[24](${disk.join(',')});

float groundShadow(sampler2D shadowMap,vec2 shadowMapSize,float intensity,
 float bias,float radius,vec4 shadowCoord){
 vec3 p=shadowCoord.xyz/shadowCoord.w;
 // Account for the receiving plane's slope in light space. Without this,
 // neighboring floor texels are mistaken for blockers and shade empty ground.
 vec3 dx=dFdx(p),dy=dFdy(p);
 float determinant=dx.x*dy.y-dx.y*dy.x;
 vec2 slope=abs(determinant)>1e-10
  ? vec2(dy.y*dx.z-dx.y*dy.z,dx.x*dy.z-dy.x*dx.z)/determinant
  : vec2(0.);
 p.z+=bias;
 if(any(lessThan(p,vec3(0.)))||any(greaterThan(p,vec3(1.))))return 1.;
 float blockerDistance=0.,blockers=0.;
 vec2 searchRadius=vec2(.36)/groundShadowWorldSize;
 for(int i=0;i<12;i++){
  vec2 offset=groundShadowDisk[i*2]*searchRadius;
  float depth=unpackRGBAToDepth(texture2D(shadowMap,p.xy+offset));
  float separation=(p.z+dot(slope,offset)-depth)*groundShadowDepthRange;
  if(separation>.035){blockerDistance+=separation;blockers+=1.;}
 }
 // Retain fine contact shadows even when a thin caster misses the search disk.
 float centerDepth=unpackRGBAToDepth(texture2D(shadowMap,p.xy));
 float centerDistance=max(0.,(p.z-centerDepth)*groundShadowDepthRange);
 if(centerDistance>.015){blockerDistance+=centerDistance;blockers+=1.;}
 float distanceToCaster=blockers>0.?blockerDistance/blockers:0.;
 float worldRadius=min(.34,.012+distanceToCaster*.065);
 vec2 filterRadius=max(vec2(.75)/shadowMapSize,vec2(worldRadius)/groundShadowWorldSize);
 float visibility=0.;
 for(int i=0;i<24;i++){
  vec2 offset=groundShadowDisk[i]*filterRadius;
  visibility+=texture2DCompare(shadowMap,p.xy+offset,p.z+dot(slope,offset));
 }
 // Keep a readable contact, then gently lose contrast with separation.
 float strength=1./(1.+distanceToCaster*.22);
 return 1.-(1.-visibility/24.)*intensity*strength;
}
#endif
`;

export function makeGroundMaterial(base,sun){
 const material=base.clone();
 const uniforms={groundShadowDepthRange:{value:1},groundShadowWorldSize:{value:new Vector2()}};
 material.onBeforeRender=()=>{
  const camera=sun.shadow.camera;
  uniforms.groundShadowDepthRange.value=camera.far-camera.near;
  uniforms.groundShadowWorldSize.value.set(camera.right-camera.left,camera.top-camera.bottom);
 };
 material.onBeforeRender();
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <shadowmap_pars_fragment>',ShaderChunk.shadowmap_pars_fragment+shadowGLSL)
   .replace('#include <lights_fragment_begin>',ShaderChunk.lights_fragment_begin.replace(
    'getShadow( directionalShadowMap','groundShadow( directionalShadowMap'));
 };
 material.customProgramCacheKey=()=> 'ground-distance-shadows-v1';
 return material;
}
