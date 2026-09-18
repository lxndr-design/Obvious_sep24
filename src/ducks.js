import * as THREE from 'three';
import {seededRandom} from './birds.js';
import {contains} from './terrain.js';
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

export class DuckFlock {
 constructor(random=seededRandom(2701)){this.random=random;this.ducks=[];this.sequence=0;this.time=0;this.nextArrival=11;this.limit=4;this.target=null;this.nextMove=0;this.shoreVisit=false;}
 surface(terrain,p){const view=terrain?.at(p.x,p.z);return view?{view,y:view.mesh.position.y+terrain.sample(view,p.x,p.z)}:null;}
 shoreDistance(terrain,view,p){
  let nearest=Infinity;
  for(const r of view.rects){
   const x=THREE.MathUtils.clamp(p.x,r.x0,r.x1),z=THREE.MathUtils.clamp(p.z,r.z0,r.z1);
   for(const [px,pz,ox,oz]of [[r.x0,z,-.002,0],[r.x1,z,.002,0],[x,r.z0,0,-.002],[x,r.z1,0,.002]])if(!terrain.at(px+ox,pz+oz))nearest=Math.min(nearest,Math.hypot(p.x-px,p.z-pz));
  }
  return nearest;
 }
 clear(p,terrain,isClear){
  const water=this.surface(terrain,p),point=p.clone();point.y=water?water.y+.13:.18;
  return isClear(point,{kind:'pool'}, {scale:1.75});
 }
 connected(a,b,terrain,isClear){
  const steps=Math.max(1,Math.ceil(distance(a,b)/.12));
  for(let i=1;i<=steps;i++)if(!this.clear(a.clone().lerp(b,i/steps),terrain,isClear))return false;
  return true;
 }
 spawn(terrain,isClear){
  // Admission is atomic: a new flock needs two valid landing positions.
  const active=this.ducks.filter(d=>d.state!=='departing');
  const count=active.length>=2?1:2;if(this.ducks.length+count>this.limit)return false;
  for(const view of terrain?.views??[]){
   if(active.length&&this.surface(terrain,active[0].position)?.view!==view)continue;
   const points=[];
   for(let i=0;i<60&&points.length<count;i++){
    const rect=view.rects[Math.floor(this.random()*view.rects.length)];
    const p=new THREE.Vector3(THREE.MathUtils.lerp(rect.x0+.3,rect.x1-.3,this.random()),0,THREE.MathUtils.lerp(rect.z0+.3,rect.z1-.3,this.random()));
    if(!contains(rect,p.x,p.z,-.24)||!this.clear(p,terrain,isClear)||[...active.map(d=>d.position),...points].some(q=>distance(p,q)<.5))continue;
    if(active.length&&distance(p,active[0].position)>1.5)continue;
    const first=points[0]??active[0]?.position;if(first&&(distance(first,p)>1.5||!this.connected(first,p,terrain,isClear)))continue;
    p.y=this.surface(terrain,p).y+.10;points.push(p);
   }
   if(points.length!==count)continue;
   for(const p of points)this.ducks.push({id:++this.sequence,species:'duck',scale:.92+this.random()*.16,position:p,velocity:new THREE.Vector3(),yaw:this.random()*Math.PI*2,age:0,state:'arriving',opacity:0,stepPhase:0,swimming:true});
   this.target=points[0].clone();this.nextMove=this.time+2;this.nextArrival=this.time+18+this.random()*12;return true;
  }
  return false;
 }
 depart(){for(const d of this.ducks){if(d.state==='departing')continue;d.state='departing';d.age=0;d.departOpacity=d.opacity;}this.nextArrival=this.time+22;}
 chooseTarget(terrain,isClear){
  const lead=this.ducks[0],view=this.surface(terrain,lead.position)?.view??terrain.views.reduce((best,v)=>!best||Math.hypot(v.x-lead.position.x,v.z-lead.position.z)<Math.hypot(best.x-lead.position.x,best.z-lead.position.z)?v:best,null);
  if(!view)return false;this.shoreVisit=!this.shoreVisit;
  for(let i=0;i<32;i++){
   const rect=view.rects[Math.floor(this.random()*view.rects.length)];let p;
   if(this.shoreVisit){const side=Math.floor(this.random()*4),x=THREE.MathUtils.lerp(rect.x0+.25,rect.x1-.25,this.random()),z=THREE.MathUtils.lerp(rect.z0+.25,rect.z1-.25,this.random());p=new THREE.Vector3(side===0?rect.x0-.65:side===1?rect.x1+.65:x,0,side===2?rect.z0-.65:side===3?rect.z1+.65:z);if(terrain.at(p.x,p.z))continue;}
   else p=new THREE.Vector3(THREE.MathUtils.lerp(rect.x0+.3,rect.x1-.3,this.random()),0,THREE.MathUtils.lerp(rect.z0+.3,rect.z1-.3,this.random()));
   if(this.connected(lead.position,p,terrain,isClear)){this.target=p;return true;}
  }
  return false;
 }
 step(dt,terrain,pointer=null,isClear=()=>true){
  this.time+=dt;
  if(!terrain?.views.length){if(this.ducks.length)this.depart();}
  if(pointer&&this.ducks.some(d=>distance(d.position,pointer)<1.6))this.depart();
  if(this.ducks.length===1&&this.ducks[0].state!=='departing')this.depart();
  const lead=this.ducks[0];
  if(lead&&lead.state!=='departing'&&this.time>=this.nextMove){this.chooseTarget(terrain,isClear);this.nextMove=this.time+7+this.random()*5;}
  for(let i=0;i<this.ducks.length;i++){
   const d=this.ducks[i];d.age+=dt;
   if(d.state==='departing'){d.opacity=d.departOpacity*(1-smooth(d.age/3));continue;}
   if(!this.clear(d.position,terrain,isClear)){this.depart();break;}
   if(d.state==='arriving'){d.opacity=smooth(d.age/2.5);if(d.age>=2.5)d.state='swimming';}
   let target=this.target??d.position;
   if(i>0){const leader=this.ducks[i-1],side=i%2?1:-1;target=leader.position.clone().add(new THREE.Vector3(-Math.cos(leader.yaw)*.57+Math.sin(leader.yaw)*side*.28,0,Math.sin(leader.yaw)*.57+Math.cos(leader.yaw)*side*.28));if(!this.connected(d.position,target,terrain,isClear))target=leader.position;}
   const delta=target.clone().sub(d.position);delta.y=0;const gap=delta.length(),water=this.surface(terrain,d.position),speed=water?.36:.31;
   const wanted=gap>.15?delta.multiplyScalar(Math.min(speed,gap*.85)/Math.max(gap,.001)):new THREE.Vector3();
   // Separate smoothly when the leader turns back through its followers.
   for(const other of this.ducks){if(other===d)continue;const away=d.position.clone().sub(other.position);away.y=0;const separation=away.length();if(separation>.001&&separation<.6)wanted.addScaledVector(away,(.6-separation)*2/separation);}
   wanted.clampLength(0,speed);
   d.velocity.lerp(wanted,1-Math.exp(-3*dt));let next=d.position.clone().addScaledVector(d.velocity,dt);
   if(!this.clear(next,terrain,isClear)||this.ducks.some(other=>other!==d&&distance(next,other.position)<.34)){d.velocity.set(0,0,0);next=d.position.clone();}
   d.position.x=next.x;d.position.z=next.z;const surface=this.surface(terrain,d.position),shore=surface?this.shoreDistance(terrain,surface.view,d.position):0;d.swimming=!!surface&&shore>.12;
   // Walk smoothly up the shallow pool lip before crossing onto the floor.
   const y=surface?THREE.MathUtils.lerp(.18*d.scale,surface.y+.10*d.scale,smooth(shore/.30)):.18*d.scale;
   d.position.y=THREE.MathUtils.lerp(d.position.y,y,1-Math.exp(-9*dt));
   if(d.velocity.lengthSq()>.001){const yaw=Math.atan2(-d.velocity.z,d.velocity.x);d.yaw+=Math.atan2(Math.sin(yaw-d.yaw),Math.cos(yaw-d.yaw))*(1-Math.exp(-5*dt));d.stepPhase+=dt*9;}
   if(d.state!=='arriving')d.state=d.swimming?'swimming':'walking';
   if(surface){const pitch=(terrain.sample(surface.view,d.position.x+.12,d.position.z)-terrain.sample(surface.view,d.position.x-.12,d.position.z))/.24;d.tilt=THREE.MathUtils.clamp(pitch,-.12,.12);}else d.tilt=0;
  }
  this.ducks=this.ducks.filter(d=>d.state!=='departing'||d.age<3);
  if(this.time>=this.nextArrival&&this.ducks.length<this.limit&&!this.ducks.some(d=>d.state==='departing')){
   // Quiet pools admit pairs; subsequent singles join that same established flock.
   if(!pointer||!(terrain?.views??[]).some(v=>distance(pointer,{x:v.x,z:v.z})<2.5)){if(!this.spawn(terrain,isClear))this.nextArrival=this.time+3;}
  }
 }
 reset(){this.ducks=[];this.sequence=0;this.time=0;this.nextArrival=11;this.target=null;this.nextMove=0;this.shoreVisit=false;}
 read(){return this.ducks.map(d=>({id:d.id,species:'duck',scale:d.scale,state:d.state,position:d.position.toArray(),opacity:d.opacity}));}
}

