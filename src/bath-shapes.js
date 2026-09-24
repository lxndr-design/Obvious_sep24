import * as THREE from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {stackingProfile} from './stacking.js';
export const BATH={height:1.20,waterY:1.10,waterRadius:.60,rimRadius:.68,tile:1.5};
export const FOUNTAIN={height:1.53,waterY:1.43,waterRadius:.57,rimRadius:.69};
export const bathDimensions=o=>{const d=o.type==='fountain'?FOUNTAIN:BATH,s=o.modelScale??1;return s===1?d:Object.fromEntries(Object.entries(d).map(([key,value])=>[key,value*s]));};

const outlines=new Map(),templates=new WeakMap();
// Circular exposed corners become straight, open edges where another tile joins.
export function bathOutline(radius,joins=0){
 const key=radius+':'+joins;if(outlines.has(key))return outlines.get(key);const points=[];
 for(let quadrant=0;quadrant<4;quadrant++)for(let i=0;i<12;i++){
  const angle=(quadrant+i/12)*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),sx=c>=-1e-9?1:-1,sz=s>=-1e-9?1:-1;
  const jx=joins&(sx<0?1:2),jz=joins&(sz<0?4:8);
  if(!jx&&!jz){points.push([c*radius,s*radius]);continue;}
  const x=jx?.75:radius,z=jz?.75:radius,t=Math.atan2(Math.abs(s),Math.abs(c))/(Math.PI/2);
  points.push(t<=.5?[sx*x,sz*z*t*2]:[sx*x*(2-t*2),sz*z]);
 }
 outlines.set(key,points);return points;
}
export function bathContains(x,z,joins=0,radius=BATH.waterRadius){
 // Convex tile outline; this also defines the shared wave field mask.
 const p=bathOutline(radius,joins);let positive=false,negative=false;
 for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],cross=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);positive||=cross>1e-6;negative||=cross< -1e-6;if(positive&&negative)return false;}
 return true;
}
export function makeBirdbath(R,joins=0){
 let cache=templates.get(R);if(!cache){cache=new Map();templates.set(R,cache);}
 const clone=f=>({...f,geometry:f.geometry.clone(),parts:f.parts.map(p=>({...p,offset:p.offset.clone()}))});
 if(cache.has(joins))return clone(cache.get(joins));
 const pieces=[],parts=[],center=BATH.height/2;
 function add(g,analytic=null,offset=new THREE.Vector3()){
  g.translate(offset.x,offset.y-center,offset.z);
  if(analytic)parts.push({shape:analytic,offset:new THREE.Vector3(offset.x,offset.y-center,offset.z)});
  else{const clean=g.clone();clean.deleteAttribute('normal');clean.deleteAttribute('uv');const hull=mergeVertices(clean,1e-6);parts.push({shape:new R.ConvexPolyhedron(new Float32Array(hull.attributes.position.array),new Uint32Array(hull.index.array)),offset:new THREE.Vector3()});clean.dispose();hull.dispose();}
  const flat=g.index?g.toNonIndexed():g.clone();flat.deleteAttribute('uv');pieces.push(flat);g.dispose();
 }
 add(new THREE.CylinderGeometry(.42,.42,.12,24),new R.Cylinder(.06,.42),new THREE.Vector3(0,.06,0));
 add(new THREE.CylinderGeometry(.19,.19,.85,20),new R.Cylinder(.425,.19),new THREE.Vector3(0,.545,0));
 const outer=bathOutline(.75,joins),inner=bathOutline(.61,joins),v=(p,y)=>new THREE.Vector3(p[0],y,p[1]);
 add(new ConvexGeometry(outer.flatMap(p=>[v(p,.92),v(p,1.01)])));
 // Interior witness avoids ambiguous fully coincident convex hull contacts.
 parts.push({shape:new R.Cuboid(.25,.035,.25),offset:new THREE.Vector3(0,.96-center,0)});
 for(let i=0;i<outer.length;i++){
  const k=(i+1)%outer.length,a=outer[i],b=outer[k];
  const open=(joins&1&&Math.abs(a[0]+.75)<1e-6&&Math.abs(b[0]+.75)<1e-6)||(joins&2&&Math.abs(a[0]-.75)<1e-6&&Math.abs(b[0]-.75)<1e-6)||(joins&4&&Math.abs(a[1]+.75)<1e-6&&Math.abs(b[1]+.75)<1e-6)||(joins&8&&Math.abs(a[1]-.75)<1e-6&&Math.abs(b[1]-.75)<1e-6);
  if(open)continue;
  add(new ConvexGeometry([v(a,1.01),v(b,1.01),v(a,BATH.height),v(b,BATH.height),v(inner[i],1.01),v(inner[k],1.01),v(inner[i],BATH.height),v(inner[k],BATH.height)]));
 }
 const geometry=mergeGeometries(pieces);for(const g of pieces)g.dispose();geometry.computeBoundingBox();
 const form={geometry,parts,height:BATH.height,bathJoins:joins};form.stacking=stackingProfile('birdbath',form);cache.set(joins,form);return clone(form);
}
