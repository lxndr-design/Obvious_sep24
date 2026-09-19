import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function makeGrandma(R){
 const build=seated=>{
  const pieces=[],parts=[];
  const add=(g,x,y,z)=>{
   g.translate(x,y,z);const flat=g.index?g.toNonIndexed():g.clone();flat.deleteAttribute('uv');pieces.push(flat);
   parts.push({shape:new R.ConvexPolyhedron(new Float32Array(g.attributes.position.array)),offset:new THREE.Vector3()});g.dispose();
  };
  const box=(w,h,d,x,y,z)=>add(new THREE.BoxGeometry(w,h,d),x,y,z);
  const ball=(r,x,y,z)=>add(new THREE.IcosahedronGeometry(r,1),x,y,z);
  const limb=(a,b,r)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),g=new THREE.CylinderGeometry(r,r,delta.length(),6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));const p=start.add(end).multiplyScalar(.5);add(g,p.x,p.y,p.z);};
  // Local +Z is forward. Her cardigan, skirt, bun and glasses stay white.
  add(new THREE.CylinderGeometry(.19,.24,.43,8),0,.37,0);
  ball(.165,0,.72,.025);ball(.092,0,.83,-.09);
  add(new THREE.ConeGeometry(.055,.11,4).rotateX(Math.PI/2),0,.70,.19);
  for(const x of [-.072,.072])add(new THREE.TorusGeometry(.052,.010,4,8),x,.745,.177);
  box(.038,.016,.018,0,.745,.18);
  if(seated){
   box(.48,.20,.42,0,.10,.06);
   for(const x of [-.13,.13]){
    limb([x,.09,.1],[x,.09,.43],.065);
    limb([x,.05,.43],[x,-.67,.43],.052);
    box(.15,.09,.26,x,-.7225,.48);
   }
  }else{
   add(new THREE.CylinderGeometry(.22,.31,.72,8),0,-.17,0);
   for(const x of [-.13,.13]){limb([x,-.49,0],[x,-.69,0],.05);box(.15,.09,.26,x,-.735,.06);}
  }
  limb([-.20,.53,0],[-.29,.27,.11],.065);limb([-.29,.27,.11],[-.18,.20,.29],.055);
  limb([.20,.53,0],[.30,.31,.15],.065);limb([.30,.31,.15],[.24,.27,.41],.052);
  ball(.065,.24,.27,.41);ball(.065,-.18,.20,.29);
  box(.24,.29,.16,-.15,.16,.31); // seed bag held at her waist
  const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());geometry.computeBoundingBox();
  const center=(geometry.boundingBox.max.y+geometry.boundingBox.min.y)/2;geometry.translate(0,-center,0);geometry.computeBoundingBox();
  for(const part of parts)part.offset.y=-center;
  const height=geometry.boundingBox.max.y-geometry.boundingBox.min.y;
  return {geometry,parts,height,seated,seatY:-center,hand:new THREE.Vector3(.24,.27-center,.54),stacking:{foot:1,head:0,bottomY:geometry.boundingBox.min.y,headY:geometry.boundingBox.max.y,heads:[],points:[[-.13,.06],[.13,.06]]}};
 };
 const standing=build(false),sitting=build(true),grandmaForms={standing,sitting};return {...standing,grandmaForms};
}
export function setGrandmaPose(o,seated,collision){
 if(o.type!=='grandma')return;
 const form=o.grandmaForms[seated?'sitting':'standing'];
 Object.assign(o,form);o.mesh.geometry=form.geometry;if(o.debug)o.debug.geometry=form.geometry;
 collision?.prepared.delete(o);
}
export function grandmaPlacement(collision,o,x,z,groundOnly=false){
 const standing=o.grandmaForms.standing,sitting=o.grandmaForms.sitting;
 const probe=(form,position,rotation,support)=>{
  const candidate={...o,...form,mesh:{position,quaternion:rotation}};
  return collision.canPlace(candidate,position,rotation,new Set([o]))?{position,rotation,support,seated:form.seated}:null;
 };
 if(!groundOnly)for(const bench of collision.objects){
  if(bench.type!=='bench'||bench.hanging||new THREE.Vector3(0,1,0).applyQuaternion(bench.mesh.quaternion).y<.999)continue;
  const local=new THREE.Vector3(x-bench.mesh.position.x,0,z-bench.mesh.position.z).applyQuaternion(bench.mesh.quaternion.clone().invert());
  if(Math.abs(local.x)>.72||Math.abs(local.z)>.55)continue;
  const position=new THREE.Vector3(Math.round(local.x*2)/2,0,0).applyQuaternion(bench.mesh.quaternion).add(bench.mesh.position);
  position.y=bench.mesh.position.y+bench.stacking.headY-sitting.seatY;
  const placed=probe(sitting,position,bench.mesh.quaternion.clone(),bench);if(placed)return placed;
 }
 const rotation=o.mesh.quaternion.clone(),candidate={...o,...standing};
 const position=new THREE.Vector3(x,collision.supportY(candidate,x,z,rotation),z);
 return probe(standing,position,rotation,null);
}
export function applyGrandmaPlacement(o,placement,collision){
 setGrandmaPose(o,placement.seated,collision);o.mesh.position.copy(placement.position);o.mesh.quaternion.copy(placement.rotation);o.support=placement.support;
}
export function disposeGrandma(o){if(o.grandmaForms)for(const form of Object.values(o.grandmaForms))if(form.geometry!==o.geometry)form.geometry.dispose();}

export class GrandmaFeeding {
 constructor(random=Math.random){this.random=random;this.timers=new Map();this.busy=()=>false;this.scatters=0;}
 step(dt,objects,food){
  const present=new Set(objects.filter(o=>o.type==='grandma'));
  for(const o of this.timers.keys())if(!present.has(o))this.timers.delete(o);
  for(const o of present){
   let timer=this.timers.get(o)??(4+this.random()*3);
   if(o.hanging||this.busy(o)){this.timers.set(o,Math.max(timer,2));continue;}
   timer-=dt;
   if(timer<=0){
    const hand=o.hand.clone().applyQuaternion(o.mesh.quaternion).add(o.mesh.position),count=4+Math.floor(this.random()*4);
    for(let i=0;i<count;i++){
     const velocity=new THREE.Vector3((this.random()-.5)*.85,.35+this.random()*.4,.8+this.random()*.7).applyQuaternion(o.mesh.quaternion);
     food.drop(hand,{lift:0,velocity});
    }
    this.scatters++;timer=10+this.random()*8;
   }
   this.timers.set(o,timer);
  }
 }
 reset(){this.timers.clear();this.scatters=0;}
}
