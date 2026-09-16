import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GrassStrand,makeGrassCollider,prepareGrassColliders} from './grass.js';
import {BirdColony,seededRandom} from './birds.js';
import {inWater} from './terrain.js';
const UP=new THREE.Vector3(0,1,0),IDENTITY={x:0,y:0,z:0,w:1};
const smooth=t=>Math.max(0,Math.min(1,t));
function leafGeometry(scale=1){
 const vertices=new Float32Array([-.21,0,0,-.06,.018,-.10,.22,.028,0,-.05,.025,.11,0,.045,0]);
 for(let i=0;i<vertices.length;i++)vertices[i]*=scale;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(vertices,3));g.setIndex([0,1,4,1,2,4,2,3,4,3,0,4]);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
function bladeGeometry(nodes){const g=new THREE.BufferGeometry(),index=[];g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nodes*4*3),3));for(let i=0;i<nodes-1;i++)for(let side=0;side<2;side++){const a=i*4+side*2,b=a+4;index.push(a,b,a+1,a+1,b,b+1);}g.setIndex(index);return g;}
function flowerHead(kind,material){
 const group=new THREE.Group(),parts=[];
 if(kind==='daisy'){
  for(let i=0;i<11;i++){const angle=i/11*Math.PI*2,g=new THREE.SphereGeometry(1,10,6);g.scale(.14,.025,.047);g.translate(.13,0,0);g.rotateY(angle);parts.push(g);}
  group.add(new THREE.Mesh(mergeGeometries(parts),material));
  const center=new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),new THREE.MeshStandardMaterial({color:0xb9c0ac,roughness:1}));center.scale.y=.4;center.position.y=.027;group.add(center);
 }else{
  const points=[];for(let i=0;i<42;i++){const y=1-2*(i+.5)/42,a=i*2.39996,r=Math.sqrt(1-y*y),end=new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r).multiplyScalar(.17);points.push(new THREE.Vector3(),end);const g=new THREE.SphereGeometry(.018,5,4);g.translate(end.x,end.y,end.z);parts.push(g);}
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xc8cebf})));
  group.add(new THREE.Mesh(mergeGeometries(parts),material));
 }
 for(const p of parts)p.dispose();group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return group;
}
function birdMesh(){
 const group=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:0xfafcf4,roughness:1,transparent:true,opacity:0}),dark=new THREE.MeshStandardMaterial({color:0x404b3c,roughness:1,transparent:true,opacity:0});
 const body=new THREE.Group();group.add(body);const ball=(x,y,z,sx,sy,sz,mat=material)=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;body.add(mesh);return mesh;};
 ball(0,.06,0,.19,.12,.115);ball(.145,.17,0,.083,.085,.074);ball(.19,.195,.056,.014,.014,.009,dark);ball(.19,.195,-.056,.014,.014,.009,dark);
 const beak=new THREE.Mesh(new THREE.ConeGeometry(.026,.095,6),dark);beak.rotation.z=-Math.PI/2;beak.position.set(.247,.15,0);body.add(beak);
 const tail=new THREE.Mesh(new THREE.ConeGeometry(.073,.23,3),material);tail.rotation.z=Math.PI/2-.25;tail.position.set(-.23,.07,0);body.add(tail);
 const wings=[ball(-.02,.09,.105,.17,.032,.084),ball(-.02,.09,-.105,.17,.032,.084)];
 for(const z of [-.052,.052]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.14,5),dark);leg.position.set(.035,-.012,z);group.add(leg);}
 return {group,body,wings,materials:[material,dark]};
}
export class Ecology {
 constructor(scene,pendulums,collision,wind,R){
  this.scene=scene;this.pendulums=pendulums;this.world=pendulums.world;this.collision=collision;this.wind=wind;this.R=R;
  this.group=new THREE.Group();scene.add(this.group);this.material=new THREE.MeshStandardMaterial({color:0xf8faf2,roughness:.95,side:THREE.DoubleSide});
  this.strands=[];this.loose=[];this.piles=[];this.birdViews=new Map();this.colony=new BirdColony();this.random=seededRandom(731);this.accumulator=0;this.pointer=null;this.pointerScreen=null;this.water=null;this.lastLeafRead=0;this.clock=0;
  this.colony.onPeck=(position,pile)=>{const leaves=this.loose.filter(o=>o.pileId===pile.id);leaves.sort((a,b)=>a.mesh.position.distanceToSquared(position)-b.mesh.position.distanceToSquared(position));const leaf=leaves[0];if(leaf)leaf.body.applyImpulse({x:(this.random()-.5)*leaf.body.mass()*.4,y:leaf.body.mass()*.35,z:(this.random()-.5)*leaf.body.mass()*.4},true);};
  this.createPlants();this.createLoose();
 }
 createPlants(){
  const patches=[[-6,3],[-5,-1.5],[-3.5,4.8],[.1,2.1],[2,5],[5.9,1.8],[6.5,-2.5],[-1.8,-4.5],[-6,-4.8],[1,-5.1],[5.9,-4.8],[-.2,-2.8],[-2,1.4],[7.5,4.5],[-8,-1],[8,-5],[-4,7],[4.4,6.7]];
  for(const [x,z] of patches)for(let i=0;i<2;i++)this.addStrand(x+(this.random()-.5)*.2,z+(this.random()-.5)*.2,.65+this.random()*.9);
  this.addStrand(-2.1,4.4,1.02,'daisy');this.addStrand(6.2,.8,.92,'dandelion');this.addStrand(-5.7,-3,.85,'daisy');
 }
 addStrand(x,z,height,flower=null){
  const angle=this.random()*Math.PI*2,strand=new GrassStrand(new THREE.Vector3(x,.005,z),height,new THREE.Vector3(Math.cos(angle)*.12,0,Math.sin(angle)*.12));
  const geometry=bladeGeometry(strand.nodes.length),mesh=new THREE.Mesh(geometry,this.material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
  const head=flower?flowerHead(flower,this.material):null;strand.tipRadius=flower==='daisy'?.24:flower==='dandelion'?.19:.018;if(head)this.group.add(head);this.group.add(mesh);this.strands.push({strand,mesh,head,angle,width:flower ? .012 : .032});
 }
 addLoose(mesh,parts,type,pileId=null){
  mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);
  const desc=this.R.RigidBodyDesc.dynamic().setTranslation(mesh.position.x,mesh.position.y,mesh.position.z).setRotation(mesh.quaternion).setCcdEnabled(true).setLinearDamping(type==='leaf'?1.4:.16).setAngularDamping(type==='leaf'?1.8:.35);
  const body=this.world.createRigidBody(desc);
  for(const part of parts)this.world.createCollider(new this.R.ColliderDesc(part.shape).setTranslation(part.offset.x,part.offset.y,part.offset.z).setRotation(part.rotation??IDENTITY).setDensity(type==='leaf'?.13:.5).setFriction(type==='leaf'?.1:.8).setRestitution(type==='seed'?0:.1).setContactSkin(type==='seed'?.003:0),body);
  const object={mesh,geometry:mesh.geometry,parts,body,type,pileId,spawn:mesh.position.clone(),spawnRotation:mesh.quaternion.clone(),lastWet:false};this.loose.push(object);return object;
 }
 createLoose(){
  const pilePositions=[[-.7,5.1],[-5.4,-.7],[6.4,2.5],[2,-5.3]];
  pilePositions.forEach(([x,z],id)=>{
   this.piles.push({id,position:new THREE.Vector3(x,0,z),count:8});
   for(let i=0;i<8;i++){
    const geometry=leafGeometry(.75+this.random()*.7),mesh=new THREE.Mesh(geometry,this.material);mesh.position.set(x+(this.random()-.5)*.8,.04+i*.028,z+(this.random()-.5)*.65);mesh.rotation.set((this.random()-.5)*.25,this.random()*Math.PI*2,(this.random()-.5)*.35);
    const vertices=Array.from(geometry.attributes.position.array),bottom=[];for(let j=0;j<vertices.length;j+=3)bottom.push(vertices[j],vertices[j+1]-.008,vertices[j+2]);
    this.addLoose(mesh,[{shape:new this.R.ConvexPolyhedron(new Float32Array([...vertices,...bottom])),offset:new THREE.Vector3()}],'leaf',id);
   }
  });
  for(const [x,z]of [[-3.5,5.4],[5.9,-.3],[.1,-4.8]]){
   const parts=[{shape:new this.R.Ball(.16),offset:new THREE.Vector3()}],geometries=[new THREE.SphereGeometry(.16,16,10)];
   for(let i=0;i<22;i++){const y=1-2*(i+.5)/22,a=i*2.39996,r=Math.sqrt(1-y*y),direction=new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r),q=new THREE.Quaternion().setFromUnitVectors(UP,direction),offset=direction.clone().multiplyScalar(.19),g=new THREE.ConeGeometry(.035,.13,5);g.applyQuaternion(q);g.translate(offset.x,offset.y,offset.z);geometries.push(g);parts.push({shape:new this.R.Cone(.065,.035),offset,rotation:q});}
   const mesh=new THREE.Mesh(mergeGeometries(geometries),this.material);for(const g of geometries)g.dispose();mesh.position.set(x,.27,z);this.addLoose(mesh,parts,'seed');
  }
 }
 setPointer(point,screen){this.pointer=point?.clone()??null;this.pointerScreen=screen??null;}
 beforeStep(dt){
  this.wind.step(dt);
  for(const o of this.loose){const p=o.body.translation(),velocity=o.body.linvel(),w=this.wind.sample(p.x,p.z),mass=o.body.mass();o.body.resetForces(false);o.body.resetTorques(false);
   const active=w.lengthSq()>1e-8;
   if(active){const arm=o.type==='seed'?.12:.025,angular=o.body.angvel();
    const force=new THREE.Vector3(w.x*4-(velocity.x-angular.z*arm),0,w.z*4-(velocity.z+angular.x*arm)).multiplyScalar(mass*(o.type==='seed'?1.6:1.1));
    if(o.type==='leaf'){force.y=mass*Math.max(0,w.length()-.3)*5; o.body.addTorque({x:w.z*mass*.045,y:Math.sin(this.wind.time*2+o.spawn.x)*w.length()*mass*.025,z:-w.x*mass*.045},true);}
    o.body.addForceAtPoint(force,{x:p.x,y:p.y+(o.type==='seed'?.12:.025),z:p.z},true);
   }
   if(this.pointer){const away=new THREE.Vector3(p.x-this.pointer.x,0,p.z-this.pointer.z),d=away.length();if(d<.4&&d>.01)o.body.addForce(away.multiplyScalar((.4-d)*mass*12/d),true);}
   // Loose matter can enter the pool; buoyant support and an entry impulse couple it to the water.
   const wet=inWater(p.x,p.z)&&p.y<.02;
   if(wet){const u=(p.x-.5)/5,v=(p.z+4)/5,n=this.water?.size??1,index=Math.round(v*(n-1))*n+Math.round(u*(n-1)),surface=-.19+(this.water?.height[index]??0),draft=o.type==='seed'?.12:.018;
    const submerged=surface+draft-p.y;
    if(submerged>0)o.body.addForce({x:-velocity.x*mass*3,y:Math.min(35,9.81+submerged*60-velocity.y*6)*mass,z:-velocity.z*mass*3},true);
    if(!o.lastWet)this.water?.disturb(u,v,Math.min(1.6,.25+Math.abs(velocity.y)*.3),.12);
   }
   o.lastWet=wet;
  }
 }
 clearSpot(position){
  if(inWater(position.x,position.z))return false;const shape=new this.R.Ball(.18),p={x:position.x,y:.2,z:position.z};
  for(const o of this.collision.objects){if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();if(o.mesh.position.distanceTo(new THREE.Vector3(p.x,p.y,p.z))>o.geometry.boundingSphere.radius+.18)continue;for(const part of o.parts){const center=this.collision.position(part,o.mesh.position,o.mesh.quaternion);const c=shape.contactShape(p,IDENTITY,part.shape,center,o.mesh.quaternion,0);if(c&&c.distance<0)return false;}}
  return true;
 }
 update(delta,camera,width,height){
  this.clock+=delta;
  for(const o of this.loose){o.mesh.position.copy(o.body.translation());o.mesh.quaternion.copy(o.body.rotation());}
  // Each pile follows its physical leaves; scattered or submerged leaves no longer attract birds.
  for(const pile of this.piles){const leaves=this.loose.filter(o=>o.pileId===pile.id&&o.type==='leaf'&&!o.lastWet&&o.mesh.position.y<.35);let best=[];
   for(const leaf of leaves){const cluster=leaves.filter(o=>o.mesh.position.distanceTo(leaf.mesh.position)<1.25);if(cluster.length>best.length)best=cluster;}
   pile.count=best.length;if(best.length){pile.position.set(0,0,0);for(const o of best)pile.position.add(o.mesh.position);pile.position.multiplyScalar(1/best.length);pile.position.y=0;}
  }
  this.accumulator+=Math.min(delta,.05);let steps=0;
  const colliders=prepareGrassColliders([...this.collision.objects,...this.loose]);
  while(this.accumulator+1e-10>=1/60){
   for(const item of this.strands){const {strand}=item,collide=makeGrassCollider(this.R,colliders,strand.root,strand.height);strand.step(1/60,this.wind.sample(strand.root.x,strand.root.z),collide,this.pointer);}
   this.colony.step(1/60,this.piles,this.pointer,p=>this.clearSpot(p));this.accumulator-=1/60;steps++;
  }
  if(steps)for(const item of this.strands)this.updateBlade(item);
  // Screen-space proximity also scares birds in midair, not just birds beneath the ground ray.
  if(camera&&this.pointerScreen)for(const bird of this.colony.birds){const projected=bird.position.clone().project(camera),x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;if(Math.hypot(x-this.pointerScreen.x,y-this.pointerScreen.y)<60)this.colony.depart(bird,this.pointer);}
  for(const [id,view]of this.birdViews)if(!this.colony.birds.some(b=>b.id===id)){this.group.remove(view.group);view.group.traverse(o=>o.geometry?.dispose());for(const m of view.materials)m.dispose();this.birdViews.delete(id);}
  for(const bird of this.colony.birds){let view=this.birdViews.get(bird.id);if(!view){view=birdMesh();this.birdViews.set(bird.id,view);this.group.add(view.group);}view.group.position.copy(bird.position);view.group.rotation.y=bird.yaw;view.body.rotation.z=-bird.peck*.52;
   view.wings[0].rotation.x=bird.wing;view.wings[1].rotation.x=-bird.wing;for(const m of view.materials)m.opacity=bird.opacity;view.group.traverse(o=>{if(o.isMesh)o.castShadow=bird.opacity>.7;});
  }
 }
 updateBlade({strand,mesh,head,angle,width}){
  const a=mesh.geometry.attributes.position;
  for(let i=0;i<strand.nodes.length;i++){const p=strand.nodes[i],t=i/(strand.nodes.length-1),w=width*(1-t)*(.7+.3*Math.sin(t*Math.PI));for(let axis=0;axis<2;axis++){const q=angle+axis*Math.PI/2,dx=Math.cos(q)*w,dz=Math.sin(q)*w;for(let side=0;side<2;side++){const sign=side===0?-1:1;a.setXYZ(i*4+axis*2+side,p.x+dx*sign,p.y,p.z+dz*sign);}}}
  a.needsUpdate=true;mesh.geometry.computeVertexNormals();
  if(head){const tip=strand.nodes.at(-1),direction=tip.clone().sub(strand.nodes.at(-2)).normalize();head.position.copy(tip);head.quaternion.setFromUnitVectors(UP,direction);}
 }
 reset(){
  for(const o of this.loose){o.body.setTranslation(o.spawn,true);o.body.setRotation(o.spawnRotation,true);o.body.setLinvel({x:0,y:0,z:0},true);o.body.setAngvel({x:0,y:0,z:0},true);o.body.resetForces(true);o.body.resetTorques(true);o.mesh.position.copy(o.spawn);o.mesh.quaternion.copy(o.spawnRotation);o.lastWet=false;}
  for(const item of this.strands){item.strand.reset();this.updateBlade(item);}this.colony.reset();for(const view of this.birdViews.values()){this.group.remove(view.group);view.group.traverse(o=>o.geometry?.dispose());for(const m of view.materials)m.dispose();}this.birdViews.clear();this.accumulator=0;this.pointer=null;this.pointerScreen=null;
 }
 read(){return {grassStrands:this.strands.length,leaves:this.loose.filter(o=>o.type==='leaf').length,seedPods:this.loose.filter(o=>o.type==='seed').map(o=>({position:o.mesh.position.toArray(),velocity:o.body.linvel()})),piles:this.piles.map(p=>({id:p.id,count:p.count,position:p.position.toArray()})),birds:this.colony.birds.map(b=>({state:b.state,position:b.position.toArray(),opacity:b.opacity,pile:b.pileId}))};}
}
