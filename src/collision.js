import * as THREE from 'three';
import {HoleLayout} from './terrain.js';
const zero={x:0,y:0,z:0},identity={x:0,y:0,z:0,w:1};
export const GRID=.5,POOL={x:3,z:-1.5,width:5};
export class CollisionScene {
 constructor(R){this.R=R;this.objects=[];this.setTerrain(new HoleLayout());}
 setTerrain(layout){this.layout=layout;this.terrain=[];const add=(p,h,y)=>this.terrain.push({shape:new this.R.Cuboid(p.w/2,h/2,p.d/2),position:{x:p.x,y,z:p.z},patch:p,top:y+h/2});for(const p of layout.physicsGround)add(p,.4,-.2);for(const p of layout.bottom)add(p,.18,-.8);for(const p of layout.walls)add(p,.8,-.4);}
 position(part,position,quaternion){return part.offset.clone().applyQuaternion(quaternion).add(position);}
 bounds(object,position,quaternion=object.mesh.quaternion){return object.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().compose(position,quaternion,new THREE.Vector3(1,1,1)));}
 terrainNear(bounds){return this.terrain.filter(({patch:p})=>bounds.max.x>=p.x-p.w/2&&bounds.min.x<=p.x+p.w/2&&bounds.max.z>=p.z-p.d/2&&bounds.min.z<=p.z+p.d/2);}
 supportY(object,x,z,quaternion=object.mesh.quaternion){
  const base=-this.bounds(object,new THREE.Vector3(),quaternion).min.y,from=new THREE.Vector3(x,base+2,z),velocity=new THREE.Vector3(0,-3,0);let fraction=1;
  for(const a of object.parts)for(const t of this.terrainNear(this.bounds(object,from,quaternion))){const hit=a.shape.castShape(this.position(a,from,quaternion),quaternion,velocity,t.shape,t.position,identity,zero,0,1,false);if(hit)fraction=Math.min(fraction,hit.time_of_impact);}
  return from.y-3*fraction;
 }
 canPlace(object,position,quaternion=object.mesh.quaternion){
  if(!position.toArray().every(Number.isFinite))return false;
  const bounds=this.bounds(object,position,quaternion);if(bounds.min.y<-.711)return false;
  const nearby=this.terrainNear(bounds);
  for(const a of object.parts){const ap=this.position(a,position,quaternion);
   for(const t of nearby){const c=a.shape.contactShape(ap,quaternion,t.shape,t.position,identity,0);if(c&&c.distance<-.001)return false;}
   for(const other of this.objects){if(other===object)continue;for(const b of other.parts){const c=a.shape.contactShape(ap,quaternion,b.shape,this.position(b,other.mesh.position,other.mesh.quaternion),other.mesh.quaternion,0);if(c&&c.distance<-.001)return false;}}
  }return true;
 }
 castFraction(object,from,to){
  const velocity=to.clone().sub(from);if(velocity.lengthSq()<1e-12)return 1;let fraction=1;
  const swept=this.bounds(object,from).union(this.bounds(object,to));
  const nearby=this.terrainNear(swept).filter(t=>swept.min.y<t.top-.00001);
  for(const a of object.parts){const ap=this.position(a,from,object.mesh.quaternion);
   const test=(shape,pos,rot)=>{const hit=a.shape.castShape(ap,object.mesh.quaternion,velocity,shape,pos,rot,zero,0,1,false);if(hit)fraction=Math.min(fraction,hit.time_of_impact);};
   for(const t of nearby)test(t.shape,t.position,identity);
   for(const other of this.objects){if(other===object)continue;for(const b of other.parts)test(b.shape,this.position(b,other.mesh.position,other.mesh.quaternion),other.mesh.quaternion);}
  }return fraction;
 }
 canTravel(object,to){return this.canPlace(object,to)&&this.castFraction(object,object.mesh.position,to)>=.9999;}
 contactPosition(object,to,from=object.mesh.position){if(!to.toArray().every(Number.isFinite))return null;const result=from.clone().lerp(to,this.castFraction(object,from,to));return this.canPlace(object,result)?result:null;}
 move(object,to){
  // Picking a form lifts it to the rim, then lowers it onto its actual support.
  // All three segments are swept so other objects cannot be crossed on the way.
  const from=object.mesh.position,base=-this.bounds(object,new THREE.Vector3()).min.y,lifted=from.clone();lifted.y=Math.max(base,from.y);
  if(!this.canTravel(object,lifted))return false;
  const across=to.clone();across.y=lifted.y;const resolved=this.contactPosition(object,across,lifted);if(!resolved)return false;
  const down=resolved.clone();down.y=this.supportY(object,resolved.x,resolved.z);const end=this.contactPosition(object,down,resolved);if(!end)return false;
  const moved=end.distanceToSquared(from)>1e-12;if(!moved&&end.distanceToSquared(to)>1e-12)return false;object.mesh.position.copy(end);return true;
 }
 rotate(object){const start=object.mesh.quaternion.clone();for(let i=1;i<=18;i++){const q=start.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),i*Math.PI/36));if(!this.canPlace(object,object.mesh.position,q))return false;}object.mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));return true;}
}
