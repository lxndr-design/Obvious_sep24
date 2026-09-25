import * as THREE from 'three';
import {mulberry32} from './gen/series.js';

// Presets are render+physics descriptors: one shared deterministic geometry,
// a plain-data collider the sim worker turns into Rapier shapes, and behavior
// tags its force layer reads. Nothing here imports Rapier — the worker owns it.

function blobGeometry(){
 // Seeded multi-sine displacement, a pure function of position so the sphere's
 // duplicated seam vertices stay welded and the normals stay smooth.
 const g=new THREE.SphereGeometry(.72,28,20);
 const rng=mulberry32(11);
 const a=rng()*Math.PI*2,b=rng()*Math.PI*2,c=rng()*Math.PI*2;
 const pos=g.attributes.position,v=new THREE.Vector3();
 for(let i=0;i<pos.count;i++){
  v.fromBufferAttribute(pos,i);
  const w=Math.sin(v.x*3.4+a*7)+Math.sin(v.y*4.2+b*5)+Math.sin(v.z*3.8+c*9);
  v.multiplyScalar(1+.055*w/3);
  pos.setXYZ(i,v.x,v.y,v.z);
 }
 g.computeVertexNormals();
 return g;
}

export const PRESETS={
 blob:{label:'Blob',color:'#7fd4ff',material:'gloss',behavior:'float',behaviors:['float','wave'],makeGeometry:blobGeometry,collider:{shape:'ball',radius:.78}},
 ico:{label:'Ico',color:'#ffd27f',material:'gloss',behavior:'orbit',behaviors:['orbit','wave'],makeGeometry:()=>new THREE.IcosahedronGeometry(.7,0),collider:{shape:'ball',radius:.7}},
 capsule:{label:'Capsule',color:'#ff8fae',material:'matte',behavior:'wave',behaviors:['wave','float'],makeGeometry:()=>new THREE.CapsuleGeometry(.3,.6,6,14),collider:{shape:'capsule',halfHeight:.3,radius:.3}},
 torus:{label:'Torus',color:'#b6f27f',material:'iridescent',behavior:'orbit',behaviors:['orbit','float'],makeGeometry:()=>new THREE.TorusGeometry(.45,.19,18,36),collider:{shape:'ball',radius:.62,approx:'ball approximates the ring hull'}},
 box:{label:'Box',color:'#cbb2ff',material:'matte',behavior:'none',behaviors:['none'],makeGeometry:()=>new THREE.BoxGeometry(.9,.9,.9),collider:{shape:'cuboid',halfExtents:[.45,.45,.45]}},
};
export const PRESET_NAMES=Object.keys(PRESETS);

// One geometry per preset for the life of the process: every InstancedMesh
// bucket shares it, instances vary by scale, color and material only. The
// cache is deliberately process-wide — dispose() never releases it.
const geometryCache=new Map();
export function presetGeometry(name){
 if(!geometryCache.has(name))geometryCache.set(name,PRESETS[name].makeGeometry());
 return geometryCache.get(name);
}
