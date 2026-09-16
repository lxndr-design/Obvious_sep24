import * as THREE from 'three';
import {WaveField} from './waves.js';
import {BATH} from './furnishings.js';

// A circular, displaced shallow-water surface and short-lived ballistic spray.
export class BathWater {
 constructor(object){
  this.object=object;this.group=new THREE.Group();object.mesh.add(this.group);
  this.group.position.y=BATH.waterY-object.height/2;
  this.field=new WaveField(33,BATH.waterRadius*2);this.field.energy=0;this.field.speed=1.1;this.field.damping=2.8;
  this.geometry=new THREE.PlaneGeometry(this.field.width,this.field.width,32,32);this.geometry.rotateX(-Math.PI/2);
  const a=this.geometry.attributes.position,mask=new Uint8Array(a.count);
  for(let i=0;i<a.count;i++)mask[i]=Math.hypot(a.getX(i),a.getZ(i))<=BATH.waterRadius;
  this.field.mask=mask;
  const indices=this.geometry.index.array,clipped=[];
  for(let i=0;i<indices.length;i+=3)if(mask[indices[i]]&&mask[indices[i+1]]&&mask[indices[i+2]])clipped.push(indices[i],indices[i+1],indices[i+2]);
  this.geometry.setIndex(clipped);this.geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),BATH.waterRadius+.1);
  this.material=new THREE.MeshPhongMaterial({color:0x8c8c8c,specular:0xffffff,shininess:100,transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.receiveShadow=true;this.group.add(this.mesh);
  this.spray=new THREE.InstancedMesh(new THREE.SphereGeometry(.014,6,4),this.material,48);this.spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.spray.frustumCulled=false;this.group.add(this.spray);
  this.drops=[];this.cursor=0;this.transform=new THREE.Object3D();this.splashCount=0;this.update(0,new THREE.Vector3());
 }
 splash(worldPosition){
  this.object.mesh.updateWorldMatrix(true,false);const p=this.object.mesh.worldToLocal(worldPosition.clone());
  this.field.disturb(p.x/this.field.width+.5,p.z/this.field.width+.5,-.65,.075);this.splashCount++;
  for(let i=0;i<6;i++){
   const angle=(i/6+this.splashCount*.381966)*Math.PI*2,speed=.25+(i%3)*.13;
   this.drops[this.cursor]={position:new THREE.Vector3(p.x,.025,p.z),velocity:new THREE.Vector3(Math.cos(angle)*speed,.85+(i%2)*.35,Math.sin(angle)*speed),age:0};this.cursor=(this.cursor+1)%48;
  }
 }
 update(dt,wind){
  this.field.windVector=wind.clone().multiplyScalar(.04);this.field.step(dt);
  const a=this.geometry.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,this.field.height[i]);a.needsUpdate=true;this.geometry.computeVertexNormals();
  for(let i=0;i<48;i++){
   const drop=this.drops[i];let visible=false;
   if(drop){drop.age+=dt;drop.velocity.y-=9.81*dt;drop.position.addScaledVector(drop.velocity,dt);visible=drop.age<.5&&drop.position.y>0;if(!visible)this.drops[i]=null;}
   this.transform.position.copy(visible?drop.position:new THREE.Vector3());this.transform.scale.setScalar(visible?1:0);this.transform.updateMatrix();this.spray.setMatrixAt(i,this.transform.matrix);
  }
  this.spray.instanceMatrix.needsUpdate=true;
 }
 reset(){this.field.reset();this.drops=[];this.splashCount=0;this.update(0,new THREE.Vector3());}
 dispose(){this.group.removeFromParent();this.geometry.dispose();this.spray.geometry.dispose();this.material.dispose();this.spray.dispose();}
}
