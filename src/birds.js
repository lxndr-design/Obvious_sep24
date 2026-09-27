import {scheduleFlee} from './bird-fear.js';
import {birdSpecies,updateBirdGait} from './bird-gait.js';
import {planFlight,steerFlight} from './bird-flight.js';
import * as THREE from 'three';
import {animateBirdWings} from './bird-wings.js';
import {stickLanding} from './sticks.js';
import {feedBird,seedLanding,SEED_HEIGHT} from './birdseed.js';
import {sampleBirdScale,birdScale,birdFootHeight,birdHopTempo,birdSpacing,smallBird,canNoticeSeed,groundHopHeight} from './bird-traits.js';
export function seededRandom(seed=901){return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const available=site=>site.kind==='bath'||site.kind==='stick'||(site.kind==='seed'?site.count>0:site.count>=3);
const settled=bird=>['foraging','perching','bathing','hopping','feeding','sated','lingering'].includes(bird.state);
// Behavior is deterministic under a seed; leaf piles and bird baths share quiet-area rules.
export class BirdColony {
 constructor(random=seededRandom(419)){this.random=random;this.temperamentRandom=seededRandom(811);this.traitRandom=seededRandom(1271);this.time=0;this.nextArrival=7;this.birds=[];this.quiet=new Map();this.sequence=0;this.limit=5;this.onPeck=null;this.onSplash=null;this.avoidance=null;}
 disturb(position,sites){
  // Pointer ground rays must also disturb elevated baths.
  for(const site of sites)if(Math.hypot(position.x-site.position.x,position.z-site.position.z)<2.1)this.quiet.set(site.id,this.time);
  const startled=this.birds.filter(b=>b.state!=='departing'&&(b.position.distanceTo(position)<1.65||(b.habitat==='bath'&&Math.hypot(b.position.x-position.x,b.position.z-position.z)<1.65)));
  for(const b of this.birds)if(b.state!=='departing'&&(startled.includes(b)||startled.some(n=>n.position.distanceTo(b.position)<1.4)))this.scare(b,position);
 }
 scare(b,from){return scheduleFlee(b,this.time,from,this.temperamentRandom);}
 depart(b,from){
  if(b.state==='departing')return;b.fleeAt=null;b.fleeThreat=null;b.seedField?.release(b.id);b.stickCollection?.release(b.id);b.state='departing';b.age=0;b.from=b.position.clone();
  const away=b.position.clone().sub(from??b.position.clone().add(new THREE.Vector3(1,0,1)));away.y=0;if(away.lengthSq()<.01)away.set(-1,0,1);away.normalize();
  b.to=b.position.clone().addScaledVector(away,3.5).add(new THREE.Vector3(0,4.1,0));b.startOpacity=b.opacity;b.yaw=Math.atan2(-(b.to.z-b.from.z),b.to.x-b.from.x);
  this.beginFlight(b,b.to,{minDuration:2.3});
  this.quiet.set(b.pileId,this.time);this.nextArrival=Math.max(this.nextArrival,this.time+11);
 }
 linger(b,state='lingering'){
  b.seedField?.release(b.id);b.stickCollection?.release(b.id);b.state=state;b.age=0;b.peck=0;b.opacity=1;
  b.lingerDuration=b.carriedStick?6+this.random()*6:12+this.random()*12;b.restYaw=b.yaw;b.target=b.position.clone();
 }
 bathPoint(site,angle,radius,y){
  if(site.shore){const p=(radius===site.rimRadius?site.position:site.waterPosition).clone();p.y=y;return p;}
  if(site.joins&&radius===site.rimRadius){
   const sides=[{bit:1,x:-1,z:0},{bit:2,x:1,z:0},{bit:4,x:0,z:-1},{bit:8,x:0,z:1}].filter(s=>!(site.joins&s.bit));
   if(sides.length){const side=sides[Math.floor((angle/(Math.PI*2)%1)*sides.length)],along=Math.sin(angle*3)*.4;return site.position.clone().add(new THREE.Vector3(side.x?side.x*.68:along,y,side.z?side.z*.68:along));}
  }
  return site.position.clone().add(new THREE.Vector3(Math.cos(angle)*radius,y,Math.sin(angle)*radius));}
 hop(b,target,nextState){b.state='hopping';b.age=0;b.from=b.position.clone();b.to=target;b.nextState=nextState;b.yaw=Math.atan2(-(target.z-b.from.z),target.x-b.from.x);}
 // Plan the steered leg for a flight; avoidance (wired by the ecology) bends
 // the path around solid-form bounds before the bird leaves the ground.
 beginFlight(b,target,{rise=.45,exclude=null,minDuration=0,duration=0,approach=false}={}){
  b.flight=planFlight(b,target,{avoidance:this.avoidance,exclude,rise,minDuration,duration,approach});
  if(b.state==='arriving')b.arrivalDuration=b.flight.length/b.flight.speed;
 }
 step(dt,sites,pointer=null,isClear=()=>true){
  this.time+=dt;if(pointer)this.disturb(pointer,sites);
  for(const b of this.birds){const previous=b.position.clone();if(b.fleeAt!=null&&this.time>=b.fleeAt)this.depart(b,b.fleeThreat);b.age+=dt;b.visitAge=(b.visitAge??0)+dt;
   if(b.state!=='feeding'&&b.seedSearchWait>0)b.seedSearchWait=Math.max(0,b.seedSearchWait-dt);
   const clear=(p,site)=>isClear(p,site,b);
   let site=sites.find(p=>p.id===b.pileId&&available(p));
   b.scale??=sampleBirdScale(this.traitRandom);b.caution??=this.temperamentRandom();b.fullness??=0;b.capacity??=6+Math.floor(this.random()*10);b.fatness??=0;
   if(b.fleeAt==null&&canNoticeSeed(b)){
    const food=sites.filter(p=>p.kind==='seed'&&p.count>0&&p.position.distanceTo(b.position)<8&&p.field.available(p.id).some(s=>s.settled&&s.owner===null&&clear(seedLanding(s,b),p))).sort((a,c)=>a.position.distanceToSquared(b.position)-c.position.distanceToSquared(b.position))[0];
    if(food&&b.foodInterest!==food.id){b.foodInterest=food.id;b.noticeAt=this.time+.6+b.caution*3.2+this.temperamentRandom()*.7;}
    if(!food)b.foodInterest=null;
    const seed=food&&b.state!=='hopping'&&this.time>=b.noticeAt?food.field.claim(b.position,b.id,food.id,p=>clear(p.clone().add(new THREE.Vector3(0,birdFootHeight(b)-SEED_HEIGHT,0)),food)):null;
    if(seed){b.seedField=food.field;b.seedId=seed.id;b.eatTime=0;b.foodWait=0;b.pileId=food.id;b.habitat='seed';b.target=seedLanding(seed,b);b.sitePosition=food.position.clone();b.state='considering';b.reactDuration=.35+b.caution*1.7+this.temperamentRandom()*.45;b.residentArrival=true;b.age=0;b.foodInterest=null;site=food;}

   }
   if((['foraging','perching'].includes(b.state)||b.state==='sated'&&b.age>b.lingerDuration*.5)&&!b.carriedStick&&b.fleeAt==null){
    const stick=sites.filter(s=>s.kind==='stick'&&s.position.distanceTo(b.position)<8&&this.time-(this.quiet.get(s.id)??0)>3).sort((a,c)=>a.position.distanceToSquared(b.position)-c.position.distanceToSquared(b.position)).find(s=>clear(stickLanding(s,b),s)&&s.collection.claim(s,b.id));
    if(stick){b.stickCollection=stick.collection;b.pileId=stick.id;b.habitat='stick';b.target=stickLanding(stick,b);b.sitePosition=stick.position.clone();b.from=b.position.clone();b.state='arriving';b.residentArrival=true;b.age=0;b.yaw=Math.atan2(-(b.target.z-b.from.z),b.target.x-b.from.x);this.beginFlight(b,b.target,{exclude:stick.object});site=stick;}
   }
   if(b.state==='feeding'&&!site&&b.fullness>0)this.linger(b);
   if(['sated','lingering'].includes(b.state)&&!clear(b.position,site))this.depart(b,pointer);
   if(!['departing','sated','lingering'].includes(b.state)&&(!site||!clear(b.target,site)||(['bath','stick'].includes(b.habitat)&&site.position.distanceTo(b.sitePosition)>.02)))this.depart(b,pointer);
   if(b.fleeAt!=null&&!['arriving','hopping'].includes(b.state)){b.peck=0;updateBirdGait(b,b.position,dt);animateBirdWings(b,dt);continue;}
   if(b.state==='arriving'){
    // Plan lazily on the first arriving tick: seed legs keep the caution-paced
    // approach duration the old lerp path used, and spawn-time caution is
    // assigned by then (caution ??= runs before state dispatch).
    if(!b.flight)this.beginFlight(b,b.target,b.habitat==='seed'?{duration:2.3+(b.caution??0)*1.8,approach:true}:{exclude:b.siteObject??null,approach:true});
    const landed=steerFlight(b,dt);
    b.opacity=b.residentArrival?1:smooth((b.flight?.u??1)/.8);b.peck=0;
    if(landed){b.state=b.habitat==='bath'?'perching':b.habitat==='seed'?'feeding':b.habitat==='stick'?'collecting':'foraging';b.age=0;b.walkTarget=b.target.clone();b.nextWalk=.5*birdHopTempo(b);b.lastPeck=-1;b.flight=null;}
   }else if(b.state==='considering'){
    const seed=b.seedField.seeds.get(b.seedId);
    if(!seed?.settled||seed.eatenBy!==null||seed.owner!==b.id){this.linger(b);}
    else{b.target.copy(seedLanding(seed,b));const delta=b.target.clone().sub(b.position),yaw=Math.atan2(-delta.z,delta.x);b.yaw+=Math.atan2(Math.sin(yaw-b.yaw),Math.cos(yaw-b.yaw))*(1-Math.exp(-4*dt));
     if(b.age>=b.reactDuration){b.from=b.position.clone();b.age=0;if(Math.abs(delta.y)>.16||delta.length()>2){b.state='arriving';this.beginFlight(b,b.target);}else b.state='feeding';}}
   }else if(b.state==='collecting'){
    b.opacity=1;b.yaw=0;b.peck=Math.sin(Math.min(1,b.age/.6)*Math.PI);
    if(b.age>=.6){b.carriedStick=site.collection.take(site,b.id);b.peck=0;if(b.carriedStick)this.linger(b);else this.depart(b,null);}
   }else if(b.state==='feeding'){
    b.opacity=1;const before=b.fullness;feedBird(b,site,dt,clear);b.foodWait=b.fullness>before?0:(b.foodWait??0)+dt;if(b.foodWait>12){if(b.fullness>0)this.linger(b);else this.depart(b,null);}
    if(b.fullness>=b.capacity)this.linger(b,'sated');
   }else if(b.state==='sated'||b.state==='lingering'){
    b.peck=.045*Math.sin(b.age*2);b.yaw=b.restYaw+.12*Math.sin(b.age*1.1);if(b.age>b.lingerDuration)this.depart(b,null);
   }else if(b.state==='foraging'){
    b.opacity=1;
    if(b.age>=b.nextWalk&&b.position.clone().setY(0).distanceTo(b.walkTarget.clone().setY(0))<.025){
     const friend=smallBird(b)?this.birds.find(other=>other!==b&&smallBird(other)&&other.pileId===b.pileId&&settled(other)):null;
     const center=friend&&friend.position.distanceTo(b.position)>1.2?friend.position:site.position;
     const heading=Math.hypot(b.position.x-center.x,b.position.z-center.z)>.9?Math.atan2(-(center.z-b.position.z),center.x-b.position.x):b.yaw;
     const angle=heading+(this.random()-.5)*1.5,length=.2+this.random()*.4;
     const target=new THREE.Vector3(b.position.x+Math.cos(angle)*length,birdFootHeight(b),b.position.z-Math.sin(angle)*length);
     if(clear(target,site)&&this.birds.every(other=>other===b||other.state!=='foraging'||other.position.distanceTo(target)>birdSpacing(b,other)))b.walkTarget=target;
     b.nextWalk=b.age+(1.8+this.random()*2.1)*birdHopTempo(b);
    }
    const delta=b.walkTarget.clone().sub(b.position);delta.y=0;const distance=delta.length();
    if(distance>.025){
     const next=b.position.clone().addScaledVector(delta,Math.min(1,dt*.65/distance));
     if(clear(next,site)&&this.birds.every(other=>other===b||other.state!=='foraging'||other.position.distanceTo(next)>birdSpacing(b,other)*.8)){
      b.position.copy(next);b.yaw=Math.atan2(-delta.z,delta.x);b.position.y=birdFootHeight(b)+groundHopHeight(b,dt);
     }else{b.walkTarget.copy(b.position);b.position.y=birdFootHeight(b);b.groundHopPhase=0;b.nextWalk=b.age+1+this.random();}
     b.peck=0;
    }
    else{b.position.y=birdFootHeight(b);b.groundHopPhase=0;const cycle=Math.floor(b.age/2.5),phase=(b.age%2.5)/2.5;b.peck=phase<.36?Math.sin(phase/.36*Math.PI):0;if(b.peck>.9&&cycle!==b.lastPeck){b.lastPeck=cycle;this.onPeck?.(b.position,site);}}
    if(b.age>50+8*b.id)this.depart(b,null);
   }else if(b.state==='perching'){
    b.opacity=1;b.peck=.08*Math.sin(b.age*2);b.position.copy(b.target);
    b.bathWait??=8+this.random()*6;
    if(b.age>b.bathWait*birdHopTempo(b)){
     // One bird bathes at a time; companions wait at separated points on the rim.
     const occupied=this.birds.some(other=>other!==b&&other.pileId===b.pileId&&(other.state==='bathing'||other.state==='hopping'));
     const target=this.bathPoint(site,b.angle,.16,site.waterY+birdFootHeight(b)-.005);
     if(!occupied&&clear(target,site)){b.bathDuration=1.5+this.random()*.8;this.hop(b,target,'bathing');}
    }
   }else if(b.state==='hopping'){
    const t=Math.min(1,b.age/(.65*Math.sqrt(birdScale(b))));b.position.lerpVectors(b.from,b.to,smooth(t));b.position.y+=Math.sin(t*Math.PI)*.20*birdScale(b);b.peck=0;
    if(t===1){b.state=b.nextState;b.age=0;b.lastSplash=-1;}
   }else if(b.state==='bathing'){
    const phase=(b.age%1.6)/1.6,active=phase<.65;
    b.position.copy(b.to);b.position.y-=active?Math.sin(phase/.65*Math.PI)*.035:0;
    b.peck=active?Math.max(0,Math.sin(b.age*8))*.7:0;
    if(active&&Math.floor(b.age/.18)!==b.lastSplash){b.lastSplash=Math.floor(b.age/.18);this.onSplash?.(b.position,site);}
    if(b.age>=(b.bathDuration??2)*Math.sqrt(birdScale(b))){b.bathWait=9+this.random()*7;this.hop(b,b.target.clone(),'perching');}
   }else{
    steerFlight(b,dt);b.opacity=b.startOpacity*(1-smooth(((b.flight?.u??1)-.1)/.75));b.peck=0;
   }
   if(b.habitat==='bath'&&b.visitAge>45+4*b.id)this.depart(b,null);
   updateBirdGait(b,previous,dt);animateBirdWings(b,dt);
  }
  this.birds=this.birds.filter(b=>b.state!=='departing'||b.age<2.5);
  if(this.time>=this.nextArrival&&this.birds.length<this.limit){
   const scale=sampleBirdScale(this.traitRandom),visitor={scale};
   const residents=site=>this.birds.filter(b=>b.pileId===site.id&&b.state!=='departing');
   const candidates=sites.filter(p=>p.joins!==15&&available(p)&&!(p.kind==='seed'&&this.birds.some(b=>canNoticeSeed(b)&&b.foodInterest===p.id&&this.time<(b.noticeAt??0)+2))&&this.time-(this.quiet.get(p.id)??0)>(p.kind==='seed'?1.5:6)&&(!pointer||Math.hypot(pointer.x-p.position.x,pointer.z-p.position.z)>2.1)&&(p.kind!=='bath'||residents(p).length<(p.shore?1:3)));
   const preference=p=>residents(p).filter(settled).length+(smallBird(visitor)?residents(p).filter(b=>smallBird(b)&&settled(b)).length*4:0)+(p.kind==='seed'?10:p.kind==='stick'?6:p.kind==='bath'?.25:0);
   candidates.sort((a,b)=>preference(b)-preference(a));
   // Try other habitats when the preferred site is crowded or obstructed.
   let spawned=false;
   for(const site of candidates){let target=null,angle=0;
    for(let i=0;i<16;i++){
     const a=this.random()*Math.PI*2,r=site.kind==='bath'?site.rimRadius:.15+this.random()*.65;
     const food=site.kind==='seed'?site.field.available(site.id).filter(s=>s.settled&&s.owner===null&&isClear(seedLanding(s,visitor),site,visitor))[i]:null;const p=site.kind==='stick'?stickLanding(site,visitor):food?seedLanding(food,visitor):this.bathPoint(site,a,r,site.kind==='bath'?site.rimY+birdFootHeight(visitor)+.002:birdFootHeight(visitor));
     if(site.kind==='seed'&&!food)continue;
     if(isClear(p,site,visitor)&&this.birds.every(b=>b.state==='departing'||b.target.distanceTo(p)>birdSpacing(visitor,b))){target=p;angle=a;break;}
    }
    if(!target||site.kind==='stick'&&!site.collection.claim(site,this.sequence+1))continue;
    const from=target.clone().add(new THREE.Vector3(-2.5-this.random(),3.5+this.random(),-1));
    this.birds.push({id:++this.sequence,species:birdSpecies({id:this.sequence}),scale,pileId:site.id,habitat:site.kind??'leaves',sitePosition:site.position.clone(),siteObject:site.object??null,angle,state:'arriving',age:0,visitAge:0,position:from.clone(),from,target,opacity:0,fullness:0,capacity:6+Math.floor(this.random()*10),fatness:0,wing:0,wingSpread:1,wingFlap:1.12,wingPhase:0,wingState:'flapping',peck:0,yaw:Math.atan2(-(target.z-from.z),target.x-from.x)});
    if(site.kind==='stick')this.birds.at(-1).stickCollection=site.collection;
    if(site.kind==='seed'){const bird=this.birds.at(-1),seed=site.field.claim(target,bird.id,site.id,p=>isClear(p.clone().add(new THREE.Vector3(0,birdFootHeight(bird)-SEED_HEIGHT,0)),site,visitor));bird.seedId=seed?.id;bird.seedField=site.field;}
    this.nextArrival=this.time+(site.kind==='seed'?3+this.random()*3:8+this.random()*5)*(smallBird(visitor)?.85:1);spawned=true;break;
   }
   if(!spawned)this.nextArrival=this.time+(candidates.length?2:1);
  }
 }
 reset(){this.time=0;this.nextArrival=7;this.birds=[];this.quiet.clear();this.sequence=0;}
}
