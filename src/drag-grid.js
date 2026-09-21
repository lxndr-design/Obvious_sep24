import * as THREE from 'three';

export class DragGrid extends THREE.Mesh {
 constructor(){
  const geometry=new THREE.PlaneGeometry(2,2);geometry.rotateX(-Math.PI/2);geometry.translate(0,.018,0);
  const color=new THREE.Color('#666666');
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,uniforms:{color:{value:color}},vertexShader:'varying vec2 worldXZ; varying vec2 localUV; void main(){localUV=uv; vec4 p=modelMatrix*vec4(position,1.); worldXZ=p.xz; gl_Position=projectionMatrix*viewMatrix*p;}',fragmentShader:`uniform vec3 color; varying vec2 worldXZ; varying vec2 localUV;
   float grid(vec2 p){vec2 distanceToLine=abs(fract(p-.5)-.5)/max(fwidth(p),vec2(.0001));return 1.-clamp(min(distanceToLine.x,distanceToLine.y),0.,1.);}
   void main(){float fade=1.-smoothstep(.35,1.,length((localUV-.5)*2.));float lines=max(grid(worldXZ)*.85,grid(worldXZ*2.)*.55);gl_FragColor=vec4(color,lines*fade);}`});
  // Existing drag validity feedback can tint this just like the old cursor.
  material.color=color;super(geometry,material);this.visible=false;this.renderOrder=3;this.raycast=()=>{};
 }
 setObject(object){const b=object.geometry?.boundingBox;const span=object.size??(b?Math.max(b.max.x-b.min.x,b.max.z-b.min.z):2);const radius=span/2+2.5;this.scale.set(radius,1,radius);}
}
