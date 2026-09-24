import {scheduleFlee} from './bird-fear.js';
import * as THREE from 'three';
import {seededRandom} from './birds.js';
import {contains} from './terrain.js';
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

export const DUCK_VARIANTS={
 mallard:{name:'Mallard',feather:0x96978c,breast:0x704332,head:0x246447,collar:0xe8e2cd,wing:0x655b4b,patch:0x345895,bill:0xd4a638,foot:0xc97832,eye:0x171a15},
 wood:{name:'Wood duck',feather:0xba946a,breast:0x743c35,head:0x245c50,collar:0xf2e9d8,wing:0x293e46,patch:0x376897,bill:0xcf5d45,foot:0xc48340,eye:0xe76535},
 mandarin:{name:'Mandarin duck',feather:0xd3aa68,breast:0x65415c,head:0x426052,collar:0xf4e6cd,wing:0x805840,patch:0x394c7b,bill:0xbe4940,foot:0xd59740,eye:0x1c211d},
 coot:{name:'Coot',feather:0x333b3d,breast:0x293133,head:0x1c2529,collar:0x1c2529,wing:0x414b4d,patch:null,bill:0xe8e5d6,foot:0x7c8260,eye:0x994436},
 white:{name:'White duck',feather:0xf5f3e9,breast:0xf5f3e9,head:0xf9f7ed,collar:0xf5f3e9,wing:0xe5e4da,patch:null,bill:0xe7a13c,foot:0xda8a30,eye:0x24251f}
};
const duckTypes=Object.keys(DUCK_VARIANTS);
const flockPosition=d=>d.state==='arriving'?d.flightTo:d.position;
export class DuckFlock {
 constructor(random=seededRandom(2701)){this.random=random;this.variantRandom=seededRandom(421);this.temperamentRandom=seededRandom(915);this.ducks=[];this.sequence=0;this.time=0;this.nextArrival=11;this.limit=4;this.target=null;this.nextMove=0;this.shoreVisit=false;this.habitatUntil=0;}
 nextVariant(){const choices=duckTypes.filter(type=>!this.ducks.some(d=>d.variant===type));const available=choices.length?choices:duckTypes;return available[Math.floor(this.variantRandom()*available.length)];}
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
   if(active.length&&this.surface(terrain,flockPosition(active[0]))?.view!==view)continue;
   const points=[];
   for(let i=0;i<60&&points.length<count;i++){
    const rect=view.rects[Math.floor(this.random()*view.rects.length)];
    const p=new THREE.Vector3(THREE.MathUtils.lerp(rect.x0+.3,rect.x1-.3,this.random()),0,THREE.MathUtils.lerp(rect.z0+.3,rect.z1-.3,this.random()));
    if(!contains(rect,p.x,p.z,-.24)||!this.clear(p,terrain,isClear)||[...active.map(flockPosition),...points].some(q=>distance(p,q)<.5))continue;
    if(active.length&&distance(p,flockPosition(active[0]))>1.5)continue;
    const first=points[0]??(active[0]&&flockPosition(active[0]));if(first&&(distance(first,p)>1.5||!this.connected(first,p,terrain,isClear)))continue;
    p.y=this.surface(terrain,p).y+.10;points.push(p);
   }
   if(points.length!==count)continue;
   for(const p of points){
    const d={id:++this.sequence,species:'duck',caution:this.temperamentRandom(),variant:this.nextVariant(),scale:.92+this.random()*.16,position:p.clone(),velocity:new THREE.Vector3(),yaw:this.random()*Math.PI*2,age:0,state:'arriving',opacity:0,stepPhase:0,swimming:false,medium:'air',dabbleAt:this.time+6+this.random()*9,dabbleAngle:0};
    d.flightTo=p.clone();d.flightTo.y=this.surface(terrain,p).y+.10*d.scale;
    d.flightFrom=d.flightTo.clone().add(new THREE.Vector3(-2.2,3.2,-1.4));d.position.copy(d.flightFrom);d.yaw=Math.atan2(-1.4,2.2);
    this.ducks.push(d);
   }
   if(!active.length){this.target=points[0].clone();this.shoreVisit=false;this.habitatUntil=this.time+25+this.random()*15;}this.nextMove=this.time+2;this.nextArrival=this.time+18+this.random()*12;return true;
  }
  return false;
 }
 scare(threat=null){
  for(const d of this.ducks)scheduleFlee(d,this.time,threat,this.temperamentRandom);
  this.nextArrival=Math.max(this.nextArrival,this.time+22);
 }
 departOne(d,threat=null){
  if(d.state==='departing')return;
  const away=threat?d.position.clone().sub(threat):new THREE.Vector3(Math.cos(d.yaw),0,-Math.sin(d.yaw));away.y=0;
  if(away.lengthSq()<.01)away.set(-1,0,1);away.normalize();
  d.flightFrom=d.position.clone();d.flightTo=d.position.clone().addScaledVector(away,3.8);d.flightTo.y+=3.8;
  d.flightYaw=Math.atan2(-away.z,away.x);d.state='departing';d.age=0;d.departOpacity=d.opacity;d.hop=null;d.dabbleAngle=0;d.tilt=0;d.swimming=false;d.medium='air';d.fleeAt=null;d.fleeThreat=null;
 }
 depart(threat=null){for(const d of this.ducks)this.departOne(d,threat);this.nextArrival=this.time+22;}
 updateFlight(d,dt,terrain){
  const arriving=d.state==='arriving',t=Math.min(1,d.age/3),previous=d.position.clone();
  if(arriving){
   const water=this.surface(terrain,d.flightTo);if(!water){this.depart();return;}
   d.flightTo.y=water.y+.10*d.scale;
   // Arrive above the landing patch before easing down onto the water.
   d.position.lerpVectors(d.flightFrom,d.flightTo,smooth(Math.min(1,t/.78)));
   d.position.y=THREE.MathUtils.lerp(d.flightFrom.y,d.flightTo.y,smooth(t));
   d.opacity=smooth(t/.65);
   if(t===1){d.state='swimming';d.medium='water';d.swimming=true;d.velocity.set(0,0,0);d.flightPitch=0;return;}
  }else{
   // Rise first, then accelerate away from the pointer while fading out.
   d.position.lerpVectors(d.flightFrom,d.flightTo,t*t);
   d.position.y=THREE.MathUtils.lerp(d.flightFrom.y,d.flightTo.y,Math.sin(t*Math.PI/2));
   d.opacity=d.departOpacity*(1-smooth((t-.18)/.82));
   d.yaw+=Math.atan2(Math.sin(d.flightYaw-d.yaw),Math.cos(d.flightYaw-d.yaw))*(1-Math.exp(-9*dt));
  }
  d.velocity.copy(d.position).sub(previous).multiplyScalar(1/Math.max(dt,.001));d.flightPitch=arriving?-.12:.20;
 }
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
  if(pointer&&this.ducks.some(d=>d.state!=='departing'&&distance(d.position,pointer)<1.6))this.scare(pointer);
  if(this.ducks.length===1&&this.ducks[0].state!=='departing')this.depart();
  const lead=this.ducks[0];
  if(lead&&lead.fleeAt==null&&!['arriving','departing','dabbling','entering-water','leaving-water'].includes(lead.state)&&this.time>=this.nextMove){this.chooseTarget(terrain,isClear);this.nextMove=this.time+7+this.random()*5;}
  for(let i=0;i<this.ducks.length;i++){
   const d=this.ducks[i];if(d.fleeAt!=null&&this.time>=d.fleeAt)this.departOne(d,d.fleeThreat);d.age+=dt;
   if(d.state==='arriving'||d.state==='departing'){
    if(d.state==='arriving'&&!this.clear(d.flightTo,terrain,isClear))this.depart();
    this.updateFlight(d,dt,terrain);continue;
   }
   if(!this.clear(d.position,terrain,isClear)){this.depart();break;}
   if(d.hop){this.updateHop(d,dt,terrain,isClear);continue;}
   const currentWater=this.surface(terrain,d.position);
   if(d.medium==='water'&&!currentWater){d.medium='land';d.swimming=false;d.state='walking';d.dabbleAngle=0;if(i===0){this.shoreVisit=true;this.habitatUntil=this.time+12;this.nextMove=this.time;}}
   if(d.state==='dabbling'&&currentWater){this.updateDabble(d,dt,currentWater);continue;}
   if(d.state==='swimming'&&currentWater&&this.time>=d.dabbleAt&&this.shoreDistance(terrain,currentWater.view,d.position)>.3){d.state='dabbling';d.dabbleAge=0;d.dabbleHold=3+this.random()*2;this.updateDabble(d,dt,currentWater);continue;}
   if(d.fleeAt!=null){d.velocity.set(0,0,0);continue;}
   let target=this.target??d.position;
   if(i>0){
    const leader=this.ducks[i-1],gap=distance(d.position,leader.position);
    // Hold a waypoint until reached; chasing a rotating tail offset caused orbiting.
    if(!d.followTarget||distance(d.followTarget,leader.position)>1.15||!!terrain.at(d.followTarget.x,d.followTarget.z)!==!this.shoreVisit){
     const behind=d.position.clone().sub(leader.position);behind.y=0;if(behind.lengthSq()<.001)behind.set(-1,0,0);
     d.followTarget=leader.position.clone().addScaledVector(behind.normalize(),.65);
    }
    target=gap<.8&&leader.velocity.lengthSq()<.005?d.position:d.followTarget;
    if(!this.connected(d.position,target,terrain,isClear))target=d.position;
   }
   const delta=target.clone().sub(d.position);delta.y=0;const gap=delta.length(),water=this.surface(terrain,d.position),speed=water?.36:.31;
   const wanted=gap>.15?delta.multiplyScalar(Math.min(speed,gap*.85)/Math.max(gap,.001)):new THREE.Vector3();
   // Separate smoothly when the leader turns back through its followers.
   for(const other of this.ducks){if(other===d)continue;const away=d.position.clone().sub(other.position);away.y=0;const separation=away.length();if(separation>.001&&separation<.6)wanted.addScaledVector(away,(.6-separation)*2/separation);}
   wanted.clampLength(0,speed);
   d.velocity.lerp(wanted,1-Math.exp(-3*dt));let next=d.position.clone().addScaledVector(d.velocity,dt);
   if(gap<.18&&wanted.lengthSq()<.001){d.velocity.set(0,0,0);next=d.position.clone();}
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
   if(d.velocity.lengthSq()>.001){const yaw=Math.atan2(-d.velocity.z,d.velocity.x);d.yaw+=Math.atan2(Math.sin(yaw-d.yaw),Math.cos(yaw-d.yaw))*(1-Math.exp(-5*dt));d.stepPhase+=d.velocity.length()*dt*28;}
   if(d.state!=='arriving')d.state=d.swimming?'swimming':'walking';
   if(surface){const pitch=(terrain.sample(surface.view,d.position.x+.12,d.position.z)-terrain.sample(surface.view,d.position.x-.12,d.position.z))/.24;d.tilt=THREE.MathUtils.clamp(pitch,-.12,.12);}else d.tilt=0;
  }
  this.ducks=this.ducks.filter(d=>d.state!=='departing'||d.age<3);
  if(this.time>=this.nextArrival&&this.ducks.length<this.limit&&!this.ducks.some(d=>d.state==='departing')){
   // Quiet pools admit pairs; subsequent singles join that same established flock.
   if(!pointer||!(terrain?.views??[]).some(v=>distance(pointer,{x:v.x,z:v.z})<2.5)){if(!this.spawn(terrain,isClear))this.nextArrival=this.time+3;}
  }
 }
 reset(){this.variantRandom=seededRandom(421);this.temperamentRandom=seededRandom(915);this.ducks=[];this.sequence=0;this.time=0;this.nextArrival=11;this.target=null;this.nextMove=0;this.shoreVisit=false;this.habitatUntil=0;}
 read(){return this.ducks.map(d=>({id:d.id,species:'duck',variant:d.variant,variantName:DUCK_VARIANTS[d.variant]?.name,scale:d.scale,caution:d.caution,bravery:1-(d.caution??.5),fleeIn:d.fleeAt==null?null:Math.max(0,d.fleeAt-this.time),state:d.state,medium:d.medium,dabbleAngle:d.dabbleAngle,position:d.position.toArray(),opacity:d.opacity}));}
}

