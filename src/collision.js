import * as THREE from 'three';
const zero={x:0,y:0,z:0},identity={x:0,y:0,z:0,w:1};
export const GRID=.5,POOL={x:3,z:-1.5,width:5};
export class CollisionScene {
 constructor(R){this.R=R;this.objects=[];this.poolShape=new R.Cuboid(2.5,.3,2.5);}
 position(part,position,quaternion){return part.offset.clone().applyQuaternion(quaternion).add(position);}
 canPlace(object,position,quaternion=object.mesh.quaternion){
  const bounds=object.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().compose(position,quaternion,new THREE.Vector3(1,1,1)));
  if(![position.x,position.y,position.z].every(Number.isFinite)||bounds.min.y<-.001)return false;
  for(const a of object.parts){const ap=this.position(a,position,quaternion);
   const pool=a.shape.contactShape(ap,quaternion,this.poolShape,{x:POOL.x,y:-.28,z:POOL.z},identity,0);if(pool&&pool.distance<-.001)return false;
   for(const other of this.objects){if(other===object)continue;for(const b of other.parts){const contact=a.shape.contactShape(ap,quaternion,b.shape,this.position(b,other.mesh.position,other.mesh.quaternion),other.mesh.quaternion,0);if(contact&&contact.distance<-.001)return false;}}
  }return true;
 }
 canTravel(object,to){if(!this.canPlace(object,to))return false;const from=object.mesh.position,velocity=to.clone().sub(from);if(velocity.lengthSq()<1e-8)return true;
  for(const a of object.parts){const ap=this.position(a,from,object.mesh.quaternion);
   // Continuous shape casts prevent jumping through solids between pointer events.
   const test=(shape,pos,rot)=>{const hit=a.shape.castShape(ap,object.mesh.quaternion,velocity,shape,pos,rot,zero,0,1,false);return hit&&hit.time_of_impact<.9999;};
   if(test(this.poolShape,{x:POOL.x,y:-.28,z:POOL.z},identity))return false;
   for(const other of this.objects){if(other===object)continue;for(const b of other.parts)if(test(b.shape,this.position(b,other.mesh.position,other.mesh.quaternion),other.mesh.quaternion))return false;}
  }return true;
 }
 // Grid positions are targets; collision surfaces take precedence, with zero gap.
 // Sweep all real parts rather than stopping at the last unoccupied grid cell.
 contactPosition(object,to){
  const from=object.mesh.position,velocity=to.clone().sub(from);
  if(!to.toArray().every(Number.isFinite))return null;
  if(velocity.lengthSq()<1e-12)return this.canPlace(object,to)?to.clone():null;
  let fraction=1;
  for(const a of object.parts){const ap=this.position(a,from,object.mesh.quaternion);
   const test=(shape,pos,rot)=>{const hit=a.shape.castShape(ap,object.mesh.quaternion,velocity,shape,pos,rot,zero,0,1,false);if(hit)fraction=Math.min(fraction,hit.time_of_impact);};
   test(this.poolShape,{x:POOL.x,y:-.28,z:POOL.z},identity);
   for(const other of this.objects){if(other===object)continue;for(const b of other.parts)test(b.shape,this.position(b,other.mesh.position,other.mesh.quaternion),other.mesh.quaternion);}
  }
  const result=from.clone().addScaledVector(velocity,fraction);
  return this.canPlace(object,result)?result:null;
 }
 move(object,to){const result=this.contactPosition(object,to);if(!result)return false;const moved=result.distanceToSquared(object.mesh.position)>1e-12;if(!moved&&result.distanceToSquared(to)>1e-12)return false;object.mesh.position.copy(result);return true;}
 rotate(object){const start=object.mesh.quaternion.clone();for(let i=1;i<=18;i++){const q=start.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),i*Math.PI/36));if(!this.canPlace(object,object.mesh.position,q))return false;}object.mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));return true;}
}
