import {Vector3,Triangle} from 'three';

// Find a point on the projected mesh, rather than combining unrelated box corners.
// Cache stationary objects so this does not scan their triangles every frame.
const cache=new WeakMap();
export function messageDotPosition(mesh,camera,width,height){
 mesh.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);
 const geometry=mesh.geometry,positions=geometry.getAttribute('position');
 const key=[geometry.uuid,positions.version,width,height,...mesh.matrixWorld.elements,...camera.matrixWorldInverse.elements,...camera.projectionMatrix.elements].join(',');
 const previous=cache.get(mesh);if(previous?.key===key)return previous.point;
 const vertices=[];let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
 for(let i=0;i<positions.count;i++){
  const p=new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).project(camera);
  if(p.z < -1||p.z > 1){vertices.push(null);continue;}
  p.set((p.x+1)*width/2,(1-p.y)*height/2,0);vertices.push(p);
  left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);
 }
 const target=new Vector3(right-Math.min(8,(right-left)*.15),top+Math.min(8,(bottom-top)*.15),0);
 const triangle=new Triangle(),closest=new Vector3(),center=new Vector3();let best=Infinity,point=null;
 const count=geometry.index?.count??positions.count;
 for(let i=0;i<count;i+=3){
  const a=vertices[geometry.index?geometry.index.getX(i):i],b=vertices[geometry.index?geometry.index.getX(i+1):i+1],c=vertices[geometry.index?geometry.index.getX(i+2):i+2];
  if(!a||!b||!c)continue;triangle.set(a,b,c);if(triangle.getArea()<.001)continue;
  triangle.closestPointToPoint(target,closest);const score=closest.distanceToSquared(target);
  if(score>=best)continue;best=score;triangle.getMidpoint(center);
  // Inset toward this triangle's interior; even a concave arch stays on its surface.
  point=closest.clone().lerp(center,Math.min(1,3/Math.max(closest.distanceTo(center),.001)));
 }
 cache.set(mesh,{key,point});return point;
}
