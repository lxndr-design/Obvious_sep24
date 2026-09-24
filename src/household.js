import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Household models follow the furnishing recipe: every solid component is one
// visible box (or cylinder) with one matching collider, so open undersides stay
// open and thin tops stay thin. The three sizes come from the makeSizedForm
// envelope, like every other catalog design — nothing here is size-specific.
export const HOUSEHOLD_MODELS={
 chair:'Chair',
 sofa:'Sofa',
 'coffee-table':'Coffee table',
 rug:'Rug',
};
export const HOUSEHOLD_LABELS=Object.fromEntries(Object.entries(HOUSEHOLD_MODELS).map(([model,label])=>[`home-${model}`,label]));

// Solid components per model at natural size, floor at y=0. One collider per
// entry: a cuboid (w,h,d at x,y,z) or a cylinder (r,h along axis). The same
// entries build both the drawn geometry and the physics, and tests check the
// two agree — the collider decomposition is the silhouette, not a bounding box.
const B=(w,h,d,x=0,y=0,z=0)=>({kind:'box',w,h,d,x,y,z});
const C=(r,h,x=0,y=0,z=0,axis='y')=>({kind:'cylinder',r,h,x,y,z,axis});
const COMPONENTS={
 // Seat slab, backrest, four legs — clear between the legs under the seat.
 chair:[B(.45,.05,.45,0,.445,0),B(.45,.5,.04,0,.72,-.205),
  B(.04,.42,.04,-.185,.21,-.185),B(.04,.42,.04,.185,.21,-.185),
  B(.04,.42,.04,-.185,.21,.185),B(.04,.42,.04,.185,.21,.185)],
 // Base, back, two arms, two seat cushions.
 sofa:[B(1.9,.3,.8,0,.15,0),B(1.9,.45,.2,0,.525,-.3),
  B(.18,.3,.8,-.86,.45,0),B(.18,.3,.8,.86,.45,0),
  B(.7,.14,.55,-.38,.445,.07),B(.7,.14,.55,.38,.445,.07)],
 // Top on four legs — nothing spans the underside.
 'coffee-table':[B(.9,.04,.5,0,.42,0),
  B(.05,.4,.05,-.4,.2,-.2),B(.05,.4,.05,.4,.2,-.2),
  B(.05,.4,.05,-.4,.2,.2),B(.05,.4,.05,.4,.2,.2)],
 rug:[B(1.6,.02,1.1,0,.01,0)],
};
export function householdComponents(type){return COMPONENTS[type.slice(5)];}

export function makeHousehold(type,R){
 if(!Object.hasOwn(HOUSEHOLD_LABELS,type))throw Error('Unknown household model');
 const geometries=[],parts=[];
 function bake(geometry){
  const flat=geometry.index?geometry.toNonIndexed():geometry.clone();
  flat.deleteAttribute('uv');geometries.push(flat);geometry.dispose();
 }
 function box({w,h,d,x,y,z}){
  const geometry=new THREE.BoxGeometry(w,h,d);geometry.translate(x,y,z);
  parts.push({shape:new R.Cuboid(w/2,h/2,d/2),offset:new THREE.Vector3(x,y,z)});
  bake(geometry);
 }
 function cylinder({r,h,x,y,z,axis}){
  const geometry=new THREE.CylinderGeometry(r,r,h,24);
  if(axis==='z')geometry.rotateX(Math.PI/2);
  geometry.translate(x,y,z);
  parts.push({shape:new R.ConvexPolyhedron(new Float32Array(geometry.attributes.position.array)),offset:new THREE.Vector3()});
  bake(geometry);
 }
 for(const entry of householdComponents(type))(entry.kind==='box'?box:cylinder)(entry);
 const geometry=mergeGeometries(geometries);for(const g of geometries)g.dispose();
 geometry.computeBoundingBox();const bounds=geometry.boundingBox,height=bounds.max.y-bounds.min.y,center=(bounds.min.y+bounds.max.y)/2;
 geometry.translate(0,-center,0);for(const part of parts)part.offset.y-=center;
 geometry.computeBoundingBox();return {geometry,parts,height};
}
