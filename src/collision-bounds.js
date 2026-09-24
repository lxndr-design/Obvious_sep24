import * as THREE from 'three';
const localBounds=new WeakMap(),unit=new THREE.Vector3(1,1,1);
// Bounds only reject impossible pairs; surviving pairs still use exact Rapier shapes.
export function shapeBounds(shape){
 let bounds=localBounds.get(shape);if(bounds)return bounds;
 bounds=new THREE.Box3();
 if(shape.vertices){for(let i=0;i<shape.vertices.length;i+=3)bounds.expandByPoint(new THREE.Vector3(shape.vertices[i],shape.vertices[i+1],shape.vertices[i+2]));}
 else{const ext=shape.halfExtents??{x:shape.radius,y:shape.halfHeight??shape.radius,z:shape.radius};bounds.set(new THREE.Vector3(-ext.x,-ext.y,-ext.z),new THREE.Vector3(ext.x,ext.y,ext.z));}
 localBounds.set(shape,bounds);return bounds;
}
export function prepareParts(object,position,quaternion){return object.parts.map(part=>{const center=part.offset.clone().applyQuaternion(quaternion).add(position),rotation=part.rotation?quaternion.clone().multiply(part.rotation):quaternion;return {shape:part.shape,position:center,rotation,bounds:shapeBounds(part.shape).clone().applyMatrix4(new THREE.Matrix4().compose(center,rotation,unit)).expandByScalar(.0001)};});}
export function sweptBounds(bounds,velocity){return bounds.clone().union(bounds.clone().translate(velocity));}
