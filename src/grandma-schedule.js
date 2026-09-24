import * as THREE from 'three';
import {seededRandom} from './birds.js';
import {grandmaPlacement,applyGrandmaPlacement,setGrandmaPose} from './grandma.js';

export const UP=new THREE.Vector3(0,1,0);
export const WALK_SPEED=.45,TURN_RATE=2.6,ARRIVE=.09,STRIDE=.62,
 QUIET_MIN=7,QUIET_SPAN=8,SIT_MIN=10,SIT_SPAN=10,FEED_MIN=8,FEED_SPAN=6,
 POI_RADIUS=3.5,POI_ATTEMPTS=8,APPROACH_MIN=.55,APPROACH_SPAN=.35,STAND_RING=.9,PATH_STEP=.3,GROUND_Y=.25;
// Ladders of bench-local z offsets (multiples of the bench's model scale): the
// first ladder finds the closest standable ground spot inside grandmaPlacement's
// proximity gate; the second reaches standable spots outside it, where the direct
// seat probe (benchSeat) does the seating instead.
export const BENCH_LADDER_IN=[.54,.48,.42,.36,.3,.24,.18],BENCH_LADDER_OUT=[.6,.7,.8,.9,1];
const TAU=Math.PI*2;

// Pure gait math: phase is unitless and advances with feet-on-ground travel, so
// swing frequency follows her stride rather than the wall clock.
export function gaitSwing(phase,offset=0){return Math.sin((((phase%1)+1)%1)*TAU+offset);}
export function turnToward(yaw,target,maxDelta){
 let delta=(target-yaw)%TAU;if(delta>Math.PI)delta-=TAU;if(delta<-Math.PI)delta+=TAU;
 return yaw+Math.max(-maxDelta,Math.min(maxDelta,delta));
}
export function yawOf(quaternion){const dir=new THREE.Vector3(0,0,1).applyQuaternion(quaternion);return Math.atan2(dir.x,dir.z);}