export function duckMesh(variant='mallard'){
 const palette=DUCK_VARIANTS[variant]??DUCK_VARIANTS.mallard;
 const group=new THREE.Group(),materials=[];
 const material=color=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85,flatShading:true,transparent:true,opacity:0});materials.push(m);return m;};
 const feather=material(palette.feather),breast=material(palette.breast),head=material(palette.head),collar=material(palette.collar);
 const wingMaterial=material(palette.wing),speculum=palette.patch===null?null:material(palette.patch),billMaterial=material(palette.bill),footMaterial=material(palette.foot),eyeMaterial=material(palette.eye);
 const solid=(outline,depth,mat,z=0)=>{
  const shape=new THREE.Shape();shape.moveTo(...outline[0]);for(const p of outline.slice(1))shape.lineTo(...p);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1,curveSegments:1});geometry.translate(0,0,z-depth/2);
  const mesh=new THREE.Mesh(geometry,mat);group.add(mesh);return mesh;
 };
 // Adjacent silhouette sections keep the low-poly body continuous while giving
 // each variety its own flank, breast, collar and head markings.
 const flankLow=-.06+(.075+.02)/(.17+.02)*.06,flankHigh=.13+(.075+.04)/(.11+.04)*.03;
 solid([[-.34,.09],[-.24,-.03],[-.02,-.06],[.075,flankLow],[.075,flankHigh],[-.04,.13],[-.24,.12]],.19,feather);
 const neckLeft=y=>.11+(y-.16)/(.30-.16)*.03,neckRight=y=>.29+(y-.19)/(.27-.19)*.01;
 solid([[.075,flankLow],[.17,0],[.18,.15],[.29,.19],[neckLeft(.19),.19],[.11,.16],[.075,flankHigh]],.19,breast);
 solid([[neckLeft(.19),.19],[.29,.19],[neckRight(.207),.207],[neckLeft(.207),.207]],.19,collar);
 solid([[neckLeft(.207),.207],[neckRight(.207),.207],[.30,.27],[.24,.32],[.14,.30]],.19,head);
 const bill=new THREE.Mesh(new THREE.BoxGeometry(variant==='coot'?.10:.14,.035,variant==='coot'?.065:.11),billMaterial);bill.position.set(.34,.205,0);group.add(bill);
 const wings=[];
 const mountWing=(mesh,pivot)=>{pivot.add(mesh);mesh.position.sub(pivot.position);return mesh;};
 for(const sign of [-1,1]){
  // A broad shoulder folds back to a narrow feather tip; no oval wing lobes.
  const pivot=new THREE.Group();pivot.position.set(.065,.1,sign*.103);group.add(pivot);wings.push(pivot);
  mountWing(solid([[.095,.077],[.045,.118],[-.095,.11],[-.285,.035],[-.14,.012],[-.005,.01],[.075,.037]],.018,wingMaterial,sign*.103),pivot);
  if(speculum)mountWing(solid([[-.11,.034],[-.19,.052],[-.145,.076],[-.065,.057]],.003,speculum,sign*.114),pivot);
  const eye=new THREE.Mesh(new THREE.CircleGeometry(.013,6),eyeMaterial);eye.position.set(.239,.26,sign*.096);eye.rotation.y=sign>0?0:Math.PI;group.add(eye);
 }
 if(variant==='wood'||variant==='mandarin'){
  solid([[.245,.31],[.15,.34],[.005,.23],[.11,.245],[.15,.29]],.20,head);
  const cheek=variant==='mandarin'?material(0xd9943e):collar;
  for(const sign of [-1,1]){
   if(variant==='wood'){
    solid([[.27,.294],[.13,.309],[.065,.263],[.14,.29],[.27,.282]],.003,collar,sign*.102);
    solid([[.245,.225],[.195,.22],[.158,.257],[.151,.23],[.188,.202],[.25,.213]],.003,collar,sign*.102);
   }else{
    // Fan-shaped cheek feathers and the tall orange sails distinguish mandarins.
    solid([[.25,.238],[.19,.25],[.095,.202],[.13,.164],[.21,.184]],.008,cheek,sign*.102);
    solid([[.245,.285],[.17,.292],[.115,.263],[.165,.270],[.245,.273]],.003,collar,sign*.109);
    mountWing(solid([[-.20,.06],[-.24,.23],[-.19,.265],[-.10,.19],[-.065,.085]],.016,cheek,sign*.12),wings[sign<0?0:1]);
   }
  }
 }else if(variant==='coot'){
  solid([[.287,.21],[.308,.215],[.300,.295],[.279,.30]],.078,billMaterial);
 }
 const feet=[],legs=[],legPivots=[];for(const z of [-.062,.062]){
  const pivot=new THREE.Group();pivot.position.set(.015,-.035,z);group.add(pivot);legPivots.push(pivot);
  const leg=new THREE.Mesh(new THREE.CylinderGeometry(.014,.018,.12,6),footMaterial);leg.position.set(0,-.060,0);pivot.add(leg);legs.push(leg);
  const foot=new THREE.Mesh(new THREE.BoxGeometry(.115,.022,.07),footMaterial);foot.position.set(.04,-.134,0);pivot.add(foot);feet.push(foot);
 }
 group.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});return {group,feet,legs,legPivots,wings,materials};
}
