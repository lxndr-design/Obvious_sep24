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
 bookshelf:'Bookshelf',
 dresser:'Dresser',
 bed:'Bed',
 'kitchen-counter':'Kitchen counter',
 television:'Television',
 'floor-lamp':'Floor lamp',
 fridge:'Fridge',
 'washing-machine':'Washing machine',
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
 // Sides, bottom plinth, top, three shelves and a back panel — the front stays
 // open, so the shelf cavities are reachable and nothing spans them.
 bookshelf:[B(.03,1.8,.3,-.385,.9,0),B(.03,1.8,.3,.385,.9,0),
  B(.74,.03,.3,0,.015,0),B(.74,.03,.3,0,1.785,0),
  B(.74,.025,.26,0,.5,0),B(.74,.025,.26,0,.95,0),B(.74,.025,.26,0,1.4,0),
  B(.8,1.8,.02,0,.9,-.14)],
 // Body, three drawer faces on the front, top slab.
 dresser:[B(1.1,.8,.5,0,.4,0),
  B(1.0,.2,.03,0,.22,.265),B(1.0,.2,.03,0,.45,.265),B(1.0,.2,.03,0,.68,.265),
  B(1.14,.04,.54,0,.82,0)],
 // Body, door face, handle.
 fridge:[B(.7,1.7,.65,0,.85,0),B(.66,1.64,.03,0,.85,.34),B(.03,.5,.03,.28,1.05,.365)],
 // Body slab and the circular drum door facing forward.
 'washing-machine':[B(.6,.8,.6,0,.4,0),C(.19,.05,0,.5,.315,'z')],
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
