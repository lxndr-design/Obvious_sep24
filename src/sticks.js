import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Two tapered, four-sided branches, each with its own matching convex collider.
export function makeStick(R){
 const pieces=[],parts=[];
 for(const [from,to,r]of [[[-.23,0,0],[.23,0,.025],.022],[[.02,0,.01],[.13,0,-.13],.015]]){
  const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),g=new THREE.CylinderGeometry(r*.65,r,a.distanceTo(b),4);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.add(b).multiplyScalar(.5).toArray());
  parts.push({shape:new R.ConvexPolyhedron(new Float32Array(g.attributes.position.array)),offset:new THREE.Vector3()});pieces.push(g);
 }
 const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());geometry.computeBoundingBox();return {geometry,parts,height:geometry.boundingBox.max.y-geometry.boundingBox.min.y};
}

export class StickCollection {
 constructor(objects){this.objects=objects;this.owners=new Map();this.taken=new Set();this.canTake=()=>true;this.onTake=null;}
 eligible(o){return o.type==='stick'&&!o.hanging&&!o.properties?.locked&&!this.taken.has(o.id)&&o.mesh.position.y>=o.height/2-.01&&this.canTake(o);}
 sites(){
  const objects=this.objects().filter(o=>this.eligible(o));for(const id of this.owners.keys())if(!objects.some(o=>o.id===id))this.owners.delete(id);
  return objects.map(o=>({id:`stick-${o.id}`,kind:'stick',object:o,position:o.mesh.position.clone(),collection:this}));
 }
 claim(site,bird){if(!this.eligible(site.object))return false;const owner=this.owners.get(site.object.id);if(owner!==undefined&&owner!==bird)return false;this.owners.set(site.object.id,bird);return true;}
 release(bird){for(const [id,owner]of this.owners)if(owner===bird)this.owners.delete(id);}
 take(site,bird){
  const o=site.object;if(this.owners.get(o.id)!==bird||!this.objects().includes(o)||!this.eligible(o)||!this.onTake)return null;
  const mesh=new THREE.Mesh(o.geometry.clone(),o.mesh.material.clone());mesh.material.transparent=true;mesh.material.depthWrite=false;mesh.position.set(.14,.053,0);mesh.rotation.y=Math.PI/2;mesh.castShadow=mesh.receiveShadow=true;
  if(this.onTake(o)===false){mesh.geometry.dispose();mesh.material.dispose();return null;}
  this.taken.add(o.id);this.owners.delete(o.id);mesh.userData.stickId=o.id;return mesh;
 }
 reset(){this.owners.clear();this.taken.clear();}
}
export function stickLanding(site){return site.position.clone().add(new THREE.Vector3(-.14,.08-site.object.height/2,0));}
export function attachCarriedStick(view,bird){
 if(!bird.carriedStick)return;
 if(bird.carriedStick.parent!==view.body){view.body.add(bird.carriedStick);view.materials.push(bird.carriedStick.material);}
}
