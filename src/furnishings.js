import * as THREE from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const PLANTS={snake:'Snake plant',rubber:'Rubber plant',succulent:'Succulent'};
export const PLANT_SIZES={small:.65,medium:1,large:1.5};
export const TABLE_SIZES={half:.5,full:1};
export const FURNISHING_LABELS={bench:'Park bench',birdbath:'Bird bath',fountain:'Fountain'};
export const BATH={height:1.53,waterY:1.43,waterRadius:.57,rimRadius:.69};
for(const [plant,label] of Object.entries(PLANTS))for(const size of Object.keys(PLANT_SIZES))FURNISHING_LABELS[`plant-${plant}-${size}`]=`${label} · ${size}`;
for(const shape of ['round','square'])for(const size of Object.keys(TABLE_SIZES))FURNISHING_LABELS[`table-${shape}-${size}`]=`${shape==='round'?'Round':'Square'} table · ${size==='half'?'½':'1/1'}`;

// Bake each component's transform into both its visible mesh and convex collider.
// In particular, never wrap foliage or the empty space under a table in one hull.
export function makeFurnishing(type,R){
 const [family,kind,size]=type.split('-');
 if(!Object.hasOwn(FURNISHING_LABELS,type))throw Error('Unknown furnishing');
 const scale=family==='plant'?PLANT_SIZES[size]:family==='table'?TABLE_SIZES[size]:1;
 const geometries=[],parts=[];
 function add(geometry,position=new THREE.Vector3(),rotation=new THREE.Quaternion(),analytic=null){
  geometry.applyQuaternion(rotation);geometry.translate(position.x,position.y,position.z);geometry.scale(scale,scale,scale);
  const shape=analytic??new R.ConvexPolyhedron(new Float32Array(geometry.attributes.position.array));
  parts.push({shape,offset:analytic?position.clone().multiplyScalar(scale):new THREE.Vector3()});
  const flat=geometry.index?geometry.toNonIndexed():geometry.clone();
  flat.deleteAttribute('uv');geometries.push(flat);geometry.dispose();
 }
 const v=(x,y,z)=>new THREE.Vector3(x,y,z);
 function stem(a,b,r=.018){const delta=b.clone().sub(a);add(new THREE.CylinderGeometry(r,r,delta.length(),8),a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(v(0,1,0),delta.normalize()));}
 function leaf(a,b,width,thickness){
  const axis=b.clone().sub(a),side=v(axis.z,0,-axis.x).normalize();if(side.lengthSq()<.01)side.set(1,0,0);
  const normal=new THREE.Vector3().crossVectors(axis,side).normalize();
  const middle=a.clone().addScaledVector(axis,.48);
  const points=[a,b,middle.clone().addScaledVector(side,width),middle.clone().addScaledVector(side,-width),middle.clone().addScaledVector(normal,thickness),middle.clone().addScaledVector(normal,-thickness)];
  add(new ConvexGeometry(points));
 }
 if(family==='bench'){
  // Individual slats, rails and legs preserve the bench's open structure.
  const box=(w,h,d,x,y,z)=>add(new THREE.BoxGeometry(w,h,d),v(x,y,z),undefined,new R.Cuboid(w/2,h/2,d/2));
  for(let i=0;i<4;i++)box(2.35,.095,.145,0,.72,-.265+i*.18);
  for(const x of [-.92,.92]){
   for(const z of [-.24,.24])box(.12,.68,.12,x,.34,z);
   box(.14,.13,.78,x,.62,0);
   box(.11,.86,.11,x,1.05,-.32);
   box(.105,.30,.105,x,.92,.27);
   box(.14,.085,.83,x,1.09,0);
  }
  for(let i=0;i<3;i++)box(2.35,.14,.085,0,.99+i*.19,-.32);
  box(1.84,.11,.11,0,.27,0);
 }else if(family==='birdbath'||family==='fountain'){
  add(new THREE.CylinderGeometry(.35,.46,.14,40),v(0,.07,0));
  add(new THREE.CylinderGeometry(.18,.23,1.14,32),v(0,.71,0));
  add(new THREE.CylinderGeometry(.66,.40,.16,48),v(0,1.24,0));
  if(family==='fountain')add(new THREE.CylinderGeometry(.055,.10,.30,12),v(0,1.47,0));
  // Hollow bowl: each wall wedge is convex, with no hull spanning the basin.
  for(let i=0;i<48;i++){
   const points=[];
   for(const a of [i*Math.PI/24,(i+1)*Math.PI/24])for(const [r,y] of [[.66,1.32],[.76,BATH.height],[.62,BATH.height],[.53,1.32]])points.push(v(Math.cos(a)*r,y,Math.sin(a)*r));
   add(new ConvexGeometry(points));
  }
 }else if(family==='table'){
  const height=1.3,thickness=.13,topY=height-thickness/2;
  if(kind==='round')add(new THREE.CylinderGeometry(1,1,thickness,64),v(0,topY,0),undefined,new R.Cylinder(thickness*scale/2,scale));
  else add(new THREE.BoxGeometry(2,thickness,2),v(0,topY,0),undefined,new R.Cuboid(scale,thickness*scale/2,scale));
  const legHeight=height-thickness,spread=kind==='round'?.53:.79;
  for(const x of [-spread,spread])for(const z of [-spread,spread])add(new THREE.BoxGeometry(.13,legHeight,.13),v(x,legHeight/2,z),undefined,new R.Cuboid(.065*scale,legHeight*scale/2,.065*scale));
 }else{
  add(new THREE.CylinderGeometry(.3,.23,.42,32),v(0,.21,0));
  add(new THREE.CylinderGeometry(.32,.32,.065,32),v(0,.4175,0),undefined,new R.Cylinder(.0325*scale,.32*scale));
  if(kind==='snake'){
   for(let i=0;i<9;i++){
    const angle=i*2.39996,r=i===0?0:.13,h=.72+(i%4)*.15;
    const root=v(Math.cos(angle)*r,.43,Math.sin(angle)*r);
    const tip=v(Math.cos(angle)*(r+.13),.43+h,Math.sin(angle)*(r+.13));
    leaf(root,tip,.075,.019);
   }
  }else if(kind==='rubber'){
   stem(v(0,.43,0),v(.045,1.62,0),.028);
   for(let i=0;i<8;i++){
    const angle=i*2.39996,y=.66+i*.115;
    const root=v(.02,y,0),base=v(Math.cos(angle)*.15,y+.07,Math.sin(angle)*.15);
    stem(root,base,.012);
    leaf(base,v(Math.cos(angle)*.57,y+.26,Math.sin(angle)*.57),.15,.055);
   }
   leaf(v(.04,1.5,0),v(.09,1.85,.05),.10,.028);
  }else{
   for(let layer=0;layer<3;layer++)for(let i=0;i<6;i++){
    const angle=i*Math.PI/3+layer*.55,r=.40-layer*.10;
    leaf(v(0,.44+layer*.045,0),v(Math.cos(angle)*r,.54+layer*.18,Math.sin(angle)*r),.12-layer*.023,.047);
   }
  }
 }
 const geometry=mergeGeometries(geometries);for(const g of geometries)g.dispose();
 geometry.computeBoundingBox();const bounds=geometry.boundingBox,height=bounds.max.y-bounds.min.y,center=(bounds.min.y+bounds.max.y)/2;
 geometry.translate(0,-center,0);for(const part of parts)part.offset.y-=center;
 geometry.computeBoundingBox();return {geometry,parts,height};
}
