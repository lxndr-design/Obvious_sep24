import * as THREE from 'three';
import {birdFootHeight,groundHopHeight} from './bird-traits.js';
export const SEED_RADIUS=.042,SEED_HEIGHT=SEED_RADIUS*.6;
export const seedLanding=(seed,bird)=>seed.position.clone().add(new THREE.Vector3(0,birdFootHeight(bird)-SEED_HEIGHT,0));
export class BirdseedField {
 constructor(random=Math.random){this.random=random;this.seeds=new Map();this.patches=[];this.sequence=0;this.patchSequence=0;this.eaten=0;this.capacity=512;this.version=0;}
 scatter(point,valid=()=>true,count=1){
  let patch=this.patches.find(p=>p.position.distanceTo(point)<1.2),added=0;
  if(!patch){patch={id:`food-${++this.patchSequence}`,position:point.clone()};this.patches.push(patch);}
  const room=this.capacity-this.remaining;
  for(let i=0;i<Math.min(count,room);i++){
   const angle=this.random()*Math.PI*2,r=count===1?0:Math.sqrt(this.random())*.45,p=point.clone().add(new THREE.Vector3(Math.cos(angle)*r,0,Math.sin(angle)*r));p.y=point.y+SEED_HEIGHT;
   if(!valid(p))continue;const id=++this.sequence;this.seeds.set(id,{id,patch:patch.id,position:p,owner:null,eatenBy:null,settled:true,stable:0,rotation:new THREE.Quaternion()});added++;
  }
  if(added)this.version++;return added;
 }
 attachPhysics(world,R){this.world=world;this.R=R;const g=new THREE.IcosahedronGeometry(SEED_RADIUS,0);g.scale(.75,.6,1);this.seedShape=new R.ConvexPolyhedron(new Float32Array(g.attributes.position.array));g.dispose();}
 drop(point,{lift=.45,velocity=null}={}){
  const added=this.scatter(point.clone().add(new THREE.Vector3(0,lift,0)));if(!added)return 0;const seed=this.seeds.get(this.sequence);
  if(this.world){const R=this.R,p=seed.position;seed.settled=false;
   seed.body=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setCcdEnabled(true).setLinearDamping(1.3).setAngularDamping(2).setLinvel((this.random()-.5)*.16,-.2,(this.random()-.5)*.16));
   this.world.createCollider(new R.ColliderDesc(this.seedShape).setDensity(.5).setFriction(.65).setRestitution(.18).setContactSkin(.001),seed.body);
   if(velocity)seed.body.setLinvel(velocity,true);
  }return 1;
 }
 beforeStep(dt,waterAt){
  for(const seed of this.available()){
   const body=seed.body;if(!body)continue;
   const p=body.translation(),v=body.linvel(),water=waterAt(p);
   const floating=!!water&&p.y<=water.y+SEED_HEIGHT+.025;
   body.resetForces(false);
   if(floating){
    // A light grain rides mostly above the surface. A damped spring follows
    // actual wave height while retaining rigid-body collisions with the rim.
    if(!seed.floating){
     body.setLinvel({x:v.x,y:Math.max(v.y,-.18),z:v.z},true);
     const uv=water.uv(p);water.field.disturb(uv.u,uv.v,-.035,.045);
    }
    const velocity=body.linvel(),mass=body.mass(),target=water.y+SEED_HEIGHT*.55;
    body.addForce({x:-velocity.x*mass*4,y:mass*(-this.world.gravity.y+(target-p.y)*180-velocity.y*22),z:-velocity.z*mass*4},true);
    body.setAngvel({x:body.angvel().x*Math.exp(-8*dt),y:body.angvel().y*Math.exp(-4*dt),z:body.angvel().z*Math.exp(-8*dt)},true);
   }
   if(floating!==!!seed.floating){seed.stable=0;seed.settled=false;seed.owner=null;this.version++;}
   seed.floating=floating;
  }
 }
 updatePhysics(dt){
  let changed=false;for(const seed of this.available())if(seed.body){const p=seed.body.translation(),q=seed.body.rotation(),v=seed.body.linvel();
   if(seed.position.distanceToSquared(p)>1e-12||seed.rotation.angleTo(q)>1e-5)changed=true;
   seed.position.copy(p);seed.rotation.copy(q);seed.stable=(seed.floating?Math.hypot(v.x,v.z)<.12:Math.hypot(v.x,v.y,v.z)<.065)?seed.stable+dt:0;
   const settled=(seed.body.isSleeping()||seed.stable>.25)&&(seed.floating||p.y>=0);if(settled!==seed.settled){seed.settled=settled;seed.owner=null;changed=true;}
  }if(changed)this.version++;
 }
 removeBody(seed){if(seed.body){this.world.removeRigidBody(seed.body);seed.body=null;}}
 get remaining(){return this.sequence-this.eaten;}
 available(patch=null){return [...this.seeds.values()].filter(s=>s.eatenBy===null&&(!patch||s.patch===patch));}
 sites(){return this.patches.flatMap(p=>{const grains=this.available(p.id).filter(s=>s.settled);if(!grains.length)return [];const position=grains.reduce((sum,s)=>sum.add(s.position),new THREE.Vector3()).divideScalar(grains.length);return [{...p,position,kind:'seed',count:grains.length,field:this}];});}
 claim(position,bird,patch,valid=()=>true){const seed=this.available(patch).filter(s=>s.settled&&(s.owner===null||s.owner===bird)&&valid(s.position)).sort((a,b)=>a.position.distanceToSquared(position)-b.position.distanceToSquared(position))[0];if(seed)seed.owner=bird;return seed??null;}
 release(bird){for(const seed of this.seeds.values())if(seed.owner===bird&&seed.eatenBy===null)seed.owner=null;}
 consume(id,bird){const seed=this.seeds.get(id);if(!seed||seed.eatenBy!==null||seed.owner!==bird||!seed.settled)return false;this.removeBody(seed);seed.eatenBy=bird;seed.owner=null;this.eaten++;this.version++;return true;}
 reset(){for(const seed of this.seeds.values())this.removeBody(seed);this.seeds.clear();this.patches=[];this.sequence=this.patchSequence=this.eaten=0;this.version++;}
 read(){return {scattered:this.sequence,remaining:this.remaining,eaten:this.eaten,seeds:[...this.seeds.values()].map(s=>({id:s.id,position:s.position.toArray(),settled:s.settled,floating:!!s.floating,eatenBy:s.eatenBy}))};}
}
export class BirdseedView {
 constructor(scene,field){this.field=field;this.version=-1;this.mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(SEED_RADIUS,0),new THREE.MeshStandardMaterial({color:0x969696,roughness:1,flatShading:true}),field.capacity);this.mesh.count=0;this.mesh.castShadow=this.mesh.receiveShadow=true;scene.add(this.mesh);this.transform=new THREE.Object3D();}
 update(){if(this.version===this.field.version)return;this.version=this.field.version;const seeds=this.field.available();this.mesh.count=seeds.length;seeds.forEach((s,i)=>{this.transform.position.copy(s.position);this.transform.scale.set(.75,.6,1);this.transform.quaternion.copy(s.rotation);this.transform.updateMatrix();this.mesh.setMatrixAt(i,this.transform.matrix);});this.mesh.instanceMatrix.needsUpdate=true;this.mesh.computeBoundingSphere();}
}
const feedingJitter=bird=>{const n=Math.sin((bird.id??0)*12.9898+(bird.fullness??0)*78.233)*43758.5453;return n-Math.floor(n);};
export function feedBird(bird,site,dt,clear=()=>true){
 const field=site.field;bird.seedField=field;
 if(bird.fullness>=bird.capacity){bird.state='sated';bird.age=0;bird.peck=0;field.release(bird.id);return;}
 if(bird.seedSearchWait>0){
  bird.seedSearchWait=Math.max(0,bird.seedSearchWait-dt);bird.peck=0;bird.groundHopPhase=0;
  const t=1-bird.seedSearchWait/bird.seedSearchDuration;bird.yaw=bird.seedSearchYaw+Math.sin(t*Math.PI*2)*.18;
  return;
 }
 let seed=field.seeds.get(bird.seedId);
 if(!seed||seed.eatenBy!==null||seed.owner!==bird.id||!seed.settled){seed=field.claim(bird.position,bird.id,site.id,p=>clear(p.clone().add(new THREE.Vector3(0,birdFootHeight(bird)-SEED_HEIGHT,0)),site));bird.seedId=seed?.id;bird.eatTime=0;bird.eatDuration=.85+.45*(bird.caution??0)+.25*feedingJitter(bird);}
 if(!seed){bird.peck=0;return;}
 if(!clear(seedLanding(seed,bird),site)){field.release(bird.id);bird.seedId=null;return;}
 const target=seedLanding(seed,bird);if(Math.abs(target.y-bird.position.y)>.16){bird.from=bird.position.clone();bird.target=target;bird.age=0;bird.state='arriving';bird.residentArrival=true;return;}const delta=target.clone().sub(bird.position);delta.y=0;const distance=delta.length();
 if(distance>.065){const next=bird.position.clone().addScaledVector(delta,Math.min(1,dt*(.95-.5*(bird.caution??0))/distance));next.y=target.y+groundHopHeight(bird,dt);if(clear(next,site))bird.position.copy(next);else{field.release(bird.id);bird.seedId=null;}bird.yaw=Math.atan2(-delta.z,delta.x);bird.peck=0;return;}
 bird.eatDuration??=.85+.45*(bird.caution??0)+.25*feedingJitter(bird);
 bird.position.y=target.y;bird.groundHopPhase=0;bird.eatTime=(bird.eatTime??0)+dt;bird.peck=Math.max(0,Math.sin(Math.min(1,bird.eatTime/bird.eatDuration)*Math.PI));
 if(bird.eatTime>=bird.eatDuration&&field.consume(seed.id,bird.id)){
  bird.fullness++;bird.fatness=bird.fullness/bird.capacity;bird.seedId=null;bird.eatTime=0;bird.eatDuration=null;bird.peck=0;
  bird.seedSearchDuration=1.5+1.2*(bird.caution??0)+.8*feedingJitter(bird);bird.seedSearchWait=bird.seedSearchDuration;bird.seedSearchYaw=bird.yaw??0;
 }
}
