import * as THREE from 'three';
export const DitherShader={
 uniforms:{tDiffuse:{value:null},hangingMask:{value:null},hangingBlur:{value:0},resolution:{value:new THREE.Vector2()},bufferResolution:{value:new THREE.Vector2()},scale:{value:2},ink:{value:0},inkColor:{value:new THREE.Vector3(48/255,48/255,48/255)},paperColor:{value:new THREE.Vector3(1,1,1)}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`
 uniform sampler2D tDiffuse;
 uniform sampler2D hangingMask;
 uniform float hangingBlur;
 // CSS size controls the requested scale, rounded to the nearest physical pixel.
 uniform vec2 resolution;
 uniform vec2 bufferResolution;
 uniform float scale;
 uniform float ink;
 // Palette colors are already sRGB, matching this final pass output.
 uniform vec3 inkColor;
 uniform vec3 paperColor;
 varying vec2 vUv;
 float bayer2(vec2 p){p=mod(floor(p),2.);return mod(2.*p.x+3.*p.y,4.);}
 float bayer8(vec2 p){return (16.*bayer2(p)+4.*bayer2(floor(p/2.))+bayer2(floor(p/4.))+.5)/64.;}
 void main(){
  // Raster coordinates avoid interpolation rounding at cell boundaries.
  vec2 sampleUV=gl_FragCoord.xy/bufferResolution;
  vec2 pixel=vec2(0.);
  if(scale>0.){
   // Whole physical pixels prevent alternating cell widths at fractional DPR.
   vec2 cellSize=max(vec2(1.),floor(scale*bufferResolution/resolution+.5));
   pixel=floor(gl_FragCoord.xy/cellSize);
   // Sample once per cell so silhouettes, shadows and shading share the grid.
   // Clamp the center of partial cells along the viewport's top/right edges.
   sampleUV=min((pixel+.5)*cellSize,bufferResolution-.5)/bufferResolution;
  }
  vec3 c=texture2D(tDiffuse,sampleUV).rgb;
  if(hangingBlur>0.){
   vec2 r=vec2(.85)/resolution;
   float mask=texture2D(hangingMask,sampleUV).r;
   vec3 soft=c*4.;float coverage=mask*4.;
   for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
    if(x==0&&y==0)continue;
    vec2 uv=sampleUV+vec2(float(x),float(y))*r;
    soft+=texture2D(tDiffuse,uv).rgb;coverage+=texture2D(hangingMask,uv).r;
   }
   c=mix(c,soft/12.,max(mask,coverage/12.)*.7);
  }
  // Render target is linear; this final pass outputs sRGB directly.
  c=mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));
  // Zero disables pixelation, palette quantization and ordered dithering.
  if(scale<=0.){gl_FragColor=vec4(c,1.);return;}
  float l=dot(c,vec3(.2126,.7152,.0722));
  float threshold=bayer8(pixel);
  float levels=mix(6.,1.,ink);
  float q=floor(clamp(l,0.,1.)*levels+threshold)/levels;
  // Colored wildlife keeps its chroma in shaded mode; two-tone still uses only its palette.
  vec3 color=mix(inkColor,paperColor,q)+(c-vec3(l))*(1.-ink);
  gl_FragColor=vec4(clamp(color,0.,1.),1.);
 }`
};
