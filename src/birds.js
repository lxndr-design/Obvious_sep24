import * as THREE from 'three';
import {animateBirdWings} from './bird-wings.js';
import {feedBird} from './birdseed.js';
export function seededRandom(seed=901){return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const available=site=>site.kind==='bath'||(site.kind==='seed'?site.count>0:site.count>=3);
const settled=bird=>['foraging','perching','bathing','hopping','feeding','sated'].includes(bird.state);
// Behavior is deterministic under a seed; leaf piles and bird baths share quiet-area rules.
export class BirdColony {
 constructor(random=seededRandom(419)){this.random=random;this.time=0;this.nextArrival=7;this.birds=[];this.quiet=new Map();this.sequence=0;this.limit=5;this.onPeck=null;this.onSplash=null;}
 disturb(position,sites){
  // Pointer ground rays must also disturb elevated baths.
  for(const site of sites)if(Math.hypot(position.x-site.position.x,position.z-site.position.z)<2.1)this.quiet.set(site.id,this.time);
  const startled=this.birds.filter(b=>b.state!=='departing'&&(b.position.distanceTo(position)<1.65||(b.habitat==='bath'&&Math.hypot(b.position.x-position.x,b.position.z-position.z)<1.65)));
  for(const b of this.birds)if(b.state!=='departing'&&(startled.includes(b)||startled.some(n=>n.position.distanceTo(b.position)<1.4)))this.depart(b,position);
 }
 depart(b,from){
  if(b.state==='departing')return;b.seedField?.release(b.id);b.state='departing';b.age=0;b.from=b.position.clone();
  const away=b.position.clone().sub(from??b.position.clone().add(new THREE.Vector3(1,0,1)));away.y=0;if(away.lengthSq()<.01)away.set(-1,0,1);away.normalize();
  b.to=b.position.clone().addScaledVector(away,3.5).add(new THREE.Vector3(0,4.1,0));b.startOpacity=b.opacity;b.yaw=Math.atan2(-(b.to.z-b.from.z),b.to.x-b.from.x);
  this.quiet.set(b.pileId,this.time);this.nextArrival=Math.max(this.nextArrival,this.time+11);
 }
 bathPoint(site,angle,radius,y){
  if(site.joins&&radius===site.rimRadius){
   const sides=[{bit:1,x:-1,z:0},{bit:2,x:1,z:0},{bit:4,x:0,z:-1},{bit:8,x:0,z:1}].filter(s=>!(site.joins&s.bit));
   if(sides.length){const side=sides[Math.floor((angle/(Math.PI*2)%1)*sides.length)],along=Math.sin(angle*3)*.4;return site.position.clone().add(new THREE.Vector3(side.x?side.x*.68:along,y,side.z?side.z*.68:along));}
  }
  return site.position.clone().add(new THREE.Vector3(Math.cos(angle)*radius,y,Math.sin(angle)*radius));}
 hop(b,target,nextState){b.state='hopping';b.age=0;b.from=b.position.clone();b.to=target;b.nextState=nextState;b.yaw=Math.atan2(-(target.z-b.from.z),target.x-b.from.x);}
 step(dt,sites,pointer=null,isClear=()=>true){
  this.time+=dt;if(pointer)this.disturb(pointer,sites);
  for(const b of this.birds){b.age+=dt;b.visitAge=(b.visitAge??0)+dt;
   let site=sites.find(p=>p.id===b.pileId&&available(p));
   b.fullness??=0;b.capacity??=6+Math.floor(this.random()*10);b.fatness??=0;
   if(b.fullness<b.capacity&&['foraging','perching'].includes(b.state)){
    const food=sites.filter(p=>p.kind==='seed'&&p.count>0&&p.position.distanceTo(b.position)<8).sort((a,c)=>a.position.distanceToSquared(b.position)-c.position.distanceToSquared(b.position))[0];
    const seed=food?.field.claim(b.position,b.id,food.id,p=>isClear(p.clone().setY(.08),food));
    if(seed){b.seedField=food.field;b.seedId=seed.id;b.eatTime=0;b.pileId=food.id;b.habitat='seed';b.target=seed.position.clone().setY(.08);b.sitePosition=food.position.clone();b.from=b.position.clone();b.state=b.position.y>.2||b.position.distanceTo(b.target)>2?'arriving':'feeding';b.residentArrival=true;b.age=0;site=food;}
   }
   if(b.state!=='departing'&&b.state!=='sated'&&(!site||!isClear(b.target,site)||(b.habitat==='bath'&&site.position.distanceTo(b.sitePosition)>.02)))this.depart(b,pointer);
   if(b.state==='arriving'){
    const t=Math.min(1,b.age/2.8);b.position.lerpVectors(b.from,b.target,smooth(t));b.position.y+=Math.sin(Math.PI*t)*.35;
    b.opacity=b.residentArrival?1:smooth(t/.8);b.peck=0;
    if(t===1){b.state=b.habitat==='bath'?'perching':b.habitat==='seed'?'feeding':'foraging';b.age=0;b.walkTarget=b.target.clone();b.nextWalk=.5;b.lastPeck=-1;}
   }else if(b.state==='feeding'){
    b.opacity=1;const before=b.fullness;feedBird(b,site,dt,isClear);b.foodWait=b.fullness>before?0:(b.foodWait??0)+dt;if(b.foodWait>12)this.depart(b,null);
    if(b.fullness>=b.capacity){b.state='sated';b.age=0;b.seedField.release(b.id);}
   }else if(b.state==='sated'){
    b.peck=0;if(b.age>2)this.depart(b,null);
   }else if(b.state==='foraging'){
    b.opacity=1;
    if(b.age>=b.nextWalk){const a=this.random()*Math.PI*2,r=.2+this.random()*.4;const target=site.position.clone().add(new THREE.Vector3(Math.cos(a)*r,.08,Math.sin(a)*r));if(isClear(target,site)&&this.birds.every(other=>other===b||other.state!=='foraging'||other.position.distanceTo(target)>.4))b.walkTarget=target;b.nextWalk=b.age+1.8+this.random()*2.1;}
    const delta=b.walkTarget.clone().sub(b.position);delta.y=0;const distance=delta.length();
    if(distance>.025){const next=b.position.clone().addScaledVector(delta,Math.min(1,dt*.65/distance));if(isClear(next,site)&&this.birds.every(other=>other===b||other.state!=='foraging'||other.position.distanceTo(next)>.33))b.position.copy(next);b.yaw=Math.atan2(-delta.z,delta.x);b.position.y=.08+Math.abs(Math.sin(b.age*17))*.018;b.peck=0;}
    else{b.position.y=.08;const cycle=Math.floor(b.age/2.5),phase=(b.age%2.5)/2.5;b.peck=phase<.36?Math.sin(phase/.36*Math.PI):0;if(b.peck>.9&&cycle!==b.lastPeck){b.lastPeck=cycle;this.onPeck?.(b.position,site);}}
    if(b.age>50+8*b.id)this.depart(b,null);
   }else if(b.state==='perching'){
    b.opacity=1;b.peck=.08*Math.sin(b.age*2);b.position.copy(b.target);
    if(b.age>2.5){
     // One bird bathes at a time; companions wait at separated points on the rim.
     const occupied=this.birds.some(other=>other!==b&&other.pileId===b.pileId&&(other.state==='bathing'||other.state==='hopping'));
     const target=this.bathPoint(site,b.angle,.16,site.waterY+.075);
     if(!occupied&&isClear(target,site))this.hop(b,target,'bathing');
    }
   }else if(b.state==='hopping'){
    const t=Math.min(1,b.age/.65);b.position.lerpVectors(b.from,b.to,smooth(t));b.position.y+=Math.sin(t*Math.PI)*.20;b.peck=0;
    if(t===1){b.state=b.nextState;b.age=0;b.lastSplash=-1;}
   }else if(b.state==='bathing'){
    const cycle=Math.floor(b.age/1.6),phase=(b.age%1.6)/1.6,active=phase<.65;
    b.position.copy(b.to);b.position.y-=active?Math.sin(phase/.65*Math.PI)*.035:0;
    b.peck=active?Math.max(0,Math.sin(b.age*8))*.7:0;
    if(active&&Math.floor(b.age/.18)!==b.lastSplash){b.lastSplash=Math.floor(b.age/.18);this.onSplash?.(b.position,site);}
    if(cycle>=3)this.hop(b,b.target.clone(),'perching');
   }else{
    const t=Math.min(1,b.age/2.5);b.position.lerpVectors(b.from,b.to,smooth(t));b.opacity=b.startOpacity*(1-smooth((t-.1)/.75));b.peck=0;
   }
   if(b.habitat==='bath'&&b.visitAge>45+4*b.id)this.depart(b,null);
   animateBirdWings(b,dt);
  }
  this.birds=this.birds.filter(b=>b.state!=='departing'||b.age<2.5);
  if(this.time>=this.nextArrival&&this.birds.length<this.limit){
   const residents=site=>this.birds.filter(b=>b.pileId===site.id&&b.state!=='departing');
   const candidates=sites.filter(p=>p.joins!==15&&available(p)&&this.time-(this.quiet.get(p.id)??0)>(p.kind==='seed'?1.5:6)&&(!pointer||Math.hypot(pointer.x-p.position.x,pointer.z-p.position.z)>2.1)&&(p.kind!=='bath'||residents(p).length<3));
   const preference=p=>residents(p).filter(settled).length+(p.kind==='seed'?10:p.kind==='bath'?2:0);
   candidates.sort((a,b)=>preference(b)-preference(a));
   // Try other habitats when the preferred site is crowded or obstructed.
   let spawned=false;
   for(const site of candidates){let target=null,angle=0;
    for(let i=0;i<16;i++){
     const a=this.random()*Math.PI*2,r=site.kind==='bath'?site.rimRadius:.15+this.random()*.65;
     const food=site.kind==='seed'?site.field.available(site.id).filter(s=>s.owner===null)[i]:null;const p=food?food.position.clone().setY(.08):this.bathPoint(site,a,r,site.kind==='bath'?site.rimY+.082:.08);
     if(site.kind==='seed'&&!food)continue;
     if(isClear(p,site)&&this.birds.every(b=>b.state==='departing'||b.target.distanceTo(p)>.5)){target=p;angle=a;break;}
    }
    if(!target)continue;
    const from=target.clone().add(new THREE.Vector3(-2.5-this.random(),3.5+this.random(),-1));
    this.birds.push({id:++this.sequence,pileId:site.id,habitat:site.kind??'leaves',sitePosition:site.position.clone(),angle,state:'arriving',age:0,visitAge:0,position:from.clone(),from,target,opacity:0,fullness:0,capacity:6+Math.floor(this.random()*10),fatness:0,wing:0,wingSpread:1,wingFlap:1.12,wingPhase:0,wingState:'flapping',peck:0,yaw:Math.atan2(-(target.z-from.z),target.x-from.x)});
    if(site.kind==='seed'){const bird=this.birds.at(-1),seed=site.field.claim(target,bird.id,site.id,p=>isClear(p.clone().setY(.08),site));bird.seedId=seed?.id;bird.seedField=site.field;}
    this.nextArrival=this.time+(site.kind==='seed'?3+this.random()*3:8+this.random()*5);spawned=true;break;
   }
   if(!spawned)this.nextArrival=this.time+(candidates.length?2:1);
  }
 }
 reset(){this.time=0;this.nextArrival=7;this.birds=[];this.quiet.clear();this.sequence=0;}
}
