import * as THREE from 'three';
import {refractiveWaterMaterial} from './water-refraction.js';
import {PoolWater,PoolSpray} from './pool-water.js';
import {contains} from './terrain.js';

export class HoleTerrain {
 constructor(scene,groundMaterial){this.group=new THREE.Group();scene.add(this.group);this.groundMaterial=groundMaterial;this.waterMaterial=new THREE.MeshPhongMaterial({color:0x8c8c8c,specular:0xffffff,shininess:130,transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});this.surfaceMaterial=refractiveWaterMaterial(this.waterMaterial);this.views=[];}
 rebuild(layout){
  const old=this.views;this.views=[];
  for(const child of [...this.group.children]){child.geometry?.dispose();this.group.remove(child);}
  const box=(p,h,y)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(p.w,h,p.d),this.groundMaterial);m.position.set(p.x,y,p.z);m.receiveShadow=m.castShadow=true;this.group.add(m);};
  for(const p of layout.ground){const m=new THREE.Mesh(new THREE.PlaneGeometry(p.w,p.d),this.groundMaterial);m.rotation.x=-Math.PI/2;m.position.set(p.x,0,p.z);m.receiveShadow=true;this.group.add(m);}
  for(const p of layout.bottom)box(p,.18,-.8);
  for(const p of layout.walls)box(p,.8,-.4);
  for(const component of layout.components){
   const width=Math.max(component.x1-component.x0,component.z1-component.z0),x=(component.x0+component.x1)/2,z=(component.z0+component.z1)/2,size=Math.min(129,Math.max(17,Math.floor(width/.05)+1));
   const field=new PoolWater(size,width),view={...component,width,x,z,field};field.mask=new Uint8Array(size*size);
   for(let j=0;j<size;j++)for(let i=0;i<size;i++){const wx=x+(i/(size-1)-.5)*width,wz=z+(j/(size-1)-.5)*width,index=j*size+i;field.mask[index]=component.rects.some(r=>contains(r,wx,wz,1e-6))?1:0;if(!field.mask[index])continue;
    const previous=old.find(v=>v.rects.some(r=>contains(r,wx,wz)));if(previous){field.height[index]=this.sample(previous,wx,wz);field.velocity[index]=this.sample(previous,wx,wz,previous.field.velocity);}
   }
   // Exact union rectangles keep even L-shaped boundaries flush with the ground.
   const positions=[],indices=[];
   for(const p of layout.bottom.filter(p=>component.rects.some(r=>contains(r,p.x,p.z)))){
    const nx=Math.max(1,Math.ceil(p.w/field.dx)),nz=Math.max(1,Math.ceil(p.d/field.dx)),base=positions.length/3;
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)positions.push(p.x-p.w/2+i/nx*p.w-x,0,p.z-p.d/2+j/nz*p.d-z);
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=base+j*(nx+1)+i;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
   }
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(positions.length),3));geometry.setIndex(indices);geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),Math.hypot(width/2,width/2,3));
   view.mesh=new THREE.Mesh(geometry,this.surfaceMaterial);view.mesh.position.set(x,-.19,z);view.mesh.receiveShadow=true;view.mesh.frustumCulled=false;view.mesh.userData.waterView=view;this.group.add(view.mesh);
   view.spray=new PoolSpray(field,this.waterMaterial);view.spray.mesh.position.copy(view.mesh.position);this.group.add(view.spray.mesh);this.views.push(view);this.updateMesh(view);
  }
  for(const v of old)v.spray.mesh.dispose();
 }
 at(x,z){return this.views.find(v=>v.rects.some(r=>contains(r,x,z)));}
 uv(view,p){return {u:(p.x-view.x)/view.width+.5,v:(p.z-view.z)/view.width+.5};}
 sample(view,x,z,data=view.field.height){
  const n=view.field.size,fx=Math.max(0,Math.min(n-1,((x-view.x)/view.width+.5)*(n-1))),fz=Math.max(0,Math.min(n-1,((z-view.z)/view.width+.5)*(n-1))),ix=Math.floor(fx),iz=Math.floor(fz),xx=Math.min(n-1,ix+1),zz=Math.min(n-1,iz+1),tx=fx-ix,tz=fz-iz;
  return (data[iz*n+ix]*(1-tx)+data[iz*n+xx]*tx)*(1-tz)+(data[zz*n+ix]*(1-tx)+data[zz*n+xx]*tx)*tz;
 }
 disturb(x,z,strength,radius=.12){const v=this.at(x,z);if(v){const uv=this.uv(v,{x,z});v.field.disturb(uv.u,uv.v,strength,radius);}}
 updateMesh(v){const a=v.mesh.geometry.attributes.position,n=v.mesh.geometry.attributes.normal,dx=v.field.dx;
  for(let i=0;i<a.count;i++){const x=a.getX(i)+v.x,z=a.getZ(i)+v.z;a.setY(i,this.sample(v,x,z));const sx=(this.sample(v,x-dx,z)-this.sample(v,x+dx,z))/(2*dx),sz=(this.sample(v,x,z-dx)-this.sample(v,x,z+dx))/(2*dx),length=Math.hypot(sx,1,sz);n.setXYZ(i,sx/length,1/length,sz/length);}
  a.needsUpdate=n.needsUpdate=true;v.spray.update();
 }
 step(dt,wind){for(const v of this.views){v.field.windVector=wind.sample(v.x,v.z);v.field.step(dt);this.updateMesh(v);}}
 reset(){for(const v of this.views){v.field.reset();this.updateMesh(v);}}
 read(){return {waterRegions:this.views.length,waveMax:Math.max(0,...this.views.map(v=>Math.max(...v.field.height))),waveMin:Math.min(0,...this.views.map(v=>Math.min(...v.field.height))),sprayCount:this.views.reduce((s,v)=>s+v.field.drops.length,0)};}
}
