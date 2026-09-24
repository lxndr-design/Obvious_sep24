// Steered flight for the bird colony: arrival and departure legs follow
// quadratic Bézier paths instead of direct lerps. Each leg is planned once —
// the take-off tangent follows the bird's heading, the middle lifts into a
// cruise arc, and a corridor repair bends the control point around solid-form
// bounds supplied by the collision broad phase. The advance is velocity-bounded
// (never more than the leg's speed × dt of travel per tick) and the heading
// chases the path tangent at a bounded rate, so flights arc instead of
// cornering. Pure math over seeded colony state — no clocks, no DOM — so runs
// stay deterministic.
import * as THREE from 'three';
import {birdHopTempo} from './bird-traits.js';

export const CRUISE_SPEED=3.2; // m/s for a scale-1 bird
export const TURN_RATE=2.8;    // rad/s the heading may swing per second
export const CLEARANCE=.34;    // half-width kept clear around solid bounds
const CORRIDOR=12;             // sampled points checked for obstruction
const ARC_SAMPLES=16;          // arclength estimate resolution
const LADDER=[.6,1.2,2,3];     // sidestep pushes beyond the shell exit, metres
const _v=new THREE.Vector3(),_w=new THREE.Vector3();

// Trait tempo (scale^1.5) carries into flight speed so flocks stay visibly individual.
export const flightSpeed=bird=>CRUISE_SPEED*birdHopTempo(bird);

const bezier=(p0,p1,p2,u,out)=>out.set(
 (1-u)*(1-u)*p0.x+2*(1-u)*u*p1.x+u*u*p2.x,
 (1-u)*(1-u)*p0.y+2*(1-u)*u*p1.y+u*u*p2.y,
 (1-u)*(1-u)*p0.z+2*(1-u)*u*p1.z+u*u*p2.z);
const tangent=(f,u,out)=>out.set(
 2*(1-u)*(f.p1.x-f.p0.x)+2*u*(f.p2.x-f.p1.x),
 2*(1-u)*(f.p1.y-f.p0.y)+2*u*(f.p2.y-f.p1.y),
 2*(1-u)*(f.p1.z-f.p0.z)+2*u*(f.p2.z-f.p1.z));

function arclength(p0,p1,p2){
 let length=0;const a=new THREE.Vector3(),b=new THREE.Vector3();
 bezier(p0,p1,p2,0,a);
 for(let i=1;i<=ARC_SAMPLES;i++){bezier(p0,p1,p2,i/ARC_SAMPLES,b);length+=a.distanceTo(b);a.copy(b);}
 return length;
}

// The deepest obstruction on a leg: a solid bound inside the clearance radius
// at flight height for some sampled corridor point. Endpoints are not checked —
// both are already validated landing spots — only the crossing between them.
export function pathObstruction(path,avoidance,exclude){
 const probe=new THREE.Vector3();
 for(let i=1;i<CORRIDOR;i++){
  bezier(path.p0,path.p1,path.p2,i/CORRIDOR,probe);
  const obstacles=avoidance(probe.x-CLEARANCE,probe.z-CLEARANCE,probe.x+CLEARANCE,probe.z+CLEARANCE,exclude);
  for(const o of obstacles){
   if(o.maxY<probe.y-.18||o.minY>probe.y+.06)continue;
   const dx=Math.max(o.minX-probe.x,0,probe.x-o.maxX),dz=Math.max(o.minZ-probe.z,0,probe.z-o.maxZ),gap=Math.hypot(dx,dz);
   if(gap<CLEARANCE)return{u:i/CORRIDOR,obstacle:o,depth:CLEARANCE-gap};
  }
 }
 return null;
}

// Distance from (x,z) along the ray direction (px,pz) to leave the rectangle.
function exitDistance(x,z,px,pz,rect){
 let t=Infinity;
 if(px>1e-9)t=Math.min(t,(rect.maxX-x)/px);else if(px<-1e-9)t=Math.min(t,(rect.minX-x)/px);
 if(pz>1e-9)t=Math.min(t,(rect.maxZ-z)/pz);else if(pz<-1e-9)t=Math.min(t,(rect.minZ-z)/pz);
 return Math.max(.25,Number.isFinite(t)?t:.25);
}

function legPath(p0,p1,p2){return{p0,p1,p2,u:0,done:false};}

