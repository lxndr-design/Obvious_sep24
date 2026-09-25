import * as THREE from 'three';
import {messageHopBounds,messageHopSize} from './message-hops.js';

// A single small instanced draw, with per-puff alpha and no textures or lights.
export class HopPuffs {
 constructor(scene,random=Math.random){
  this.random=random;this.puffs=[];this.capacity=96;this.transform=new THREE.Object3D();
  const geometry=new THREE.CircleGeometry(1,8);this.alpha=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity),1);geometry.setAttribute('puffAlpha',this.alpha);
  const material=new THREE.MeshBasicMaterial({color:0xc5c5c5,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float puffAlpha; varying float vPuffAlpha;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPuffAlpha=puffAlpha;');
   shader.fragmentShader='varying float vPuffAlpha;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vPuffAlpha;');
  };
  this.mesh=new THREE.InstancedMesh(geometry,material,this.capacity);this.mesh.count=0;scene.add(this.mesh);
 }
 emit(members,waterAt=()=>null){
  const group=new Set(members);
  for(const o of members){
   if(o.support&&group.has(o.support))continue;
   const bounds=messageHopBounds(o),center=bounds.getCenter(new THREE.Vector3()),size=messageHopSize(o),rx=(bounds.max.x-bounds.min.x)*.45,rz=(bounds.max.z-bounds.min.z)*.45;
   for(let i=0;i<6;i++){
    const angle=(i+this.random()*.5)/6*Math.PI*2,position=new THREE.Vector3(center.x+Math.cos(angle)*rx,bounds.min.y+.025,center.z+Math.sin(angle)*rz),water=waterAt(position);
    if(water&&bounds.min.y<=water.y&&bounds.max.y>=water.y)position.y=water.y+.025;
    this.puffs.push({position,velocity:new THREE.Vector3(Math.cos(angle)*.25,.2,Math.sin(angle)*.25).multiplyScalar(Math.sqrt(size)),radius:Math.min(.16,size*.045)*( .8+this.random()*.4),age:0,life:.3+this.random()*.15});
   }
  }
  if(this.puffs.length>this.capacity)this.puffs.splice(0,this.puffs.length-this.capacity);
 }
 step(dt,camera){
  for(const p of this.puffs){p.age+=dt;p.position.addScaledVector(p.velocity,dt);}
  this.puffs=this.puffs.filter(p=>p.age<p.life);this.mesh.count=this.puffs.length;
  this.puffs.forEach((p,i)=>{const t=p.age/p.life;this.transform.position.copy(p.position);this.transform.quaternion.copy(camera.quaternion);this.transform.scale.setScalar(p.radius*(1+t*2));this.transform.updateMatrix();this.mesh.setMatrixAt(i,this.transform.matrix);this.alpha.setX(i,.5*(1-t)*(1-t));});
  this.alpha.needsUpdate=true;this.mesh.instanceMatrix.needsUpdate=true;this.mesh.computeBoundingSphere();
 }
 reset(){this.puffs=[];this.mesh.count=0;}
}
