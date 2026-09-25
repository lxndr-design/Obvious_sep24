import {PRESETS} from '../presets.js';
import {mulberry32} from '../gen/series.js';

// The sim world: a worker-side Rapier rigid-body world following the repo
// pattern (pendulums.js — injected R, 1/120 fixed-step accumulator with a
// stall clamp, dispose -> world.free()). No timers, no postMessage, no DOM:
// the worker shell drives advance() and ships poses; node --test drives this
// exact code headless with real RAPIER.init(), so behavior is identical on
// both sides of the worker boundary.
//
// Note: collision-bounds.shapeBounds() is NOT used here — probed this session,
// rapier 0.19 ColliderDesc objects don't expose the .radius/.halfExtents
// fields it reads (returns NaN bounds). The preset table below is the
// authoritative plain-data source for collider dims.

export const SIM_DT=1/120;
// A stall longer than this is clamped: after a tab sleep the accumulator must
// not spiral into an unbounded catch-up loop (same clamp as pendulums.step).
export const MAX_FRAME_DT=.05;

// Step dt from a sim rate; out-of-range rates are rejected (null) so a bad
// governor or editor value cannot destabilize the solver.
export function stepDtFor(hz){
 return(typeof hz==='number'&&Number.isFinite(hz)&&hz>=30&&hz<=240)?1/hz:null;
}

export const WORLD_DEFAULTS={
 gravity:[0,-9.81,0],
 simHz:120, // sim step rate — the governor's tier-3 lever halves it to 60
 linearDamping:.05,angularDamping:.1,
 friction:.4,restitution:.25,bounceRestitution:.9,
 floorY:-6,boundsRadius:60,boundsSpring:6,
 floatHeight:2,floatSpring:2.5,floatDamp:1.2,floatBob:.4,
 orbitRadius:8,orbitSpeed:.9,orbitK:2,orbitHeightK:2,orbitHeightDamp:1,
 waveAmp:3,waveFreq:1.2,waveDamp:1.5,waveAnchorK:.8,
 bouncePlane:-3,bounceSpring:160,bounceDamp:3,
 pointerK:40,
 // Drag spring — the repo-proven pull gains from pendulums (beginPull /
 // setPullTarget): a = (target-p)*K - v*D, clamped, force = a * mass.
 dragK:85,dragDamp:17,dragClamp:95,
};

// Behavior forces are worker-side per-body accelerations applied every fixed
// step — the same shape as pendulums' spring pull (force = a * mass) — so the
// visual mass of a body never changes how it responds to its behavior.
const FORCES={
 // Buoyant: hover at an altitude band, per-seed bob and drift.
 float(b,p,v,dt,cfg,out){
  const target=cfg.floatHeight+Math.sin(b.bobFreq*b.time+b.phase)*cfg.floatBob;
  out.y+= (target-p.y)*cfg.floatSpring-v.y*cfg.floatDamp-cfg.gravity[1];
  out.x+=(Math.sin(b.time*.7+b.phase)*.25-v.x)*.5;
  out.z+=(Math.cos(b.time*.6+b.phase)*.25-v.z)*.5;
 },
 // Vortex: match a tangential velocity field around the Y axis, ring-shaped
 // via a radial correction, held at the float band vertically.
 orbit(b,p,v,dt,cfg,out){
  const r=Math.hypot(p.x,p.z)||1e-6,nx=p.x/r,nz=p.z/r;
  const speed=cfg.orbitSpeed*cfg.orbitRadius;
  const tx=-nz*speed+nx*(cfg.orbitRadius-r)*1.5;
  const tz= nx*speed+nz*(cfg.orbitRadius-r)*1.5;
  out.x+=(tx-v.x)*cfg.orbitK;
  out.z+=(tz-v.z)*cfg.orbitK;
  out.y+=-cfg.gravity[1]+(cfg.floatHeight-p.y)*cfg.orbitHeightK-v.y*cfg.orbitHeightDamp;
 },
 // Ripple: hover in place, oscillate vertically on a per-seed phase so a
 // spawned series visibly travels as a wave.
 wave(b,p,v,dt,cfg,out){
  out.y+=-cfg.gravity[1]+Math.sin(b.time*cfg.waveFreq+b.phase)*cfg.waveAmp-v.y*cfg.waveDamp;
  out.x+=(b.sx-p.x)*cfg.waveAnchorK-v.x*.5;
  out.z+=(b.sz-p.z)*cfg.waveAnchorK-v.z*.5;
 },
 // Trampoline: gravity does the falling; a stiff penetration spring under an
 // invisible plane does the bouncing. No force above the plane.
 bounce(b,p,v,dt,cfg,out){
  const plane=cfg.bouncePlane+b.extent;
  if(p.y<plane){
   out.y+=(plane-p.y)*cfg.bounceSpring-v.y*cfg.bounceDamp;
   return true;
  }
  return false;
 },
 // none: plain gravity + floor. Settled bodies sleep natively.
};

