import * as THREE from 'three';
import {HoleLayout} from './terrain.js';
import {prepareParts,sweptBounds} from './collision-bounds.js';
import {SpatialHash} from './spatial-hash.js';
const zero={x:0,y:0,z:0},identity={x:0,y:0,z:0,w:1};
export const GRID=.5,POOL={x:3,z:-1.5,width:5};
export class CollisionScene {
 constructor(R){this.R=R;this.objects=[];this.prepared=new WeakMap();this.hash=new SpatialHash(1);this.candidates=[];this.extents=new WeakMap();this.setTerrain(new HoleLayout());}
 setTerrain(layout){this.layout=layout;this.terrain=[];const add=(p,h,y)=>this.terrain.push({shape:new this.R.Cuboid(p.w/2,h/2,p.d/2),position:{x:p.x,y,z:p.z},patch:p,top:y+h/2,bounds:new THREE.Box3(new THREE.Vector3(p.x-p.w/2,y-h/2,p.z-p.d/2),new THREE.Vector3(p.x+p.w/2,y+h/2,p.z+p.d/2))});for(const p of layout.physicsGround)add(p,.4,-.2);for(const p of layout.bottom)add(p,.18,-.8);for(const p of layout.walls)add(p,.8,-.4);}
 position(part,position,quaternion){return part.offset.clone().applyQuaternion(quaternion).add(position);}
 bounds(object,position,quaternion=object.mesh.quaternion){return object.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().compose(position,quaternion,new THREE.Vector3(1,1,1)));}
 terrainNear(bounds){return this.terrain.filter(({patch:p})=>bounds.max.x>=p.x-p.w/2&&bounds.min.x<=p.x+p.w/2&&bounds.max.z>=p.z-p.d/2&&bounds.min.z<=p.z+p.d/2);}
 // Rotation-invariant x/z coverage radius for indexing: the bounding sphere of the
 // object-space AABB (center offset + half diagonal) around the mesh origin, plus
 // the .001 margin the neighbor filter expands by. Conservative under any rotation,
 // so the index never needs re-reading quaternions.
 indexRadius(object){
  let radius=this.extents.get(object.geometry);
  if(radius===undefined){
   const bb=object.geometry.boundingBox??object.geometry.computeBoundingBox(),center=bb.getCenter(new THREE.Vector3()),size=bb.getSize(new THREE.Vector3());
   radius=Math.hypot(center.x,center.y,center.z)+.5*Math.hypot(size.x,size.y,size.z)+.001;this.extents.set(object.geometry,radius);
  }return radius;
 }
 // The objects array is aliased and mutated in place by the app (main.js assigns
 // state.objects to physics.objects, then push/splices it), so add/remove hooks
 // cannot exist: the index re-derives itself here before every object scan.
 // Array identity/length drift and shrinkage rebuild; per-object stamps
 // (geometry reference + x/z position) reindex anything that moved. Rotation and
 // height never change coverage — indexRadius already bounds them.
 syncHash(){
  const hash=this.hash,objects=this.objects;
  if(hash.source!==objects||hash.count>objects.length){hash.clear();hash.source=objects;}
  for(const o of objects){
   const mesh=o.mesh,entry=hash.entries.get(o);
   if(entry&&entry.geo===o.geometry&&entry.px===mesh.position.x&&entry.pz===mesh.position.z)continue;
   const radius=this.indexRadius(o),p=mesh.position,indexed=hash.index(o,p.x-radius,p.z-radius,p.x+radius,p.z+radius);
   indexed.geo=o.geometry;indexed.px=p.x;indexed.pz=p.z;
  }
  // A same-length replacement swaps members without moving length or identity;
  // the count then drifts and this rebuild clears the stale entry in-query.
  if(hash.count!==objects.length){hash.clear();hash.source=objects;for(const o of objects){const radius=this.indexRadius(o),p=o.mesh.position,indexed=hash.index(o,p.x-radius,p.z-radius,p.x+radius,p.z+radius);indexed.geo=o.geometry;indexed.px=p.x;indexed.pz=p.z;}}
 }
 partsAt(object,position=object.mesh.position,quaternion=object.mesh.quaternion){
  const old=this.prepared.get(object);if(old&&old.position.equals(position)&&old.rotation.equals(quaternion))return old;
  const parts=prepareParts(object,position,quaternion),bounds=new THREE.Box3();for(const part of parts)bounds.union(part.bounds);
  const result={parts,bounds,position:position.clone(),rotation:quaternion.clone()};this.prepared.set(object,result);return result;
 }
 neighbors(object,bounds,ignore){
  this.syncHash();
  const found=[],candidates=this.hash.near(bounds.min.x,bounds.min.z,bounds.max.x,bounds.max.z,this.candidates);
  for(let i=0;i<candidates.length;i++){const other=candidates[i];if(other===object||ignore?.has(other))continue;
   // Whole-object bounds avoid preparing distant compound shapes at all.
   // Exact filter, unchanged from the whole-scene scan: the hash only proposes
   // candidates, so results stay identical to brute force by construction.
   if(!this.bounds(other,other.mesh.position).expandByScalar(.001).intersectsBox(bounds))continue;
   const prepared=this.partsAt(other);for(const part of prepared.parts)if(part.bounds.intersectsBox(bounds))found.push(part);
  }return found;}
 supportY(object,x,z,quaternion=object.mesh.quaternion){
  const bounds=this.bounds(object,new THREE.Vector3(x,0,z),quaternion),base=-bounds.min.y;
  const overlaps=(p)=>bounds.max.x>p.x-p.w/2+.00001&&bounds.min.x<p.x+p.w/2-.00001&&bounds.max.z>p.z-p.d/2+.00001&&bounds.min.z<p.z+p.d/2-.00001;
  if(!this.layout.holes.some(h=>overlaps({x:h.x,z:h.z,w:h.size,d:h.size})))return base;
  if(!this.layout.ground.some(overlaps)&&!this.layout.walls.some(overlaps))return base-.71;
  const from=new THREE.Vector3(x,base+2,z),velocity=new THREE.Vector3(0,-3,0),prepared=this.partsAt(object,from,quaternion),nearby=this.terrainNear(prepared.bounds);let fraction=1;
  for(const a of prepared.parts){const swept=sweptBounds(a.bounds,velocity);for(const t of nearby){if(!swept.intersectsBox(t.bounds))continue;const hit=a.shape.castShape(a.position,a.rotation,velocity,t.shape,t.position,identity,zero,0,fraction,false);if(hit)fraction=Math.min(fraction,hit.time_of_impact);}}
  return from.y-3*fraction;
 }
 canPlace(object,position,quaternion=object.mesh.quaternion,ignore){
  if(!position.toArray().every(Number.isFinite))return false;
  const prepared=this.partsAt(object,position,quaternion),bounds=prepared.bounds;if(bounds.min.y<-.711)return false;
  const nearby=this.terrainNear(bounds),others=this.neighbors(object,bounds,ignore);
  for(const a of prepared.parts){
   for(const t of nearby){if(!a.bounds.intersectsBox(t.bounds))continue;const c=a.shape.contactShape(a.position,a.rotation,t.shape,t.position,identity,0);if(c&&c.distance<-.001)return false;}
   for(const b of others){if(!a.bounds.intersectsBox(b.bounds))continue;const c=a.shape.contactShape(a.position,a.rotation,b.shape,b.position,b.rotation,0);if(c&&c.distance<-.001)return false;}
  }return true;
 }
 castFraction(object,from,to,ignore){
  const velocity=to.clone().sub(from);if(velocity.lengthSq()<1e-12)return 1;let fraction=1;
  const prepared=this.partsAt(object,from),swept=sweptBounds(prepared.bounds,velocity);
  const nearby=this.terrainNear(swept).filter(t=>swept.min.y<t.top-.001),others=this.neighbors(object,swept,ignore);
  for(const a of prepared.parts){const path=sweptBounds(a.bounds,velocity);
   const test=(shape,pos,rot)=>{const hit=a.shape.castShape(a.position,a.rotation,velocity,shape,pos,rot,zero,0,fraction,false);if(hit)fraction=Math.min(fraction,hit.time_of_impact);};
   for(const t of nearby)if(path.intersectsBox(t.bounds))test(t.shape,t.position,identity);
   // Resting contacts can report time zero from float rounding, even moving away.
   for(const b of others)if(path.intersectsBox(b.bounds)&&!(velocity.y>=0&&a.bounds.min.y>=b.bounds.max.y-.001))test(b.shape,b.position,b.rotation);
  }return fraction;
 }
 canTravel(object,to){return this.canPlace(object,to)&&this.castFraction(object,object.mesh.position,to)>=.9999;}
 contactPosition(object,to,from=object.mesh.position){if(!to.toArray().every(Number.isFinite))return null;const result=from.clone().lerp(to,this.castFraction(object,from,to));return this.canPlace(object,result)?result:null;}
 move(object,to){
  // Picking a form lifts it to the rim, then lowers it onto its actual support.
  // All three segments are swept so other objects cannot be crossed on the way.
  const from=object.mesh.position;if(from.x===to.x&&from.z===to.z)return true;const base=-this.bounds(object,new THREE.Vector3()).min.y,lifted=from.clone();lifted.y=Math.max(base,from.y);
  if(!this.canTravel(object,lifted))return false;
  const across=to.clone();across.y=lifted.y;const resolved=this.contactPosition(object,across,lifted);if(!resolved)return false;
  const down=resolved.clone();down.y=this.supportY(object,resolved.x,resolved.z);const end=this.contactPosition(object,down,resolved);if(!end)return false;
  const moved=end.distanceToSquared(from)>1e-12;if(!moved&&end.distanceToSquared(to)>1e-12)return false;object.mesh.position.copy(end);return true;
 }
 rotate(object){const start=object.mesh.quaternion.clone();for(let i=1;i<=18;i++){const q=start.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),i*Math.PI/36));if(!this.canPlace(object,object.mesh.position,q))return false;}object.mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));return true;}
}