export function duckMesh(){
 const group=new THREE.Group(),materials=[];
 const material=color=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85,flatShading:true,transparent:true,opacity:0});materials.push(m);return m;};
 const feather=material(0xf7f6f0),wingMaterial=material(0xb5b5af),billMaterial=material(0xc09a55),eyeMaterial=material(0x242726);
 const shape=new THREE.Shape();const outline=[[-.34,.09],[-.24,-.03],[-.02,-.06],[.17,0],[.18,.15],[.29,.19],[.30,.27],[.24,.32],[.14,.30],[.11,.16],[-.04,.13],[-.24,.12]];shape.moveTo(...outline[0]);for(const p of outline.slice(1))shape.lineTo(...p);shape.closePath();
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:.19,bevelEnabled:false,steps:1,curveSegments:1});geometry.translate(0,0,-.095);const body=new THREE.Mesh(geometry,feather);group.add(body);
 const bill=new THREE.Mesh(new THREE.BoxGeometry(.14,.035,.11),billMaterial);bill.position.set(.34,.205,0);group.add(bill);
 const wings=[];for(const sign of [-1,1]){const wing=new THREE.Mesh(new THREE.SphereGeometry(1,6,3),wingMaterial);wing.scale.set(.19,.065,.022);wing.position.set(-.07,.055,sign*.098);group.add(wing);wings.push(wing);const eye=new THREE.Mesh(new THREE.CircleGeometry(.013,6),eyeMaterial);eye.position.set(.239,.26,sign*.096);eye.rotation.y=sign>0?0:Math.PI;group.add(eye);}
 const feet=[];for(const z of [-.062,.062]){const foot=new THREE.Mesh(new THREE.BoxGeometry(.115,.022,.07),billMaterial);foot.position.set(.055,-.169,z);group.add(foot);feet.push(foot);}
 group.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});return {group,feet,materials};
}