export class SplashWorld{
 constructor(R,{capacity=24000,config}={}){
  this.R=R;
  this.config={...WORLD_DEFAULTS,...config};
  this.capacity=capacity;
  this.world=new R.World({x:this.config.gravity[0],y:this.config.gravity[1],z:this.config.gravity[2]});
  // Solver at Rapier's default 4 iterations (8 was overspec for a banner)
  // and CCD substeps off: nothing in the preset table uses CCD, so the
  // budget only paid for substeps it never took.
  this.world.integrationParameters.numSolverIterations=4;
  this.world.integrationParameters.maxCcdSubsteps=0;
  this.stepDt=stepDtFor(this.config.simHz)??SIM_DT;
  this.config.simHz=1/this.stepDt; // clamp the stored config to what applies
  this.world.timestep=this.stepDt;
  this.accumulator=0;
  this.time=0;
  this.frame=0;
  this.bodies=[];
  this.byId=new Map();
  this.pointer={mode:'off',p:[0,0,0],strength:0,radius:1};
  this._drag=null; // {id, p} while a body is spring-pulled by the cursor
  this.makeFloor();
 }

 makeFloor(){
  if(this.floorBody)this.world.removeRigidBody(this.floorBody);
  const y=this.config.floorY;
  this.floorBody=this.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(0,y-.5,0));
  this.world.createCollider(this.R.ColliderDesc.cuboid(400,.5,400).setFriction(.65),this.floorBody);
 }

 // Half-extent of the body's collider, from the preset table (plain data) —
 // used for force falloff radii and rest-height math.
 halfExtentFor(preset,s){
  const col=preset.collider;
  switch(col.shape){
   case 'ball':return col.radius*s;
   case 'capsule':return (col.halfHeight+col.radius)*s;
   case 'cuboid':return Math.max(...col.halfExtents)*s;
   default:throw new Error(`splash world: unsupported collider shape ${col.shape}`);
  }
 }

 // Collider dims come from the preset table (plain data, no geometry); the
 // desc is built fresh per body.
 colliderFor(desc){
  const preset=PRESETS[desc.preset];
  if(!preset)throw new Error(`splash world: unknown preset ${desc.preset}`);
  const col=preset.collider,s=desc.r;
  switch(col.shape){
   case 'ball':return this.R.ColliderDesc.ball(col.radius*s);
   case 'capsule':return this.R.ColliderDesc.capsule(col.halfHeight*s,col.radius*s);
   case 'cuboid':return this.R.ColliderDesc.cuboid(col.halfExtents[0]*s,col.halfExtents[1]*s,col.halfExtents[2]*s);
   default:throw new Error(`splash world: unsupported collider shape ${col.shape}`);
  }
 }

 createBody(desc){
  const cfg=this.config,behavior=desc.behavior??'none';
  const preset=PRESETS[desc.preset];
  if(!preset)throw new Error(`splash world: unknown preset ${desc.preset}`);
  const cd=this.colliderFor(desc);
  const extent=this.halfExtentFor(preset,desc.r);
  const rng=mulberry32(desc.seed??0);
  const body=this.world.createRigidBody(
   this.R.RigidBodyDesc.dynamic()
    .setTranslation(desc.p[0],desc.p[1],desc.p[2])
    .setLinearDamping(cfg.linearDamping)
    .setAngularDamping(cfg.angularDamping)
  );
  this.world.createCollider(
   cd.setDensity(1).setFriction(cfg.friction)
     .setRestitution(behavior==='bounce'?cfg.bounceRestitution:cfg.restitution),
   body
  );
  return{
   id:desc.id,body,preset:desc.preset,scale:desc.r,behavior,extent,
   phase:rng()*Math.PI*2,bobFreq:.8+rng()*.8,
   sx:desc.p[0],sz:desc.p[2],
   time:0,forced:false,
  };
 }

 // Batched spawn. Over-capacity bodies are rejected (reported via the
 // protocol's error path by the worker shell), never silently dropped.
 spawn(descs){
  const added=[],rejected=[];
  for(const desc of descs){
   if(this.bodies.length>=this.capacity){rejected.push(desc.id);continue;}
   const b=this.createBody(desc);
   this.bodies.push(b);
   this.byId.set(b.id,b);
   added.push(b.id);
  }
  return{added,rejected};
 }

 despawn(ids){
  const removed=[];
  for(const id of ids){
   const b=this.byId.get(id);
   if(!b)continue;
   this.world.removeRigidBody(b.body);
   this.byId.delete(id);
   removed.push(id);
  }
  if(removed.length){
   this.bodies=this.bodies.filter(b=>this.byId.has(b.id));
   if(this._drag&&removed.includes(this._drag.id))this._drag=null; // never drag a removed body
  }
  return removed;
 }

 despawnAll(){return this.despawn([...this.byId.keys()]);}

 // Live config patch; known keys apply immediately, unknown keys are ignored
 // (the protocol layer already rejected non-objects). A floor move rebuilds
 // the slab; damping changes reach existing bodies.
 patch(patch){
  const floorMoved=patch.floorY!==undefined&&patch.floorY!==this.config.floorY;
  for(const[key,value]of Object.entries(patch)){
   if(key==='simHz')continue; // applied below with range validation
   if(key in this.config)this.config[key]=value;
  }
  if(patch.simHz!==undefined){
   const dt=stepDtFor(patch.simHz);
   if(dt){ // out-of-range rates keep the current step — no destabilized solver
    this.config.simHz=patch.simHz;
    this.stepDt=dt;
    this.world.timestep=dt;
   }
  }
  if(patch.gravity){
   const[x,y,z]=this.config.gravity;
   this.world.gravity={x,y,z};
  }
  if(patch.linearDamping!==undefined||patch.angularDamping!==undefined){
   for(const b of this.bodies){
    b.body.setLinearDamping(this.config.linearDamping);
    b.body.setAngularDamping(this.config.angularDamping);
   }
  }
  if(floorMoved)this.makeFloor();
 }

 setPointer(mode,p,strength,radius){
  this.pointer={mode,p,strength,radius};
 }

 // Spring-pull drag (repo-proven pattern): one body follows a stiff target
 // each step. Repeat calls move the target — the cursor never re-grabs.
 drag(id,p){
  this._drag={id,p:[p[0],p[1],p[2]]};
 }

 // End the drag; v is the pointer-velocity throw (world units/s) applied to
 // the held body. Only the active drag id may release — a stale release for a
 // body that was never grabbed (or already released) must not fling anything.
 releaseDrag(id,v){
  if(!this._drag||this._drag.id!==id)return false;
  if(v){
   const b=this.byId.get(id);
   if(b)b.body.setLinvel({x:v[0],y:v[1],z:v[2]},true);
  }
  this._drag=null;
  return true;
 }

 // Click shockwave: a velocity kick (impulse = mass * dv) that falls off
 // linearly with distance; the bounds helper extent keeps near-grazers honest.
 impulse({p,strength,radius}){
  for(const b of this.bodies){
   const body=b.body,P=body.translation();
   const dx=P.x-p[0],dy=P.y-p[1],dz=P.z-p[2];
   const d=Math.hypot(dx,dy,dz);
   const reach=radius+b.extent;
   if(d>=reach)continue;
   const fall=1-d/reach;
   const s=strength*fall*body.mass();
   const nx=d>1e-6?dx/d:0,ny=d>1e-6?dy/d:1,nz=d>1e-6?dz/d:0;
   body.applyImpulse({x:nx*s,y:ny*s,z:nz*s},true);
  }
 }

 // Per-step force pass. Sleeping bodies are skipped entirely — zero WASM
 // reads, zero allocations — unless the pointer is active (a magnet passing
 // over settled bodies must wake them), so steady-state cost tracks active
 // bodies, not total bodies.
 applyForces(){
  const cfg=this.config,ptr=this.pointer,drag=this._drag;
  const ptrActive=ptr.mode!=='off'&&ptr.strength!==0;
  const out={x:0,y:0,z:0}; // reused across the pass — no per-body allocation
  const F={x:0,y:0,z:0};
  for(const b of this.bodies){
   const body=b.body;
   const dragged=drag!==null&&drag.id===b.id;
   if(!ptrActive&&!dragged&&body.isSleeping()){b.forced=false;continue;}
   const p=body.translation();
   const behavior=FORCES[b.behavior];
   out.x=0;out.y=0;out.z=0;
   let forced=false;
   if(dragged){
    // Held body: the drag spring replaces behavior AND pointer forces —
    // user intent outranks the magnet and the behavior layer (same shape as
    // pendulums' pull: acceleration = spring - damping, clamped, x mass).
    const v=body.linvel();
    let ax=(drag.p[0]-p.x)*cfg.dragK-v.x*cfg.dragDamp;
    let ay=(drag.p[1]-p.y)*cfg.dragK-v.y*cfg.dragDamp;
    let az=(drag.p[2]-p.z)*cfg.dragK-v.z*cfg.dragDamp;
    const mag=Math.hypot(ax,ay,az);
    if(mag>cfg.dragClamp){const k=cfg.dragClamp/mag;ax*=k;ay*=k;az*=k;}
    out.x=ax;out.y=ay;out.z=az;
    forced=true;
   }else if(behavior||ptrActive){
    // Velocity is only consumed by behavior forces and the pointer term.
    const v=body.linvel();
    if(behavior)forced=behavior(b,p,v,this.stepDt,cfg,out)??true;
    if(ptrActive){
     const dx=ptr.p[0]-p.x,dy=ptr.p[1]-p.y,dz=ptr.p[2]-p.z;
     const d=Math.hypot(dx,dy,dz),reach=ptr.radius+b.extent;
     if(d<reach){
      const s=ptr.strength*(1-d/reach)*cfg.pointerK*(ptr.mode==='repel'?-1:1);
      const inv=d>1e-6?1/d:0;
      out.x+=dx*inv*s;out.y+=dy*inv*s;out.z+=dz*inv*s;
      forced=true;
     }
    }
   }
   const d2=p.x*p.x+p.y*p.y+p.z*p.z;
   if(d2>cfg.boundsRadius*cfg.boundsRadius){
    const d=Math.sqrt(d2),f=cfg.boundsSpring*(d-cfg.boundsRadius)/d;
    out.x-=p.x*f;out.y-=p.y*f;out.z-=p.z*f;
    forced=true;
   }
   if(forced){
    const m=body.mass();
    F.x=out.x*m;F.y=out.y*m;F.z=out.z*m;
    body.resetForces(true);
    body.addForce(F,true); // wakeUp=true wakes sleeping bodies the magnet reaches
   }else if(b.forced){
    body.resetForces(false); // clear a stale force without waking the body
   }
   b.forced=forced;
   b.time+=this.stepDt;
  }
 }

 // Fixed-step accumulator: dt comes from the caller (worker timer or test),
 // never from a clock, so N advance(dt) calls are reproducible bit-for-bit.
 advance(dt){
  this.accumulator+=Math.min(dt,MAX_FRAME_DT);
  let steps=0;
  while(this.accumulator+1e-10>=this.stepDt){
   this.applyForces();
   this.world.step();
   this.time+=this.stepDt;
   this.frame++;
   this.accumulator-=this.stepDt;
   steps++;
  }
  return steps;
 }

 // Fills one pose set (caller-owned ping-pong buffers) with every body's
 // state; ids ride along per frame so the consumer maps by id, and sleep
 // flags let the renderer skip settled bodies' matrix writes.
 writePoses({positions,quaternions,sleep,ids}){
  const n=this.bodies.length;
  for(let i=0;i<n;i++){
   const b=this.bodies[i],p=b.body.translation(),q=b.body.rotation();
   const o=i*3,qo=i*4;
   positions[o]=p.x;positions[o+1]=p.y;positions[o+2]=p.z;
   quaternions[qo]=q.x;quaternions[qo+1]=q.y;quaternions[qo+2]=q.z;quaternions[qo+3]=q.w;
   sleep[i]=b.body.isSleeping()?1:0;
   ids[i]=b.id;
  }
  return n;
 }

 dispose(){
  this.world.free();
  this.bodies=[];
  this.byId.clear();
  this.floorBody=null;
 }
}
