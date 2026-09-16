import * as THREE from 'three';
import {HoleLayout} from './terrain.js';
export const CEILING_HEIGHT = 8.5;
const ZERO = {x:0,y:0,z:0};

// Real rigid bodies, top-mounted rope constraints and spring-based pointer pulling.
// Ground forms use the identical collision parts as the placement query engine.
export class PendulumScene {
  constructor(R) {
    this.R=R;
    this.world=new R.World({x:0,y:-9.81,z:0});
    this.dt=1/120;
    this.world.timestep=this.dt;
    this.world.integrationParameters.numSolverIterations=8;
    this.world.integrationParameters.maxCcdSubsteps=4;
    this.accumulator=0;
    this.objects=new Set();
    this.pull=null;
    this.terrainColliders=[];this.setTerrain(new HoleLayout());
    this.beforeStep=null;

  }
  setTerrain(layout){
    for(const c of this.terrainColliders)this.world.removeCollider(c,true);
    this.terrainColliders=[];
    const slab=(p,h,y)=>this.terrainColliders.push(this.world.createCollider(this.R.ColliderDesc.cuboid(p.w/2,h/2,p.d/2).setTranslation(p.x,y,p.z).setFriction(.65)));
    for(const p of layout.physicsGround)slab(p,.4,-.2);
    for(const p of layout.bottom)slab(p,.18,-.8);
    for(const p of layout.walls)slab(p,.8,-.4);
    this.world.bodies.forEach(body=>{if(body.isDynamic())body.wakeUp();});
  }
  add(o) {
    const R=this.R,p=o.mesh.position;
    const desc=(o.hanging?R.RigidBodyDesc.dynamic():R.RigidBodyDesc.fixed())
      .setTranslation(p.x,p.y,p.z).setRotation(o.mesh.quaternion)
      .setLinearDamping(.1).setAngularDamping(.35).setCcdEnabled(true)
      .setAdditionalSolverIterations(4);
    o.body=this.world.createRigidBody(desc);
    for(const part of o.parts) this.world.createCollider(new R.ColliderDesc(part.shape)
      .setTranslation(part.offset.x,part.offset.y,part.offset.z)
      .setDensity(1).setFriction(.55).setRestitution(.2),o.body);
    if(o.hanging){
      o.anchor ??= new THREE.Vector3(p.x,CEILING_HEIGHT,p.z);
      o.anchorBody=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(o.anchor.x,o.anchor.y,o.anchor.z));
      o.joint=this.world.createImpulseJoint(R.JointData.rope(o.cableLength,ZERO,{x:0,y:o.height/2,z:0}),o.anchorBody,o.body,true);
      o.joint.setContactsEnabled(false);
    }
    this.objects.add(o);
  }
  remove(o){
    if(this.pull?.object===o)this.releasePull();
    if(o.joint)this.world.removeImpulseJoint(o.joint,true);
    if(o.anchorBody)this.world.removeRigidBody(o.anchorBody);
    if(o.body)this.world.removeRigidBody(o.body);
    o.joint=null;o.anchorBody=null;o.body=null;
    this.objects.delete(o);
  }
  rebuild(o){this.remove(o);this.add(o);}
  attachment(o){return new THREE.Vector3(0,o.height/2,0).applyQuaternion(o.mesh.quaternion).add(o.mesh.position);}
  syncPose(o){o.body.setTranslation(o.mesh.position,true);o.body.setRotation(o.mesh.quaternion,true);if(o.anchorBody)o.anchorBody.setTranslation(o.anchor,true);}
  snapshot(o){return {position:o.mesh.position.clone(),quaternion:o.mesh.quaternion.clone(),anchor:o.anchor?.clone(),velocity:{...o.body.linvel()},angularVelocity:{...o.body.angvel()}};}
  restore(o,s){o.mesh.position.copy(s.position);o.mesh.quaternion.copy(s.quaternion);if(s.anchor)o.anchor.copy(s.anchor);this.syncPose(o);o.body.setLinvel(s.velocity,true);o.body.setAngvel(s.angularVelocity,true);}
  beginAnchor(o){this.releasePull();o.body.setBodyType(this.R.RigidBodyType.KinematicPositionBased,true);o.body.setLinvel(ZERO,true);o.body.setAngvel(ZERO,true);}
  endAnchor(o){if(o.hanging){o.body.setBodyType(this.R.RigidBodyType.Dynamic,true);o.body.setLinvel(ZERO,true);o.body.setAngvel(ZERO,true);}}
  moveAnchor(o,target,collision){
    const delta=target.clone().sub(o.anchor);delta.y=0;
    const position=o.mesh.position.clone().add(delta);
    const resolved=collision.contactPosition(o,position);
    if(!resolved||resolved.distanceToSquared(o.mesh.position)<1e-12&&position.distanceToSquared(o.mesh.position)>1e-12)return false;
    o.anchor.add(resolved.clone().sub(o.mesh.position));o.mesh.position.copy(resolved);this.syncPose(o);return true;
  }
  beginPull(o){this.pull={object:o,target:o.mesh.position.clone()};o.body.wakeUp();}
  setPullTarget(target){
    if(!this.pull)return;
    const o=this.pull.object,top=new THREE.Vector3(0,o.height/2,0).applyQuaternion(o.mesh.quaternion);
    const delta=target.clone().add(top).sub(o.anchor);
    delta.y=Math.min(delta.y,-.15);
    delta.clampLength(0,o.cableLength);
    this.pull.target.copy(o.anchor).add(delta).sub(top);
  }
  releasePull(){if(this.pull?.object.body)this.pull.object.body.resetForces(true);this.pull=null;}
  step(delta){
    this.accumulator+=Math.min(delta,.05);
    let stepped=false;
    while(this.accumulator+1e-10>=this.dt){
      if(this.pull){
        const {object:o,target}=this.pull,p=o.body.translation(),v=o.body.linvel();
        const acceleration=new THREE.Vector3((target.x-p.x)*85-v.x*17,(target.y-p.y)*85-v.y*17+9.81,(target.z-p.z)*85-v.z*17).clampLength(0,95);
        o.body.resetForces(true);o.body.addForce(acceleration.multiplyScalar(o.body.mass()),true);
      }
      this.beforeStep?.(this.dt);
      this.world.step();this.accumulator-=this.dt;stepped=true;
    }
    const changed=[];
    if(stepped)for(const o of this.objects){if(!o.hanging)continue;const p=o.body.translation(),q=o.body.rotation();
      if(o.mesh.position.distanceToSquared(p)>1e-12||Math.abs(o.mesh.quaternion.dot(q))<.999999999){
        o.mesh.position.copy(p);o.mesh.quaternion.copy(q);changed.push(o);
      }
    }
    return changed;
  }
  dispose(){this.world.free();}
}
