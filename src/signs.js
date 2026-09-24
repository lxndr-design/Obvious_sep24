import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export const SIGN_VARIANTS={arrow:'Arrow',plaque:'Plaque',pennant:'Pennant'};
export const SIGN_ICONS={tree:'Tree',water:'Water',flower:'Flower',bird:'Bird',home:'Home'};
export const SIGN_LABELS={'sign-pole':'Sign pole',...Object.fromEntries(Object.entries(SIGN_VARIANTS).flatMap(([key,label])=>['text','icon'].map(mode=>[`sign-${key}-${mode}`,`${label} sign`])))};
export const isSign=o=>!!o?.sign;
const up=new THREE.Vector3(0,1,0),slots=[1.02,.57,.12,-.33,-.78];
export function makeSign(type,R){
 if(type==='sign-pole'){
  const stem=new THREE.CylinderGeometry(.075,.085,2.7,8),base=new THREE.CylinderGeometry(.22,.27,.1,12);base.translate(0,-1.3,0);
  const geometry=mergeGeometries([stem.toNonIndexed(),base.toNonIndexed()]);stem.dispose();base.dispose();geometry.computeBoundingBox();
  return {geometry,height:2.7,parts:[{shape:new R.Cylinder(1.35,.085),offset:new THREE.Vector3()},{shape:new R.Cylinder(.05,.27),offset:new THREE.Vector3(0,-1.3,0)}]};
 }
 const [,variant,mode]=type.split('-'),width=mode==='icon'?.92:1.7,left=-.06,right=left+width,h=.18;
 const points=variant==='arrow'?[[left,-h],[right-.2,-h],[right,0],[right-.2,h],[left,h]]:variant==='pennant'?[[left,-h],[right-.15,-h],[right,0],[right-.15,h],[left,h],[left+.1,0]]:[[left,-h],[right,-h],[right,h],[left,h]];
 const outline=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y))),geometry=new THREE.ExtrudeGeometry(outline,{depth:.07,bevelEnabled:false});geometry.translate(0,0,-.035);geometry.computeBoundingBox();
 const vertices=[];for(const z of [-.035,.035])for(const [x,y]of points)vertices.push(x,y,z);
 // Pennant's notch is concave: use the exact mesh, rather than filling it with a hull.
 const shape=variant==='pennant'?new R.TriMesh(new Float32Array(geometry.attributes.position.array),new Uint32Array(Array.from({length:geometry.attributes.position.count},(_,i)=>i))):new R.ConvexPolyhedron(new Float32Array(vertices));
 return {geometry,height:.36,parts:[{shape,offset:new THREE.Vector3()}],sign:{variant,mode,label:'This way',icon:'tree',arrow:'right',width}};
}
export function signPlacement(collision,o,x,z,pole=null){
 if(!isSign(o)||![x,z].every(Number.isFinite))return null;
 const candidates=pole?[pole]:collision.objects.filter(p=>p.type==='sign-pole'&&Math.hypot(p.mesh.position.x-x,p.mesh.position.z-z)<.8).sort((a,b)=>a.mesh.position.distanceToSquared(new THREE.Vector3(x,a.mesh.position.y,z))-b.mesh.position.distanceToSquared(new THREE.Vector3(x,b.mesh.position.y,z)));
 for(const host of candidates){
  if(host.hanging||host.properties?.locked)continue;
  const used=new Set(collision.objects.filter(s=>s!==o&&isSign(s)&&s.support===host).map(s=>s.signSlot));
  const order=o.support===host?[o.signSlot,...slots.keys()]:[...slots.keys()];
  for(const slot of new Set(order)){
   if(!Number.isInteger(slot)||used.has(slot))continue;
   const position=new THREE.Vector3(0,slots[slot]*(host.modelScale??1),.085*(host.modelScale??1)+.04*(o.modelScale??1)).applyQuaternion(o.mesh.quaternion).add(host.mesh.position);
   if(collision.canPlace(o,position))return {position,support:host,signSlot:slot};
  }
 }
 if(pole||candidates.length)return null;
 const position=new THREE.Vector3(x,collision.supportY(o,x,z),z);
 return collision.canPlace(o,position)?{position,support:null,signSlot:null}:null;
}
export function applySignPlacement(o,p){o.mesh.position.copy(p.position);o.support=p.support;o.signSlot=p.signSlot;}
export function turnSign(collision,o,radians){
 const start=o.mesh.quaternion.clone(),position=o.mesh.position.clone(),pivot=o.support?.type==='sign-pole'?o.support.mesh.position:position;
 // Check the swept turn as well as its destination, keeping the attachment fixed.
 let next,q;const steps=Math.max(1,Math.ceil(Math.abs(radians)/(Math.PI/36)));
 for(let i=1;i<=steps;i++){
  const turn=new THREE.Quaternion().setFromAxisAngle(up,radians*i/steps);
  next=position.clone().sub(pivot).applyQuaternion(turn).add(pivot);q=turn.clone().multiply(start);
  if(!collision.canPlace(o,next,q))return false;
 }
 o.mesh.position.copy(next);o.mesh.quaternion.copy(q);return true;
}
function drawIcon(c,icon,x,y,s){
 c.save();c.translate(x,y);c.scale(s,s);c.lineWidth=.075;c.lineCap='round';c.lineJoin='round';c.beginPath();
 if(icon==='tree'){c.moveTo(0,.42);c.lineTo(0,-.4);c.moveTo(-.36,.18);c.lineTo(0,-.42);c.lineTo(.36,.18);c.closePath();}
 else if(icon==='water'){for(const y of [-.2,0,.2]){c.moveTo(-.42,y);c.bezierCurveTo(-.15,y-.25,.15,y+.25,.42,y);}}
 else if(icon==='home'){c.moveTo(-.4,0);c.lineTo(0,-.38);c.lineTo(.4,0);c.moveTo(-.28,-.1);c.lineTo(-.28,.35);c.lineTo(.28,.35);c.lineTo(.28,-.1);}
 else if(icon==='bird'){c.moveTo(-.42,0);c.quadraticCurveTo(-.2,-.3,0,.12);c.quadraticCurveTo(.2,-.3,.42,0);}
 else{for(let i=0;i<5;i++){const a=i*Math.PI*2/5;c.moveTo(0,0);c.ellipse(Math.sin(a)*.22,Math.cos(a)*.22,.12,.2,-a,0,Math.PI*2);}}
 c.stroke();c.restore();
}
export function updateSignFace(o){
 if(!o.signVisual)return;
 const {canvas,texture}=o.signVisual,c=canvas.getContext('2d'),s=o.sign;
 c.clearRect(0,0,1024,256);c.strokeStyle=c.fillStyle='#41413e';drawIcon(c,s.icon,120,128,150);
 if(s.mode==='text'){c.font='600 94px system-ui, sans-serif';c.textBaseline='middle';c.fillText(s.label.slice(0,32),230,132,535);}
 const x=s.mode==='text'?865:760,dir=s.arrow==='left'?-1:1;
 c.save();c.translate(x,128);c.scale(dir,1);c.lineWidth=14;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(-66,0);c.lineTo(65,0);c.moveTo(19,-42);c.lineTo(65,0);c.lineTo(19,42);c.stroke();c.restore();texture.needsUpdate=true;
}
export function decorateSign(o){
 if(!isSign(o))return;
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const uniforms={map:{value:texture},glimmer:{value:-1}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D map; uniform float glimmer; varying vec2 vUv; void main(){vec4 ink=texture2D(map,vUv);float shine=(1.-smoothstep(0.,.13,abs(vUv.x-vUv.y*.18-glimmer)))*step(0.,glimmer);gl_FragColor=vec4(mix(ink.rgb,vec3(1.),shine),max(ink.a,shine*.55));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
 const scale=o.modelScale??1,geometry=new THREE.PlaneGeometry(o.sign.width*.78*scale,.27*scale),faces=[];
 for(const side of [1,-1]){const face=new THREE.Mesh(geometry,material);face.position.set((-.06+o.sign.width*.46)*scale,0,side*.037*scale);if(side<0)face.rotation.y=Math.PI;face.raycast=()=>{};o.mesh.add(face);faces.push(face);}
 o.signVisual={canvas,texture,material,geometry,uniforms,faces,hover:false,time:0};updateSignFace(o);
}
export function stepSign(o,dt,hovered,reduced=false){if(!o.signVisual)return;const v=o.signVisual;if(hovered&&!v.hover)v.time=0;v.hover=hovered;v.time+=dt;v.uniforms.glimmer.value=hovered&&!reduced?(v.time%1.5)/.65*1.5-.2:-1;}
export function disposeSign(o){if(!o.signVisual)return;const v=o.signVisual;v.texture.dispose();v.material.dispose();v.geometry.dispose();for(const face of v.faces)face.removeFromParent();}