// Single-agent schedule for grandma — the bird colony's structural opposite: one
// seeded state machine, no shared NPC framework. The only colony coupling is the
// existing GrandmaFeeding scatter, which runs independently while she stands.
//
// States: idle (stand at anchor) → wander (walk to a validated stop point) →
// sit (bench seat via the placement probes) | feed (stand at a bath or pile).
// Any busy signal — paused, dragged, or under presentation motion — interrupts
// the schedule; it resumes from wherever her release settle left her.
export class GrandmaSchedule {
 constructor(collision,random=Math.random,options={}){
  this.collision=collision;this.random=random;
  this.pois=options.pois??(()=>[]);
  this.busy=options.busy??(()=>false);
  this.onMove=null; // view hook: callers sync kinematic bodies here
  this.states=new Map();
 }
 reset(){this.states.clear();}
 interrupt(o){
  const s=this.states.get(o);
  if(!s)return;
  s.target=null;s.candidates=null;
  s.anchor=o.mesh.position.clone(); // tracks the drag so resume starts at the release point
  if(s.state!=='idle'){s.state='idle';s.quiet=0;s.idleFor=this.rand(QUIET_MIN,QUIET_SPAN);}
 }
 step(dt,grandmas){
  const present=new Set(grandmas);
  for(const o of [...this.states.keys()])if(!present.has(o))this.states.delete(o);
  for(const o of grandmas)this.stepObject(o,dt);
 }
 stepObject(o,dt){
  let s=this.states.get(o);
  if(!s){s=this.adopt(o);this.states.set(o,s);}
  if(this.busy(o)){this.interrupt(o);return;}
  if(s.state==='idle')this.idle(o,s,dt);
  else if(s.state==='wander')this.walkStep(o,s,dt);
  else if(s.state==='sit')this.sit(o,s,dt);
  else if(s.state==='feed')this.feed(o,s,dt);
 }
 adopt(o){
  // A freshly placed or loaded grandma starts where she is; a loaded seated
  // form adopts the sit state so the schedule owns standing up later.
  return {state:o.seated?'sit':'idle',anchor:o.mesh.position.clone(),quiet:0,
   idleFor:this.rand(QUIET_MIN,QUIET_SPAN),timer:o.seated?this.rand(SIT_MIN,SIT_SPAN):0,
   yaw:yawOf(o.mesh.quaternion),gaitPhase:0,walkBlend:0,swayPhase:this.random(),
   target:null,poi:null,candidates:null,index:0};
 }
 rand(min,span){return min+this.random()*span;}
 idle(o,s,dt){
  s.quiet+=dt;
  this.settle(o,dt);
  if(o.seated&&s.quiet<s.idleFor)return; // interrupted while seated; stand up on the next wander attempt
  if(s.quiet<s.idleFor)return;
  if(o.seated&&!this.standUp(o,s)){s.anchor=o.mesh.position.clone();return;} // ring blocked: retry after a fresh quiet period
  if(o.seated)s.anchor=o.mesh.position.clone(); // resume from the step-down spot, not the bench seat
  const candidates=this.pickCandidates(o,s);
  if(!candidates.length){s.quiet=0;s.idleFor=this.rand(QUIET_MIN,QUIET_SPAN);return;}
  s.candidates=candidates;s.index=0;
  s.poi=candidates[0].poi;s.target=candidates[0].point;
  s.state='wander';o.support=null;
 }
 walkStep(o,s,dt){
  const position=o.mesh.position,target=s.target;
  const dx=target.x-position.x,dz=target.z-position.z,dist=Math.hypot(dx,dz);
  if(dist<ARRIVE){this.arrive(o,s);return;}
  s.yaw=turnToward(s.yaw,Math.atan2(dx,dz),TURN_RATE*dt);
  const move=Math.min(WALK_SPEED*dt,dist),x=position.x+dx/dist*move,z=position.z+dz/dist*move;
  const quaternion=new THREE.Quaternion().setFromAxisAngle(UP,s.yaw);
  const grounded=this.standingSpot(o,x,z,quaternion);
  if(!grounded){this.blocked(o,s);return;}
  position.set(x,grounded.y,z);
  o.gaitPhase=((o.gaitPhase??0)+move/STRIDE)%1;
  o.walkBlend=Math.min(1,(o.walkBlend??0)+dt*5);
  this.onMove?.(o);
 }
 arrive(o,s){
  const poi=s.poi;
  if(poi.kind==='bench'){
   // The approach scan already found her standable spot; seat her through the
   // same placement probes drags use (sitting hull vs the bench, forward ladder).
   const seat=this.benchSeat(o,poi.object);
   if(!seat){this.blocked(o,s);return;}
   applyGrandmaPlacement(o,seat,this.collision);this.onMove?.(o);
   s.state='sit';s.timer=this.rand(SIT_MIN,SIT_SPAN);s.target=null;s.candidates=null;
   return;
  }
  const ground=this.standingSpot(o,s.target.x,s.target.z,o.mesh.quaternion);
  if(!ground){this.blocked(o,s);return;}
  o.mesh.position.copy(ground);this.onMove?.(o);
  if(poi.kind==='bath'||poi.kind==='pile'){s.state='feed';s.timer=this.rand(FEED_MIN,FEED_SPAN);s.target=null;s.candidates=null;}
  else this.retire(o);
 }
 feed(o,s,dt){
  this.settle(o,dt);
  s.timer-=dt;
  if(s.timer<=0)this.retire(o);
 }
 sit(o,s,dt){
  this.settle(o,dt);
  s.timer-=dt;
  if(s.timer<=0){
   if(this.standUp(o,s))this.retire(o);
   else s.timer=2; // blocked all around: stay seated, retry shortly
  }
 }
 retire(o){
  const s=this.states.get(o);
  s.state='idle';s.quiet=0;s.idleFor=this.rand(QUIET_MIN,QUIET_SPAN);
  s.anchor=o.mesh.position.clone();s.target=null;s.candidates=null;
 }
 blocked(o,s){
  // Sitting is a placement, not a walk: when the block IS the bench she was
  // bound for and she is close, mount the seat instead of re-routing.
  if(s.poi?.kind==='bench'){
   const bench=s.poi.object,d=Math.hypot(o.mesh.position.x-bench.mesh.position.x,o.mesh.position.z-bench.mesh.position.z);
   if(d<=1.75*(bench.modelScale??1)+.5*(o.modelScale??1)){
    const seat=this.benchSeat(o,bench);
    if(seat){
     applyGrandmaPlacement(o,seat,this.collision);this.onMove?.(o);
     s.state='sit';s.timer=this.rand(SIT_MIN,SIT_SPAN);s.target=null;s.candidates=null;
     return;
    }
   }
  }
  // Step to the next pre-validated candidate; the path from here is re-checked
  // so a fresh obstacle mid-route re-routes instead of stalling.
  for(s.index++;s.index<s.candidates.length;s.index++){
   const candidate=s.candidates[s.index];
   if(this.pathClear(o,candidate.point)){s.poi=candidate.poi;s.target=candidate.point;return;}
  }
  s.candidates=null;s.target=null;
  this.retire(o);
 }
 standUp(o,s){
  // Standing up from a bench seat: swap the baked pose first, then find a clear
  // ring spot to step down onto. Falls back to seated when everything is blocked.
  setGrandmaPose(o,false,this.collision);
  for(let k=0;k<6;k++){
   const angle=this.random()*TAU,x=o.mesh.position.x+Math.cos(angle)*STAND_RING,z=o.mesh.position.z+Math.sin(angle)*STAND_RING;
   const spot=this.standingSpot(o,x,z,o.mesh.quaternion);
   if(spot){o.mesh.position.copy(spot);o.support=null;this.onMove?.(o);return true;}
  }
  setGrandmaPose(o,true,this.collision);
  return false;
 }
 // A standing spot at (x,z): support height beneath her feet plus the placement
 // probe — the same canPlace queries drags honor, so she never stands inside a hedge.
 standingSpot(o,x,z,quaternion){
  const standing=o.grandmaForms.standing,candidate={...o,...standing,mesh:{position:new THREE.Vector3(),quaternion}};
  const base=this.collision.supportY(candidate,x,z,quaternion);
  const at=new THREE.Vector3(x,base,z);
  // supportY's analytic base and the prepared convex parts can disagree by a few
  // millimetres at rotated yaws; settle the hull onto the surface with the same
  // prepared parts canPlace consults, plus a hair of skin above contact.
  at.y-=this.collision.partsAt(candidate,at,quaternion).bounds.min.y;
  at.y+=.0011;
  return this.collision.canPlace(candidate,at,quaternion,new Set([o]))?at:null;
 }
 // Standing spots off the meadow floor (bath rims, furniture tops) are not stop
 // points; she visits things from the ground beside them. The support surface is
 // the hull's world bottom at the supportY base — not her center, which rides at
 // half her height.
 groundSpot(o,x,z,quaternion){
  const standing=o.grandmaForms.standing,candidate={...o,...standing,mesh:{position:new THREE.Vector3(),quaternion}};
  const base=this.collision.supportY(candidate,x,z,quaternion);
  const surface=this.collision.partsAt(candidate,new THREE.Vector3(x,base,z),quaternion).bounds.min.y;
  return surface<=GROUND_Y?this.standingSpot(o,x,z,quaternion):null;
 }
 // Seat her on a known bench: the sitting-hull probe at the seat positions
 // grandmaPlacement generates, without the proximity gate used to find benches.
 benchSeat(o,bench){
  const sitting=o.grandmaForms.sitting,her=o.modelScale??1;
  const rotation=bench.mesh.quaternion.clone();
  for(const forward of [0,.06,.12,.18,.24]){
   const position=new THREE.Vector3(0,0,forward*her).applyQuaternion(bench.mesh.quaternion).add(bench.mesh.position);
   position.y=bench.mesh.position.y+bench.stacking.headY-sitting.seatY;
   const candidate={...o,...sitting,mesh:{position,quaternion:rotation}};
   if(this.collision.canPlace(candidate,position,rotation,new Set([o])))return {position,rotation,support:bench,seated:true};
  }
  return null;
 }
 pathClear(o,point){
  const from=o.mesh.position,dx=point.x-from.x,dz=point.z-from.z,dist=Math.hypot(dx,dz);
  const steps=Math.max(1,Math.ceil(dist/PATH_STEP)),yaw=Math.atan2(dx,dz);
  const quaternion=new THREE.Quaternion().setFromAxisAngle(UP,yaw);
  for(let i=1;i<steps;i++){
   const t=i/steps;
   if(!this.standingSpot(o,from.x+dx*t,from.z+dz*t,quaternion))return false;
  }
  return true;
 }
 pickCandidates(o,s){
  const anchor=s.anchor,pois=this.pois(o),indices=pois.map((_,i)=>i);
  // Seeded shuffle: candidates leave in a deterministic but non-spatial order.
  for(let i=indices.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}
  const candidates=[];
  for(const index of indices){
   if(candidates.length>=POI_ATTEMPTS)break;
   const poi=pois[index],point=this.approach(poi,o,s);
   if(!point)continue;
   const reach=poi.kind==='bench'?POI_RADIUS+APPROACH_SPAN:POI_RADIUS;
   if(Math.hypot(point.x-anchor.x,point.z-anchor.z)>reach)continue;
   candidates.push({poi,point,clear:this.pathClear(o,point)});
  }
  // Prefer candidates reachable without detours; when every path skims an
  // obstacle, walk anyway and let the per-step probes re-route.
  return candidates.filter(c=>c.clear).length?candidates.filter(c=>c.clear):candidates;
 }
 approach(poi,o,s){
  if(poi.kind==='bench'){
   const bench=poi.object,benchScale=bench.modelScale??1,her=o.modelScale??1;
   const quaternion=o.mesh.quaternion;
   // Closest standable ground spot in front of the seat, inside the placement
   // gate when her hull allows; otherwise just outside it (benchSeat seats her
   // from there directly).
   for(const ladder of [BENCH_LADDER_IN,BENCH_LADDER_OUT])for(const k of ladder){
    const local=new THREE.Vector3(0,0,k*benchScale).applyQuaternion(bench.mesh.quaternion).add(bench.mesh.position);
    if(this.groundSpot(o,local.x,local.z,quaternion))return new THREE.Vector3(local.x,0,local.z);
   }
   return null;
  }
  const angle=this.random()*TAU,reach=APPROACH_MIN+this.random()*APPROACH_SPAN;
  const x=poi.x+Math.cos(angle)*reach,z=poi.z+Math.sin(angle)*reach;
  return this.groundSpot(o,x,z,o.mesh.quaternion)?new THREE.Vector3(x,0,z):null;
 }
 settle(o,dt){o.walkBlend=Math.max(0,(o.walkBlend??0)-dt*4);o.swayPhase=((o.swayPhase??0)+dt*.22)%1;}
}

