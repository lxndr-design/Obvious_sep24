import * as THREE from 'three';
import {WaveField} from './waves.js';
import {BATH,bathDimensions,bathContains} from './bath-shapes.js';


export function bathWaterContexts(objects,views=new Map()){
 const remaining=new Set(objects),result=new Map(),old=new Map([...views.values()].map(v=>[v.context.key,v.context]));
 while(remaining.size){
  const first=remaining.values().next().value,members=[first];remaining.delete(first);
  for(let i=0;i<members.length;i++){const a=members[i];if(a.type!=='birdbath'||!a.bathJoins||a.hanging)continue;
   for(const b of remaining){if(b.type!=='birdbath'||b.hanging||Math.abs(a.mesh.position.y-b.mesh.position.y)>.001)continue;
    const dx=b.mesh.position.x-a.mesh.position.x,dz=b.mesh.position.z-a.mesh.position.z;
    if(Math.abs(Math.abs(dx)+Math.abs(dz)-BATH.tile)<.001&&(Math.abs(dx)<.001||Math.abs(dz)<.001)){members.push(b);remaining.delete(b);}
   }
  }
  const key=members.map(o=>[o.id,o.mesh.position.x,o.mesh.position.y,o.mesh.position.z,o.bathJoins??0,o.hanging,...o.mesh.quaternion.toArray()].join(',')).sort().join(';');
  let context=old.get(key);
  if(!context){
   let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
   for(const o of members){const r=o.bathJoins?.75:bathDimensions(o).waterRadius;x0=Math.min(x0,o.mesh.position.x-r);x1=Math.max(x1,o.mesh.position.x+r);z0=Math.min(z0,o.mesh.position.z-r);z1=Math.max(z1,o.mesh.position.z+r);}
   const width=Math.max(x1-x0,z1-z0),x=(x0+x1)/2,z=(z0+z1)/2,size=members.length===1?33:Math.min(257,Math.max(33,Math.ceil(width/.045)+1));
   const field=new WaveField(size,width);field.energy=0;field.speed=1.1;field.damping=2.8;field.mask=new Uint8Array(size*size);
   for(const o of members){const r=o.bathJoins?.75:bathDimensions(o).waterRadius,px=o.mesh.position.x,pz=o.mesh.position.z;
    const ix0=Math.max(0,Math.floor((px-r-x+width/2)/field.dx)),ix1=Math.min(size-1,Math.ceil((px+r-x+width/2)/field.dx));
    const iz0=Math.max(0,Math.floor((pz-r-z+width/2)/field.dx)),iz1=Math.min(size-1,Math.ceil((pz+r-z+width/2)/field.dx));
    for(let j=iz0;j<=iz1;j++)for(let i=ix0;i<=ix1;i++){const lx=x-width/2+i*field.dx-px,lz=z-width/2+j*field.dx-pz;
     if(o.bathJoins?bathContains(lx,lz,o.bathJoins):Math.hypot(lx,lz)<=r+1e-6)field.mask[j*size+i]=1;
    }
   }
   context={key,field,x,z,members};
  }
  for(const o of members)result.set(o,context);
 }
 return result;
}
function sample(field,u,v){const n=field.size,x=Math.max(0,Math.min(n-1,u*(n-1))),z=Math.max(0,Math.min(n-1,v*(n-1))),i=Math.floor(x),j=Math.floor(z),k=Math.min(n-1,i+1),l=Math.min(n-1,j+1),a=x-i,b=z-j,h=field.height;return (h[j*n+i]*(1-a)+h[j*n+k]*a)*(1-b)+(h[l*n+i]*(1-a)+h[l*n+k]*a)*b;}

// Water wins only when it is actually in front of the rim, pedestal or another form.
export function hitBathWater(raycaster,views,solidHits=[]){
 const visible=[...views].filter(v=>v.group.visible&&!v.object.hanging);
 const hits=raycaster.intersectObjects(visible.map(v=>v.mesh),false);
 const hit=hits[0];if(!hit||solidHits[0]&&solidHits[0].distance<hit.distance-.0001)return null;
 return {point:hit.point,distance:hit.distance,view:visible.find(v=>v.mesh===hit.object)};
}

