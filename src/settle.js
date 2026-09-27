import * as THREE from 'three';
import {GRID} from './collision.js';

export const DT=1/60,MAX_STEPS=90,LAUNCH_PLANE=-.71,MAX_HORIZONTAL=3,MAX_DROP=6,MAX_HOP=1.35,HOP_RATIO=.45,SAMPLE_WINDOW=.15,MAX_SAMPLES=4;

// Release momentum from the drag module's last few position samples: velocity is
// the displacement across the sample span. A drag that paused before release has
// no momentum (staleness window), and a fast fling clamps to a walk-speed toss —
// the solver stays deterministic, so the clamp lives at sampling time.
export function releaseVelocity(samples,now=Infinity){
 if(!samples||samples.length<2)return null;
 const first=samples[Math.max(0,samples.length-MAX_SAMPLES)],last=samples[samples.length-1],dt=(last.t-first.t)/1000;
 if(!(dt>0)||last.t>now||now-last.t>SAMPLE_WINDOW*1000)return null;
 const velocity=new THREE.Vector3((last.x-first.x)/dt,(last.y-first.y)/dt,(last.z-first.z)/dt);
 const horizontal=Math.hypot(velocity.x,velocity.z);
 if(horizontal>MAX_HORIZONTAL){const scale=MAX_HORIZONTAL/horizontal;velocity.x*=scale;velocity.z*=scale;}
 if(velocity.y<-MAX_DROP)velocity.y=-MAX_DROP;
 return velocity.x===0&&velocity.z===0&&velocity.y>=0?null:velocity;
}

// Records one floor-drag position sample; the drag module keeps the last few.
export function trackSample(samples,object,t){
 samples.push({x:object.mesh.position.x,y:object.mesh.position.y,z:object.mesh.position.z,t});
 if(samples.length>MAX_SAMPLES)samples.shift();
 return samples;
}

// Floor-form release settle. Locked objects are never manipulable and hanging
// forms already swing on their own dynamics, so neither enters here.
export class SettleSolver{
 constructor(collision,gravity=9.81){this.collision=collision;this.g=gravity;}
 // Release reads as a short toss: the form leaves the drag cell with its
 // momentum plus a speed-scaled hop, then falls ballistically until the swept
 // cast finds the support below the arc. Without the hop a resting form's very
 // first step would dip into its own support and no release would ever travel.
 hopFor(speed){return Math.min(HOP_RATIO*speed,MAX_HOP);}
 // Pure: never mutates the object. Returns {to,from} for the landing cell, or
 // null when nothing should move — the caller keeps today's fallback of resting
 // at the last valid drag position.
 planRelease(object,velocity){
  if(!velocity)return null;
  if(object.properties?.locked||object.hanging)return null;
  if(velocity.x===0&&velocity.z===0&&velocity.y>=0)return null;
  const v=velocity.clone();v.y+=this.hopFor(Math.hypot(velocity.x,velocity.z));
  const from=object.mesh.position.clone(),position=from.clone();
  for(let step=0;step<MAX_STEPS;step++){
   v.y-=this.g*DT;
   const next=position.clone().addScaledVector(v,DT);
   const fraction=this.collision.castFraction(object,position,next);
   if(fraction<.9999){
    const landing=this.landingCell(object,position,next,fraction);
    return this.collision.canPlace(object,landing)?{to:landing,from}:null;
   }
   position.copy(next);
   if(position.y<=LAUNCH_PLANE)break; // fell past the world plane
  }
  return null;
 }
 // Landing snaps to the placement grid drags honor, at the terrain support
 // height for that cell (pool basins resolve to their basin bottom).
 landingCell(object,position,next,fraction){
  const hit=position.clone().lerp(next,fraction);
  const x=Math.round(hit.x/GRID)*GRID,z=Math.round(hit.z/GRID)*GRID;
  return new THREE.Vector3(x,this.collision.supportY(object,x,z),z);
 }
}
