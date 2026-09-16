import * as THREE from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
export const LABELS={box:'Block',sphere:'Sphere',cylinder:'Column',arch:'Arch',pebble:'Pebble'};
export function makeForm(type,R){
 let geometry,parts=[],height;
 if(type==='box'){height=1.35;geometry=new THREE.BoxGeometry(1.35,height,1.35);parts=[{shape:new R.Cuboid(.675,.675,.675)}];}
 else if(type==='sphere'){height=1.5;geometry=new THREE.SphereGeometry(.75,48,32);parts=[{shape:new R.Ball(.75)}];}
 else if(type==='cylinder'){height=1.9;geometry=new THREE.CylinderGeometry(.6,.6,height,64);parts=[{shape:new R.Cylinder(height/2,.6)}];}
 else if(type==='arch'){
  const outer=1.1,inner=.58,shoulder=1.15,depth=.7,segments=24;height=shoulder+outer;
  const s=new THREE.Shape();s.moveTo(-outer,-height/2);s.lineTo(-outer,shoulder-height/2);
  for(let i=0;i<=segments;i++){const a=Math.PI-i*Math.PI/segments;s.lineTo(Math.cos(a)*outer,shoulder+Math.sin(a)*outer-height/2);}
  s.lineTo(outer,-height/2);s.lineTo(inner,-height/2);s.lineTo(inner,shoulder-height/2);
  for(let i=0;i<=segments;i++){const a=i*Math.PI/segments;s.lineTo(Math.cos(a)*inner,shoulder+Math.sin(a)*inner-height/2);}
  s.lineTo(-inner,-height/2);s.closePath();geometry=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:segments});geometry.translate(0,0,-depth/2);
  parts.push({shape:new R.Cuboid((outer-inner)/2,shoulder/2,depth/2),offset:new THREE.Vector3(-(outer+inner)/2,(shoulder-height)/2,0)},{shape:new R.Cuboid((outer-inner)/2,shoulder/2,depth/2),offset:new THREE.Vector3((outer+inner)/2,(shoulder-height)/2,0)});
  for(let i=0;i<segments;i++){const vertices=[];for(const z of [-depth/2,depth/2])for(const [r,a] of [[outer,i*Math.PI/segments],[outer,(i+1)*Math.PI/segments],[inner,(i+1)*Math.PI/segments],[inner,i*Math.PI/segments]])vertices.push(Math.cos(a)*r,shoulder+Math.sin(a)*r-height/2,z);parts.push({shape:new R.ConvexPolyhedron(new Float32Array(vertices))});}
 }else if(type==='pebble'){
  const points=[];for(let i=0;i<65;i++){const y=1-2*(i+.5)/65,a=i*2.399963;const r=Math.sqrt(1-y*y);const f=1+.13*Math.sin(a*3+y*4)+.08*Math.cos(a*2-y*3);points.push(new THREE.Vector3(Math.cos(a)*r*f*.85,y*f*.82,Math.sin(a)*r*f*.72));}
  geometry=new ConvexGeometry(points);geometry.computeBoundingBox();height=geometry.boundingBox.max.y-geometry.boundingBox.min.y;geometry.translate(0,-(geometry.boundingBox.min.y+geometry.boundingBox.max.y)/2,0);parts=[{shape:new R.ConvexPolyhedron(new Float32Array(geometry.attributes.position.array))}];
 }else throw Error('Unknown form');
 geometry.computeBoundingBox();return {geometry,parts:parts.map(p=>({...p,offset:p.offset||new THREE.Vector3()})),height};
}
