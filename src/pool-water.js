import * as THREE from 'three';
import {WaveField} from './waves.js';

// Actual vertical surface displacement plus sparse spray under gravity.
// Spray returns momentum to the same field when it meets the moving surface.
export class PoolWater extends WaveField {
 constructor(size=129,width=5){super(size,width);this.impulseLimit=10;this.drops=[];this.emission=0;this.sprayDistance=0;this.returns=0;}
 surface(u,v){const x=Math.max(0,Math.min(this.size-1,Math.round(u*(this.size-1)))),z=Math.max(0,Math.min(this.size-1,Math.round(v*(this.size-1))));return this.height[z*this.size+x];}
 splash(u,v,strength=8){this.disturb(u,v,strength,.26);this.emit(u,v,Math.min(4.6,2+strength*.24));}
 emit(u,v,speed){
  for(let i=0;i<6;i++){
   const angle=(i/6+this.emission*.381966)*Math.PI*2,lateral=.35+(i%3)*.15;
   this.drops.push({x:(u-.5)*this.width,y:this.surface(u,v)+.035,z:(v-.5)*this.width,vx:Math.cos(angle)*lateral,vy:speed*(.8+i*.04),vz:Math.sin(angle)*lateral,age:0});
  }
  this.emission++;if(this.drops.length>96)this.drops.splice(0,this.drops.length-96);
 }
 stroke(from,to,seconds,pressure=1){
  if(!from||!to||seconds<=0)return;
  const distance=Math.hypot(to.u-from.u,to.v-from.v)*this.width,speed=Math.min(7,distance/Math.max(seconds,.001));
  // A raised bow wave, not a shader-only highlight or a purely downward wake.
  super.stroke(from,to,seconds,-1.8*pressure);
  const spacing=.24,previous=this.sprayDistance;this.sprayDistance+=distance;
  if(speed>1.2&&distance>0)for(let d=spacing-previous;d<=distance;d+=spacing){const t=d/distance,u=from.u+(to.u-from.u)*t,v=from.v+(to.v-from.v)*t;if(u>=0&&u<=1&&v>=0&&v<=1)this.emit(u,v,Math.min(4.4,1.3+speed*.48));}
  this.sprayDistance%=spacing;
 }
 integrate(){
  super.integrate();const dt=this.dt;
  this.drops=this.drops.filter(drop=>{
   const oldY=drop.y;drop.x+=drop.vx*dt;drop.z+=drop.vz*dt;drop.y+=drop.vy*dt-4.905*dt*dt;drop.vy-=9.81*dt;drop.age+=dt;
   const u=drop.x/this.width+.5,v=drop.z/this.width+.5,inside=u>=0&&u<=1&&v>=0&&v<=1&&(!this.mask||this.mask[Math.round(v*(this.size-1))*this.size+Math.round(u*(this.size-1))]),surface=inside?this.surface(u,v):.19;
   if(drop.vy<0&&drop.y<=surface){if(inside&&oldY>surface){this.disturb(u,v,-Math.min(.7,Math.abs(drop.vy)*.1),.065);this.returns++;}return false;}
   return drop.age<2;
  });
 }
 reset(){super.reset();this.drops=[];this.emission=0;this.sprayDistance=0;this.returns=0;}
}

export class PoolSpray {
 constructor(field,material){this.field=field;this.mesh=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.022),material,96);this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.castShadow=true;this.transform=new THREE.Object3D();this.update();}
 update(){this.mesh.count=this.field.drops.length;for(let i=0;i<this.mesh.count;i++){const d=this.field.drops[i];this.transform.position.set(d.x,d.y,d.z);this.transform.scale.set(1,1+Math.min(1,Math.abs(d.vy)*.18),1);this.transform.updateMatrix();this.mesh.setMatrixAt(i,this.transform.matrix);}this.mesh.instanceMatrix.needsUpdate=true;this.mesh.computeBoundingSphere();}
}
