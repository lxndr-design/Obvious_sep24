import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Small white silhouettes. Geometry stays deliberately sparse; light supplies the detail.
export function bladeGeometry(nodes){
 const g=new THREE.BufferGeometry(),index=[];
 g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nodes*2*3),3));
 for(let i=0;i<nodes-1;i++){const a=i*2,b=a+2;index.push(a,b,a+1);if(i<nodes-2)index.push(a+1,b,b+1);}
 g.setIndex(index);return g;
}
export function flowerHead(kind,material){
 const group=new THREE.Group(),vertices=[],indices=[];
 vertices.push(0,.008,0);
 const petals=kind==='daisy'?7:9,radius=kind==='daisy'?.085:.075;
 // A single planar radial silhouette, anchored to the flexible stem tip.
 for(let i=0;i<petals;i++)for(const [phase,r]of [[0,.24],[.30,1],[.65,1]]){
  const angle=(i+phase)/petals*Math.PI*2;vertices.push(Math.cos(angle)*radius*r,0,Math.sin(angle)*radius*r);
 }
 const n=petals*3;for(let i=0;i<n;i++)indices.push(0,1+i,1+(i+1)%n);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return group;
}
export const BIRD_PALETTES=[
 {name:'Blue',body:0x527fa3,wing:0x334f72},
 {name:'Rust',body:0xb97550,wing:0x775047},
 {name:'Gold',body:0xc5a34c,wing:0x827340},
 {name:'Charcoal',body:0x555c67,wing:0x303642},
 {name:'White',body:0xf4f1e7,wing:0xbcc5cd},
];
export function birdMesh(palette=null){
 const group=new THREE.Group(),body=new THREE.Group();group.add(body);
 const material=new THREE.MeshStandardMaterial({color:palette?.body??0xffffff,roughness:1,transparent:true,opacity:0,side:THREE.DoubleSide,flatShading:true});
 const wingMaterial=material.clone();wingMaterial.color.setHex(palette?.wing??0xffffff);
 // One continuous beak/head/breast/back/tail profile, rather than stacked spheres.
 const outline=new THREE.Shape();
 const points=[[-.20,.055],[-.09,.015],[-.015,-.025],[.055,-.013],[.085,.035],[.155,.052],[.111,.072],[.09,.10],[.052,.105],[.028,.075],[-.025,.045],[-.20,.09]];
 outline.moveTo(...points[0]);for(const p of points.slice(1))outline.lineTo(...p);outline.closePath();
 const geometry=new THREE.ExtrudeGeometry(outline,{depth:.046,bevelEnabled:false,curveSegments:1,steps:1});geometry.translate(0,0,-.023);
 const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;body.add(mesh);
 const wings=[];
 for(const sign of [1,-1]){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([.045,0,0,-.09,.006,sign*.025,-.13,.012,sign*.09,-.005,.01,sign*.065],3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
  const wing=new THREE.Mesh(g,wingMaterial);wing.position.set(-.015,.016,sign*.024);wing.castShadow=true;wing.receiveShadow=true;body.add(wing);wings.push(wing);
 }
 const feet=new THREE.BufferGeometry();feet.setAttribute('position',new THREE.Float32BufferAttribute([.019,-.08,.015,.029,-.08,.015,.032,-.015,.015,.019,-.08,-.015,.029,-.08,-.015,.032,-.015,-.015],3));feet.computeVertexNormals();
 const legs=new THREE.Mesh(feet,material);legs.castShadow=true;group.add(legs);
 return {group,body,wings,materials:[material,wingMaterial]};
}
export function seedForm(R){
 const geometries=[],parts=[];
 function add(g){parts.push({shape:new R.ConvexPolyhedron(new Float32Array(g.attributes.position.array)),offset:new THREE.Vector3()});const flat=g.index?g.toNonIndexed():g.clone();flat.deleteAttribute('uv');geometries.push(flat);g.dispose();}
 add(new THREE.IcosahedronGeometry(.065,0));
 for(let i=0;i<8;i++){
  const y=1-2*(i+.5)/8,a=i*2.39996,r=Math.sqrt(1-y*y),direction=new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r);
  const geometry=new THREE.ConeGeometry(.018,.06,3);geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction));const offset=direction.multiplyScalar(.075);geometry.translate(offset.x,offset.y,offset.z);add(geometry);
 }
 const geometry=mergeGeometries(geometries);for(const g of geometries)g.dispose();return {geometry,parts};
}
