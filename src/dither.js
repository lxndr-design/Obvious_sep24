import * as THREE from 'three';
export const DitherShader={uniforms:{tDiffuse:{value:null},resolution:{value:new THREE.Vector2()},scale:{value:2},ink:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
 uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float scale; uniform float ink; varying vec2 vUv;
 float bayer2(vec2 p){p=mod(floor(p),2.);return mod(2.*p.x+3.*p.y,4.);}
 float bayer8(vec2 p){return (16.*bayer2(p)+4.*bayer2(floor(p/2.))+bayer2(floor(p/4.))+.5)/64.;}
 void main(){vec2 pixel=floor(vUv*resolution/scale);vec3 c=texture2D(tDiffuse,vUv).rgb;
 // Render target is linear: quantize perceptual luminance, then output sRGB directly.
 c=mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));
 float l=dot(c,vec3(.2126,.7152,.0722));float threshold=bayer8(pixel);float levels=mix(6.,1.,ink);float q=floor(clamp(l,0.,1.)*levels+threshold)/levels;
 vec3 dark=vec3(.15,.19,.165),paper=vec3(.956,.966,.935);vec3 toned=mix(dark,paper,q);
 gl_FragColor=vec4(toned,1.);}`};