// Bend a planned leg around a detected obstruction: climbing raises the middle
// of the arc above the obstacle, sidestepping pushes the control point out of
// the obstacle's expanded footprint along the approach perpendicular (the
// quadratic path reaches roughly half the control push, hence the doubled
// exit distance plus the ladder), and the last variant combines both. The
// variant with the least remaining obstruction wins; an unrepairable leg keeps
// the least-bad shape so the flight always completes.
function repairPath(path,avoidance,exclude,rise){
 const hit=pathObstruction(path,avoidance,exclude);
 if(!hit)return path;
 const cruise=Math.max(path.p0.y,path.p2.y)+rise,ceiling=Math.min(cruise+2.2,hit.obstacle.maxY+.6);
 const climb=legPath(path.p0.clone(),path.p1.clone(),path.p2.clone());
 climb.p1.y=ceiling;
 const variants=[climb];
 const along=_v.subVectors(path.p2,path.p0);along.y=0;
 if(along.lengthSq()>1e-6){
  const perp=_w.set(-along.z,0,along.x).normalize(),cx=(hit.obstacle.minX+hit.obstacle.maxX)/2,cz=(hit.obstacle.minZ+hit.obstacle.maxZ)/2;
  bezier(path.p0,path.p1,path.p2,.5,_v);
  const side=(_v.x-cx)*perp.x+(_v.z-cz)*perp.z>=0?1:-1;
  const shell={minX:hit.obstacle.minX-CLEARANCE,maxX:hit.obstacle.maxX+CLEARANCE,minZ:hit.obstacle.minZ-CLEARANCE,maxZ:hit.obstacle.maxZ+CLEARANCE};
  for(const extra of LADDER){
   const push=side*(2*exitDistance(path.p1.x,path.p1.z,perp.x*side,perp.z*side,shell)+extra);
   const sidestep=legPath(path.p0.clone(),path.p1.clone().addScaledVector(perp,push),path.p2.clone());
   variants.push(sidestep);
   const both=legPath(path.p0.clone(),sidestep.p1.clone(),path.p2.clone());
   both.p1.y=ceiling;
   variants.push(both);
  }
 }
 let best=path,bestDepth=Infinity;
 for(const variant of variants){
  const depth=pathObstruction(variant,avoidance,exclude)?.depth??-1;
  if(depth<bestDepth){bestDepth=depth;best=variant;}
 }
 return best;
}

// Plan the leg from the bird's pose to target. minDuration floors the speed so
// short-lived departure legs always finish inside the colony's cleanup window;
// duration fixes the leg length in time exactly — the caution-paced seed
// approach keeps its old lerp timing under the new velocity-bounded steering.
export function planFlight(bird,target,{avoidance=null,exclude=null,rise=.45,minDuration=0,duration=0}={}){
 const p0=bird.position.clone(),p2=target.clone();
 const heading=_v.set(Math.cos(bird.yaw),0,-Math.sin(bird.yaw));
 if(heading.lengthSq()<1e-8)heading.set(1,0,0);
 const dist=p0.distanceTo(p2),cruise=Math.max(p0.y,p2.y)+rise;
 const p1=p0.clone().addScaledVector(heading,.45*dist);
 p1.y=cruise+Math.min(1.2,.12*dist);
 let path=legPath(p0,p1,p2);
 if(avoidance)path=repairPath(path,avoidance,exclude,rise);
 tangent(path,1,_w);
 path.length=arclength(path.p0,path.p1,path.p2);
 path.speed=duration>0?path.length/duration:Math.max(flightSpeed(bird),minDuration>0?path.length/minDuration:0);
 path.landYaw=_w.lengthSq()>1e-8?Math.atan2(-_w.z,_w.x):bird.yaw;
 return path;
}

// Advance a flying bird one tick along its leg: at most speed × dt of travel,
// with the heading chasing the path tangent at a bounded rate. Returns true
// when the leg completes — the bird sits exactly on the end point, facing the
// landing tangent.
export function steerFlight(bird,dt){
 const f=bird.flight;
 if(!f)return true;
 if(f.done||f.length<1e-6){bird.position.copy(f.p2);bird.yaw=f.landYaw;f.done=true;return true;}
 const distance=Math.min((1-f.u)*f.length,f.speed*dt);
 f.u=Math.min(1,f.u+distance/f.length);
 bezier(f.p0,f.p1,f.p2,f.u,_v);
 const stretch=_v.distanceTo(bird.position);
 if(stretch>distance)_v.sub(bird.position).multiplyScalar(distance/stretch).add(bird.position);
 bird.position.copy(_v);
 tangent(f,f.u,_v);
 if(_v.lengthSq()>1e-8){
  const desired=Math.atan2(-_v.z,_v.x),delta=Math.atan2(Math.sin(desired-bird.yaw),Math.cos(desired-bird.yaw));
  bird.yaw+=Math.max(-TURN_RATE*dt,Math.min(TURN_RATE*dt,delta));
 }
 if(f.u>=1){bird.position.copy(f.p2);bird.yaw=f.landYaw;f.done=true;return true;}
 return false;
}