// A circular, displaced shallow-water surface and short-lived ballistic spray.
export class BathWater {
 constructor(object,context=bathWaterContexts([object]).get(object)){
  this.object=object;this.context=context;const dimensions=bathDimensions(object);this.group=new THREE.Group();object.mesh.add(this.group);
  this.group.position.y=dimensions.waterY-object.height/2;
  this.field=context.field;const width=object.bathJoins?BATH.tile:dimensions.waterRadius*2;
  this.geometry=new THREE.PlaneGeometry(width,width,32,32);this.geometry.rotateX(-Math.PI/2);
  const a=this.geometry.attributes.position,mask=new Uint8Array(a.count);
  for(let i=0;i<a.count;i++)mask[i]=object.bathJoins?bathContains(a.getX(i),a.getZ(i),object.bathJoins):Math.hypot(a.getX(i),a.getZ(i))<=dimensions.waterRadius;

  const indices=this.geometry.index.array,clipped=[];
  for(let i=0;i<indices.length;i+=3)if(mask[indices[i]]&&mask[indices[i+1]]&&mask[indices[i+2]])clipped.push(indices[i],indices[i+1],indices[i+2]);
  this.geometry.setIndex(clipped);this.geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),width);
  this.material=new THREE.MeshPhongMaterial({color:0x626262,specular:0xbcbcbc,shininess:45,transparent:true,opacity:.72,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.receiveShadow=true;this.group.add(this.mesh);
  this.spray=new THREE.InstancedMesh(new THREE.SphereGeometry(.014,6,4),this.material,48);this.spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.spray.frustumCulled=false;this.group.add(this.spray);
  this.drops=[];this.cursor=0;this.transform=new THREE.Object3D();this.splashCount=0;this.fountainTime=0;this.update(0,new THREE.Vector3());
 }
 uv(worldPosition){return {u:(worldPosition.x-this.context.x)/this.field.width+.5,v:(worldPosition.z-this.context.z)/this.field.width+.5};}
 stroke(from,to,seconds){this.field.stroke(from,to,seconds,.3);}
 splash(worldPosition){
  this.object.mesh.updateWorldMatrix(true,false);const p=this.object.mesh.worldToLocal(worldPosition.clone());
  const uv=this.uv(worldPosition);this.field.disturb(uv.u,uv.v,-.65,.075);this.splashCount++;
  for(let i=0;i<6;i++){
   const angle=(i/6+this.splashCount*.381966)*Math.PI*2,speed=.25+(i%3)*.13;
   this.drops[this.cursor]={position:new THREE.Vector3(p.x,.025,p.z),velocity:new THREE.Vector3(Math.cos(angle)*speed,.85+(i%2)*.35,Math.sin(angle)*speed),age:0};this.cursor=(this.cursor+1)%48;
  }
 }
 update(dt,wind,stepField=true){
  if(this.object.type==='fountain'&&dt>0){
   this.fountainTime+=dt;
   while(this.fountainTime>=1/35){
    this.fountainTime-=1/35;const angle=this.splashCount++*2.39996;
    this.drops[this.cursor]={position:new THREE.Vector3(0,.20,0),velocity:new THREE.Vector3(Math.cos(angle)*.30,2.35,Math.sin(angle)*.30),age:0};this.cursor=(this.cursor+1)%48;
    this.field.disturb(.5+Math.cos(angle)*.12,.5+Math.sin(angle)*.12,-.05,.055);
   }
  }
  this.field.windVector=wind.clone().multiplyScalar(.04);if(stepField)this.field.step(dt);
  const a=this.geometry.attributes.position;for(let i=0;i<a.count;i++){const uv=this.uv(new THREE.Vector3(a.getX(i)+this.object.mesh.position.x,0,a.getZ(i)+this.object.mesh.position.z));a.setY(i,sample(this.field,uv.u,uv.v));}a.needsUpdate=true;this.geometry.computeVertexNormals();
  for(let i=0;i<48;i++){
   const drop=this.drops[i];let visible=false;
   if(drop){drop.age+=dt;drop.velocity.y-=9.81*dt;drop.position.addScaledVector(drop.velocity,dt);visible=drop.age<(this.object.type==='fountain'?.8:.5)&&drop.position.y>0;if(!visible)this.drops[i]=null;}
   this.transform.position.copy(visible?drop.position:new THREE.Vector3());this.transform.scale.setScalar(visible?1:0);this.transform.updateMatrix();this.spray.setMatrixAt(i,this.transform.matrix);
  }
  this.spray.instanceMatrix.needsUpdate=true;
 }
 reset(){this.field.reset();this.drops=[];this.splashCount=0;this.fountainTime=0;this.update(0,new THREE.Vector3());}
 dispose(){this.group.visible=false;this.group.removeFromParent();this.geometry.dispose();this.spray.geometry.dispose();this.material.dispose();this.spray.dispose();}
}
