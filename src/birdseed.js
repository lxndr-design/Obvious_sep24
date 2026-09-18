import * as THREE from 'three';
export class BirdseedField {
 constructor(random=Math.random){this.random=random;this.seeds=new Map();this.patches=[];this.sequence=0;this.patchSequence=0;this.eaten=0;this.capacity=512;this.version=0;}
 scatter(point,valid=()=>true,count=5){
  let patch=this.patches.find(p=>p.position.distanceTo(point)<1.2),added=0;
  if(!patch){patch={id:`food-${++this.patchSequence}`,position:point.clone()};this.patches.push(patch);}
  const room=this.capacity-this.remaining;
  for(let i=0;i<Math.min(count,room);i++){
   const angle=this.random()*Math.PI*2,r=Math.sqrt(this.random())*.45,p=point.clone().add(new THREE.Vector3(Math.cos(angle)*r,0,Math.sin(angle)*r));p.y=.052;
   if(!valid(p))continue;const id=++this.sequence;this.seeds.set(id,{id,patch:patch.id,position:p,owner:null,eatenBy:null});added++;
  }
  if(added)this.version++;return added;
 }
 get remaining(){return this.sequence-this.eaten;}
 available(patch=null){return [...this.seeds.values()].filter(s=>s.eatenBy===null&&(!patch||s.patch===patch));}
 sites(){return this.patches.map(p=>({...p,kind:'seed',count:this.available(p.id).length,field:this})).filter(p=>p.count>0);}
 claim(position,bird,patch,valid=()=>true){const seed=this.available(patch).filter(s=>(s.owner===null||s.owner===bird)&&valid(s.position)).sort((a,b)=>a.position.distanceToSquared(position)-b.position.distanceToSquared(position))[0];if(seed)seed.owner=bird;return seed??null;}
 release(bird){for(const seed of this.seeds.values())if(seed.owner===bird&&seed.eatenBy===null)seed.owner=null;}
 consume(id,bird){const seed=this.seeds.get(id);if(!seed||seed.eatenBy!==null||seed.owner!==bird)return false;seed.eatenBy=bird;seed.owner=null;this.eaten++;this.version++;return true;}
 reset(){this.seeds.clear();this.patches=[];this.sequence=this.patchSequence=this.eaten=0;this.version++;}
 read(){return {scattered:this.sequence,remaining:this.remaining,eaten:this.eaten,seeds:[...this.seeds.values()].map(s=>({id:s.id,position:s.position.toArray(),eatenBy:s.eatenBy}))};}
}
export class BirdseedView {
 constructor(scene,field){this.field=field;this.version=-1;this.mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.08,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true}),field.capacity);this.mesh.count=0;this.mesh.castShadow=this.mesh.receiveShadow=true;this.mesh.frustumCulled=false;scene.add(this.mesh);this.transform=new THREE.Object3D();}
 update(){if(this.version===this.field.version)return;this.version=this.field.version;const seeds=this.field.available();this.mesh.count=seeds.length;seeds.forEach((s,i)=>{this.transform.position.copy(s.position);this.transform.scale.set(.75,.65,1);this.transform.rotation.y=s.id*2.4;this.transform.updateMatrix();this.mesh.setMatrixAt(i,this.transform.matrix);});this.mesh.instanceMatrix.needsUpdate=true;}
}
export function feedBird(bird,site,dt,clear=()=>true){
 const field=site.field;bird.seedField=field;
 if(bird.fullness>=bird.capacity){bird.state='sated';bird.age=0;bird.peck=0;field.release(bird.id);return;}
 let seed=field.seeds.get(bird.seedId);
 if(!seed||seed.eatenBy!==null||seed.owner!==bird.id){seed=field.claim(bird.position,bird.id,site.id,p=>clear(p.clone().setY(.08),site));bird.seedId=seed?.id;bird.eatTime=0;}
 if(!seed){bird.peck=0;return;}
 if(!clear(seed.position.clone().setY(.08),site)){field.release(bird.id);bird.seedId=null;return;}
 const target=seed.position.clone().setY(.08),delta=target.clone().sub(bird.position);delta.y=0;const distance=delta.length();
 if(distance>.065){const next=bird.position.clone().addScaledVector(delta,Math.min(1,dt*.7/distance));next.y=.08;if(clear(next,site))bird.position.copy(next);else{field.release(bird.id);bird.seedId=null;}bird.yaw=Math.atan2(-delta.z,delta.x);bird.peck=0;return;}
 bird.eatTime=(bird.eatTime??0)+dt;bird.peck=Math.max(0,Math.sin(Math.min(1,bird.eatTime/.5)*Math.PI));
 if(bird.eatTime>=.25&&field.consume(seed.id,bird.id)){bird.fullness++;bird.fatness=bird.fullness/bird.capacity;bird.seedId=null;bird.eatTime=0;}
}