// View-side pose: swing limb pivots from the schedule's gait phase and blend,
// bob the visual root (torso ride) twice per stride, breathe at idle. Never
// touches mesh.position or mesh.quaternion — those are collision state.
export function poseGrandmaGait(o,dt=1/60){
 const root=o.visualRoot;
 if(!root)return;
 const seated=!!o.seated;
 for(const p of [...(o.hipPivots??[]),...(o.shoulderPivots??[])])p.visible=!seated;
 if(seated){root.position.y=0;return;}
 const walking=o.walkBlend??0,phase=o.gaitPhase??0,sway=o.swayPhase??0;
 (o.hipPivots??[]).forEach((p,i)=>{p.rotation.x=gaitSwing(phase,i*Math.PI)*.42*walking;});
 (o.shoulderPivots??[]).forEach((p,i)=>{
  p.rotation.x=gaitSwing(phase,i*Math.PI+Math.PI)*.28*walking;
  p.rotation.z=(i?-1:1)*Math.sin(sway*TAU)*.045*(1-walking);
 });
 root.position.y=walking*(1-Math.cos(phase*TAU*2))*.006+(1-walking)*Math.sin(sway*TAU)*.006;
}

// Ecology wiring: POIs come from the shared scene (benches, baths, leaf piles,
// flower strands); busy mirrors the GrandmaFeeding predicate so dragging,
// pausing and presentation motion all interrupt her.
export function attachGrandmaSchedule(ecology){
 const schedule=new GrandmaSchedule(ecology.collision,seededRandom(2117),{
  pois:()=>ecology.grandmaPois(),
  busy:o=>ecology.grandmas.busy(o),
 });
 schedule.onMove=o=>ecology.pendulums.syncPose(o);
 return schedule;
}
