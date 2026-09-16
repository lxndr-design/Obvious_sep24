import * as THREE from 'three';
const IDENTITY={x:0,y:0,z:0,w:1};
// Position-based elastic strand: pinned root, inextensible segments, damped
// inertia and a soft rest-shape force. Collision projection uses Rapier shapes.
export class GrassStrand {
 constructor(root,height=1,lean=new THREE.Vector3(.08,0,0),count=9){
  this.root=root.clone();this.height=height;this.segment=height/(count-1);this.radius=.018;this.tipRadius=.018;this.rest=[];this.nodes=[];this.previous=[];
  for(let i=0;i<count;i++){const t=i/(count-1),p=root.clone().add(new THREE.Vector3(lean.x*t*t,height*t,lean.z*t*t));this.rest.push(p);this.nodes.push(p.clone());this.previous.push(p.clone());}
 }
 step(dt,wind,collide=null,pointer=null){
  const n=this.nodes.length,drag=Math.exp(-3.8*dt);
  for(let i=1;i<n;i++){
   const p=this.nodes[i],old=p.clone(),velocity=p.clone().sub(this.previous[i]).multiplyScalar(drag),t=i/(n-1);
   const acceleration=this.rest[i].clone().sub(p).multiplyScalar(24).addScaledVector(wind,28*t*t);acceleration.y-=.8*t;
   if(pointer){const away=p.clone().sub(pointer);away.y=0;const d=away.length();if(d<.42&&d>.001)acceleration.addScaledVector(away,(.42-d)*95/d);}
   p.add(velocity).addScaledVector(acceleration,dt*dt);this.previous[i].copy(old);
  }
  for(let iteration=0;iteration<7;iteration++){
   this.nodes[0].copy(this.root);
   for(let i=1;i<n;i++){
    const a=this.nodes[i-1],b=this.nodes[i],delta=b.clone().sub(a),d=delta.length();if(d<1e-9)continue;
    const error=delta.multiplyScalar((d-this.segment)/d);
    if(i===1)b.sub(error);else{a.addScaledVector(error,.5);b.addScaledVector(error,-.5);}
   }
   // Resolve after constraints so the final node positions never finish inside solids.
   for(let i=1;i<n;i++){this.nodes[i].y=Math.max(this.nodes[i].y,this.radius);if(iteration>=5)collide?.(this.nodes[i],i===n-1?this.tipRadius:this.radius);}
  }
  this.nodes[0].copy(this.root);
 }
 reset(){for(let i=0;i<this.nodes.length;i++){this.nodes[i].copy(this.rest[i]);this.previous[i].copy(this.rest[i]);}}
}
const localBounds=new WeakMap();
export function prepareGrassColliders(objects){
 const prepared=[];
 for(const o of objects)for(const part of o.parts){
  let bounds=localBounds.get(part.shape);
  if(!bounds){
   bounds=new THREE.Box3();const shape=part.shape;
   if(shape.vertices){const v=shape.vertices;for(let i=0;i<v.length;i+=3)bounds.expandByPoint(new THREE.Vector3(v[i],v[i+1],v[i+2]));}
   else{const ext=shape.halfExtents??{x:shape.radius,y:shape.halfHeight??shape.radius,z:shape.radius};bounds.set(new THREE.Vector3(-ext.x,-ext.y,-ext.z),new THREE.Vector3(ext.x,ext.y,ext.z));}
   localBounds.set(shape,bounds);
  }
  const rotation=part.rotation?o.mesh.quaternion.clone().multiply(part.rotation):o.mesh.quaternion.clone(),position=part.offset.clone().applyQuaternion(o.mesh.quaternion).add(o.mesh.position);
  const worldBounds=bounds.clone().applyMatrix4(new THREE.Matrix4().compose(position,rotation,new THREE.Vector3(1,1,1))).expandByScalar(.25);
  prepared.push({shape:part.shape,position,rotation,body:o.body,bounds:worldBounds});
 }
 return prepared;
}
export function makeGrassCollider(R,objects,root,reach){
 const prepared=objects[0]?.bounds?objects:prepareGrassColliders(objects);
 const candidates=prepared.filter(c=>c.bounds.distanceToPoint(root)<reach+.1);
 if(!candidates.length)return null;
 const probe=new R.Ball(.018);
 return (point,radius=.018)=>{
  probe.radius=radius;
  for(const c of candidates){
   if(!c.bounds.containsPoint(point))continue;
   const contact=probe.contactShape(point,IDENTITY,c.shape,c.position,c.rotation,0);
   if(contact&&contact.distance<0){const correction=Math.min(-contact.distance+.0005,.8);point.addScaledVector(contact.normal2,correction);
    if(c.body?.isDynamic())c.body.applyImpulseAtPoint(new THREE.Vector3().copy(contact.normal2).multiplyScalar(-Math.min(correction,.04)*.0005),point,true);
   }
  }
 };
}
