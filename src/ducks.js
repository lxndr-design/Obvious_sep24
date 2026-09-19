import * as THREE from 'three';
import {seededRandom} from './birds.js';
import {contains} from './terrain.js';
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

export class DuckFlock {
 constructor(random=seededRandom(2701)){this.random=random;this.ducks=[];this.sequence=0;this.time=0;this.nextArrival=11;this.limit=4;this.target=null;this.nextMove=0;this.shoreVisit=false;this.habitatUntil=0;}
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
 connected(a,b,terrain,isClear,medium=null){
  const steps=Math.max(1,Math.ceil(distance(a,b)/.12));
  for(let i=1;i<=steps;i++){const p=a.clone().lerp(b,i/steps);if(!this.clear(p,terrain,isClear)||medium&&!!terrain.at(p.x,p.z)!==(medium==='water'))return false;}
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
   for(const p of points)this.ducks.push({id:++this.sequence,species:'duck',scale:.92+this.random()*.16,position:p,velocity:new THREE.Vector3(),yaw:this.random()*Math.PI*2,age:0,state:'arriving',opacity:0,stepPhase:0,swimming:true,medium:'water',dabbleAt:this.time+6+this.random()*9,dabbleAngle:0});
   if(!active.length){this.target=points[0].clone();this.shoreVisit=false;this.habitatUntil=this.time+25+this.random()*15;}this.nextMove=this.time+2;this.nextArrival=this.time+18+this.random()*12;return true;
  }
  return false;
 }
 depart(){for(const d of this.ducks){if(d.state==='departing')continue;d.state='departing';d.age=0;d.departOpacity=d.opacity;}this.nextArrival=this.time+22;}
 chooseTarget(terrain,isClear){
  const lead=this.ducks[0],view=this.surface(terrain,lead.position)?.view??terrain.views.reduce((best,v)=>!best||Math.hypot(v.x-lead.position.x,v.z-lead.position.z)<Math.hypot(best.x-lead.position.x,best.z-lead.position.z)?v:best,null);
  if(!view)return false;
  const changing=this.time>=this.habitatUntil;const shoreVisit=changing?!this.shoreVisit:this.shoreVisit;
  for(let i=0;i<32;i++){
   const rect=view.rects[Math.floor(this.random()*view.rects.length)];let p;
   if(shoreVisit){const side=Math.floor(this.random()*4),x=THREE.MathUtils.lerp(rect.x0+.25,rect.x1-.25,this.random()),z=THREE.MathUtils.lerp(rect.z0+.25,rect.z1-.25,this.random());p=new THREE.Vector3(side===0?rect.x0-.65:side===1?rect.x1+.65:x,0,side===2?rect.z0-.65:side===3?rect.z1+.65:z);if(terrain.at(p.x,p.z))continue;}
   else p=new THREE.Vector3(THREE.MathUtils.lerp(rect.x0+.3,rect.x1-.3,this.random()),0,THREE.MathUtils.lerp(rect.z0+.3,rect.z1-.3,this.random()));
   if(this.connected(lead.position,p,terrain,isClear,changing?null:shoreVisit?'land':'water')){this.target=p;if(changing){this.shoreVisit=shoreVisit;this.habitatUntil=this.time+28+this.random()*20;}return true;}
  }
  return false;
 }
 beginHop(d,next,terrain,isClear){
  const direction=next.clone().sub(d.position);direction.y=0;if(direction.lengthSq()<1e-10)return false;direction.normalize();
  const from=d.position.clone(),entering=d.medium==='land';
  for(const length of [.38,.5,.65]){
   const to=from.clone().addScaledVector(direction,length),water=this.surface(terrain,to);
   if(!!water!==entering||!this.clear(to,terrain,isClear)||this.ducks.some(other=>other!==d&&distance(to,other.position)<.36))continue;
   to.y=water?water.y+.10*d.scale:.18*d.scale;
   // Check the raised arc against objects, including geometry above a pool lip.
   let valid=true;for(let i=1;i<=8;i++){const t=i/8,p=from.clone().lerp(to,t);p.y+=Math.sin(t*Math.PI)*.24;if(!isClear(p,{kind:'pool'},{scale:1.75})){valid=false;break;}}
   if(!valid)continue;
   d.hop={from,to,age:0,entering};d.state=entering?'entering-water':'leaving-water';d.velocity.set(0,0,0);d.dabbleAngle=0;return true;
  }
  return false;
 }
 updateHop(d,dt,terrain,isClear){
  const h=d.hop;h.age+=dt;const t=Math.min(1,h.age/.62),p=h.from.clone().lerp(h.to,smooth(t));p.y+=Math.sin(t*Math.PI)*.24*d.scale;
  if(!isClear(p,{kind:'pool'},{scale:1.75})){d.position.copy(h.from);d.hop=null;d.state=d.medium==='water'?'swimming':'walking';return;}
  d.position.copy(p);
  if(t===1){d.medium=this.surface(terrain,p)?'water':'land';d.swimming=d.medium==='water';d.state=d.swimming?'swimming':'walking';d.hop=null;d.dabbleAt=this.time+7+this.random()*10;}
 }
 updateDabble(d,dt,water){
  d.dabbleAge=(d.dabbleAge??0)+dt;const t=d.dabbleAge;
  // Forward is local +X: rotating about local Z puts the bill below the surface.
  const riseAt=.35+d.dabbleHold;
  const amount=t<.35?smooth(t/.35):t<riseAt?1:1-smooth((t-riseAt)/.4);
  d.dabbleAngle=-Math.PI/2*amount;d.position.y=water.y+.10*d.scale-.045*amount;d.velocity.set(0,0,0);
  if(t>=riseAt+.4){d.state='swimming';d.dabbleAngle=0;d.dabbleAge=0;d.dabbleAt=this.time+9+this.random()*12;}
 }
 step(dt,terrain,pointer=null,isClear=()=>true){
  this.time+=dt;
  if(!terrain?.views.length){if(this.ducks.length)this.depart();}
  if(pointer&&this.ducks.some(d=>distance(d.position,pointer)<1.6))this.depart();
  if(this.ducks.length===1&&this.ducks[0].state!=='departing')this.depart();
  const lead=this.ducks[0];
  if(lead&&!['departing','dabbling','entering-water','leaving-water'].includes(lead.state)&&this.time>=this.nextMove){this.chooseTarget(terrain,isClear);this.nextMove=this.time+7+this.random()*5;}
  for(let i=0;i<this.ducks.length;i++){
   const d=this.ducks[i];d.age+=dt;
   if(d.state==='departing'){d.opacity=d.departOpacity*(1-smooth(d.age/3));continue;}
   if(!this.clear(d.position,terrain,isClear)){this.depart();break;}
   if(d.hop){this.updateHop(d,dt,terrain,isClear);continue;}
   const currentWater=this.surface(terrain,d.position);
   if(d.medium==='water'&&!currentWater){d.medium='land';d.swimming=false;d.state='walking';d.dabbleAngle=0;if(i===0){this.shoreVisit=true;this.habitatUntil=this.time+12;this.nextMove=this.time;}}
   if(d.state==='dabbling'&&currentWater){this.updateDabble(d,dt,currentWater);continue;}
   if(d.state==='arriving'){d.opacity=smooth(d.age/2.5);if(d.age>=2.5)d.state='swimming';}
   if(d.state==='swimming'&&currentWater&&this.time>=d.dabbleAt&&this.shoreDistance(terrain,currentWater.view,d.position)>.3){d.state='dabbling';d.dabbleAge=0;d.dabbleHold=3+this.random()*2;this.updateDabble(d,dt,currentWater);continue;}
   let target=this.target??d.position;
   if(i>0){const leader=this.ducks[i-1],side=i%2?1:-1;target=leader.position.clone().add(new THREE.Vector3(-Math.cos(leader.yaw)*.57+Math.sin(leader.yaw)*side*.28,0,Math.sin(leader.yaw)*.57+Math.cos(leader.yaw)*side*.28));if(!this.connected(d.position,target,terrain,isClear)||!!terrain.at(target.x,target.z)!==!this.shoreVisit)target=leader.position;}
   const delta=target.clone().sub(d.position);delta.y=0;const gap=delta.length(),water=this.surface(terrain,d.position),speed=water?.36:.31;
   const wanted=gap>.15?delta.multiplyScalar(Math.min(speed,gap*.85)/Math.max(gap,.001)):new THREE.Vector3();
   // Separate smoothly when the leader turns back through its followers.
   for(const other of this.ducks){if(other===d)continue;const away=d.position.clone().sub(other.position);away.y=0;const separation=away.length();if(separation>.001&&separation<.6)wanted.addScaledVector(away,(.6-separation)*2/separation);}
   wanted.clampLength(0,speed);
   d.velocity.lerp(wanted,1-Math.exp(-3*dt));let next=d.position.clone().addScaledVector(d.velocity,dt);
   if(!this.clear(next,terrain,isClear)||this.ducks.some(other=>other!==d&&distance(next,other.position)<.34)){d.velocity.set(0,0,0);next=d.position.clone();}
   const nextWater=this.surface(terrain,next),changingMedium=!!nextWater!==(d.medium==='water');
   // Anticipate the bank, so the body clears the lip instead of sliding through it.
   const ahead=next.clone().addScaledVector(d.velocity.clone().normalize(),.16),aheadWater=this.surface(terrain,ahead);
   if(changingMedium||!!aheadWater!==(d.medium==='water')){
    if((this.shoreVisit&&d.medium==='water'||!this.shoreVisit&&d.medium==='land')&&this.beginHop(d,ahead,terrain,isClear))continue;
    d.velocity.set(0,0,0);next=d.position.clone();
   }
   d.position.x=next.x;d.position.z=next.z;const surface=this.surface(terrain,d.position);d.swimming=d.medium==='water';
   const y=surface&&d.swimming?surface.y+.10*d.scale:.18*d.scale;
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
 reset(){this.ducks=[];this.sequence=0;this.time=0;this.nextArrival=11;this.target=null;this.nextMove=0;this.shoreVisit=false;this.habitatUntil=0;}
 read(){return this.ducks.map(d=>({id:d.id,species:'duck',scale:d.scale,state:d.state,medium:d.medium,dabbleAngle:d.dabbleAngle,position:d.position.toArray(),opacity:d.opacity}));}
}

export function duckMesh(){
 const group=new THREE.Group(),materials=[];
 const material=color=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85,flatShading:true,transparent:true,opacity:0});materials.push(m);return m;};
 const feather=material(0x96978c),breast=material(0x704332),head=material(0x246447),collar=material(0xe8e2cd);
 const wingMaterial=material(0x655b4b),speculum=material(0x345895),billMaterial=material(0xd4a638),footMaterial=material(0xc97832),eyeMaterial=material(0x171a15);
 const solid=(outline,depth,mat,z=0)=>{
  const shape=new THREE.Shape();shape.moveTo(...outline[0]);for(const p of outline.slice(1))shape.lineTo(...p);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1,curveSegments:1});geometry.translate(0,0,z-depth/2);
  const mesh=new THREE.Mesh(geometry,mat);group.add(mesh);return mesh;
 };
 // Adjacent silhouette sections keep the low-poly body continuous while giving
 // the mallard its gray flanks, chestnut breast, pale collar and green head.
 const flankLow=-.06+(.075+.02)/(.17+.02)*.06,flankHigh=.13+(.075+.04)/(.11+.04)*.03;
 solid([[-.34,.09],[-.24,-.03],[-.02,-.06],[.075,flankLow],[.075,flankHigh],[-.04,.13],[-.24,.12]],.19,feather);
 const neckLeft=y=>.11+(y-.16)/(.30-.16)*.03,neckRight=y=>.29+(y-.19)/(.27-.19)*.01;
 solid([[.075,flankLow],[.17,0],[.18,.15],[.29,.19],[neckLeft(.19),.19],[.11,.16],[.075,flankHigh]],.19,breast);
 solid([[neckLeft(.19),.19],[.29,.19],[neckRight(.207),.207],[neckLeft(.207),.207]],.19,collar);
 solid([[neckLeft(.207),.207],[neckRight(.207),.207],[.30,.27],[.24,.32],[.14,.30]],.19,head);
 const bill=new THREE.Mesh(new THREE.BoxGeometry(.14,.035,.11),billMaterial);bill.position.set(.34,.205,0);group.add(bill);
 const wings=[];
 for(const sign of [-1,1]){
  // A broad shoulder folds back to a narrow feather tip; no oval wing lobes.
  const wing=solid([[.095,.077],[.045,.118],[-.095,.11],[-.285,.035],[-.14,.012],[-.005,.01],[.075,.037]],.018,wingMaterial,sign*.103);wings.push(wing);
  solid([[-.11,.034],[-.19,.052],[-.145,.076],[-.065,.057]],.003,speculum,sign*.114);
  const eye=new THREE.Mesh(new THREE.CircleGeometry(.013,6),eyeMaterial);eye.position.set(.239,.26,sign*.096);eye.rotation.y=sign>0?0:Math.PI;group.add(eye);
 }
 const feet=[];for(const z of [-.062,.062]){const foot=new THREE.Mesh(new THREE.BoxGeometry(.115,.022,.07),footMaterial);foot.position.set(.055,-.169,z);group.add(foot);feet.push(foot);}
 group.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});return {group,feet,wings,materials};
}
