import {StickCollection,attachCarriedStick} from './sticks.js';
import {bathDimensions} from './bath-shapes.js';
import {BirdseedField,BirdseedView} from './birdseed.js';
import {setBirdWings} from './bird-wings.js';
import * as THREE from 'three';
import {bladeGeometry,flowerHead,birdMesh,seedForm,BIRD_PALETTES,setBirdFatness} from './nature-shapes.js';
import {GrassStrand,makeGrassCollider,prepareGrassColliders} from './grass.js';
import {BirdColony,seededRandom} from './birds.js';
import {inWater} from './terrain.js';
import {BATH} from './furnishings.js';
import {BathWater,bathWaterContexts} from './birdbath.js';
const UP=new THREE.Vector3(0,1,0),IDENTITY={x:0,y:0,z:0,w:1};
const smooth=t=>Math.max(0,Math.min(1,t));
function leafGeometry(scale=1){
 const vertices=new Float32Array([-.21,0,0,-.06,.018,-.10,.22,.028,0,-.05,.025,.11,0,.045,0]);
 for(let i=0;i<vertices.length;i++)vertices[i]*=scale;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(vertices,3));g.setIndex([0,1,4,1,2,4,2,3,4,3,0,4]);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
export class Ecology {
 constructor(scene,pendulums,collision,wind,R){
  this.scene=scene;this.pendulums=pendulums;this.world=pendulums.world;this.collision=collision;this.wind=wind;this.R=R;
  this.group=new THREE.Group();scene.add(this.group);this.material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95,side:THREE.DoubleSide});
  this.strands=[];this.grassClusters=[];this.loose=[];this.piles=[];this.birdViews=new Map();this.bathViews=new Map();this.habitats=[];this.colony=new BirdColony();this.random=seededRandom(731);this.accumulator=0;this.pointer=null;this.pointerScreen=null;this.water=null;this.lastLeafRead=0;this.clock=0;
  this.colony.onPeck=(position,pile)=>{const leaves=this.loose.filter(o=>o.pileId===pile.id);leaves.sort((a,b)=>a.mesh.position.distanceToSquared(position)-b.mesh.position.distanceToSquared(position));const leaf=leaves[0];if(leaf)leaf.body.applyImpulse({x:(this.random()-.5)*leaf.body.mass()*.4,y:leaf.body.mass()*.35,z:(this.random()-.5)*leaf.body.mass()*.4},true);};
  this.colony.onSplash=(position,site)=>this.bathViews.get(site.object)?.splash(position);
  this.sticks=new StickCollection(()=>this.collision.objects);
  this.food=new BirdseedField(seededRandom(1931));this.food.attachPhysics(this.world,R);this.foodView=new BirdseedView(scene,this.food);this.feedingMode=false;this.createPlants();this.createLoose();
 }
 createPlants(){
  const patches=[[-6,3],[-5,-1.5],[-3.5,4.8],[.1,2.1],[2,5],[5.9,1.8],[6.5,-2.5],[-1.8,-4.5],[-6,-4.8],[1,-5.1],[5.9,-4.8],[-.2,-2.8],[-2,1.4],[7.5,4.5],[-8,-1],[8,-5],[-4,7],[4.4,6.7]];
  const random=seededRandom(1907);
  for(const [x,z] of patches){
   const cluster={root:new THREE.Vector3(x,.005,z),blades:[]},count=2+Math.floor(random()*6),height=.65+random()*.35;
   for(let i=0;i<count;i++){
    const angle=i/count*Math.PI*2+(random()-.5)*.5,radius=.008+random()*.022;
    cluster.blades.push(this.addStrand(x+Math.cos(angle)*radius,z+Math.sin(angle)*radius,height*(.65+random()*.35),null,random,new THREE.Vector3(Math.cos(angle),0,Math.sin(angle)).multiplyScalar(.15+random()*.13)));
   }
   this.grassClusters.push(cluster);
  }
  this.addStrand(-2.1,4.4,.65,'daisy');this.addStrand(6.2,.8,.58,'dandelion');this.addStrand(-5.7,-3,.55,'daisy');
 }
 addStrand(x,z,height,flower=null,random=this.random,lean=null){
  const angle=random()*Math.PI*2,strand=new GrassStrand(new THREE.Vector3(x,.005,z),height,lean??new THREE.Vector3(Math.cos(angle)*.08,0,Math.sin(angle)*.08),4);strand.radius=.01;
  const geometry=bladeGeometry(strand.nodes.length),mesh=new THREE.Mesh(geometry,this.material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
  const head=flower?flowerHead(flower,this.material):null;strand.tipRadius=flower==='daisy'?.085:flower==='dandelion'?.075:.01;if(head)this.group.add(head);this.group.add(mesh);const item={strand,mesh,head,angle,width:flower ? .006 : .012};this.strands.push(item);return item;
 }
 addLoose(mesh,parts,type,pileId=null){
  mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);
  const desc=this.R.RigidBodyDesc.dynamic().setTranslation(mesh.position.x,mesh.position.y,mesh.position.z).setRotation(mesh.quaternion).setCcdEnabled(true).setLinearDamping(type==='leaf'?1.4:.16).setAngularDamping(type==='leaf'?1.8:.35);
  const body=this.world.createRigidBody(desc);
  for(const part of parts)this.world.createCollider(new this.R.ColliderDesc(part.shape).setTranslation(part.offset.x,part.offset.y,part.offset.z).setRotation(part.rotation??IDENTITY).setDensity(type==='leaf'?.13:5).setFriction(type==='leaf'?.1:.8).setRestitution(type==='seed'?0:.1).setContactSkin(type==='seed'?.001:0),body);
  const object={id:`${type}-${this.loose.filter(o=>o.type===type).length+1}`,mesh,geometry:mesh.geometry,parts,body,type,pileId,spawn:mesh.position.clone(),spawnRotation:mesh.quaternion.clone(),lastWet:false};this.loose.push(object);return object;
 }
 createLoose(){
  const pilePositions=[[-.7,5.1],[-5.4,-.7],[6.4,2.5],[2,-5.3]];
  pilePositions.forEach(([x,z],id)=>{
   this.piles.push({id,position:new THREE.Vector3(x,0,z),count:4});
   for(let i=0;i<4;i++){
    const angle=i*Math.PI/2+id*.7+(this.random()-.5)*.25,radius=.36+this.random()*.18;
    const geometry=leafGeometry(.30+this.random()*.16),mesh=new THREE.Mesh(geometry,this.material);mesh.position.set(x+Math.cos(angle)*radius,.025,z+Math.sin(angle)*radius);mesh.rotation.set((this.random()-.5)*.25,this.random()*Math.PI*2,(this.random()-.5)*.35);
    const vertices=Array.from(geometry.attributes.position.array),bottom=[];for(let j=0;j<vertices.length;j+=3)bottom.push(vertices[j],vertices[j+1]-.008,vertices[j+2]);
    this.addLoose(mesh,[{shape:new this.R.ConvexPolyhedron(new Float32Array([...vertices,...bottom])),offset:new THREE.Vector3()}],'leaf',id);
   }
  });
  for(const [x,z]of [[-3.5,5.4],[5.9,-.3],[.1,-4.8]]){
   const {geometry,parts}=seedForm(this.R),mesh=new THREE.Mesh(geometry,this.material);mesh.position.set(x,.12,z);this.addLoose(mesh,parts,'seed');
  }
 }
 scatterFood(point){const added=this.food.drop(point);if(added){this.colony.nextArrival=Math.min(this.colony.nextArrival,this.colony.time+2);this.foodView.update();}return added;}
 setPointer(point,screen){this.pointer=point?.clone()??null;this.pointerScreen=screen??null;}
 beforeStep(dt){
  this.wind.step(dt);
  for(const o of this.loose){if(!o.body.isDynamic())continue;const p=o.body.translation(),velocity=o.body.linvel(),w=this.wind.sample(p.x,p.z),mass=o.body.mass();o.body.resetForces(false);o.body.resetTorques(false);
   const active=w.lengthSq()>1e-8;
   if(active){const arm=o.type==='seed'?.035:.012,angular=o.body.angvel();
    const force=new THREE.Vector3(w.x*4-(velocity.x-angular.z*arm),0,w.z*4-(velocity.z+angular.x*arm)).multiplyScalar(mass*(o.type==='seed'?1.6:1.1));
    if(o.type==='leaf'){force.y=mass*Math.max(0,w.length()-.3)*5; o.body.addTorque({x:w.z*mass*.045,y:Math.sin(this.wind.time*2+o.spawn.x)*w.length()*mass*.025,z:-w.x*mass*.045},true);}
    o.body.addForceAtPoint(force,{x:p.x,y:p.y+(o.type==='seed'?.035:.012),z:p.z},true);
   }
   if(this.pointer){const away=new THREE.Vector3(p.x-this.pointer.x,0,p.z-this.pointer.z),d=away.length();if(d<.4&&d>.01)o.body.addForce(away.multiplyScalar((.4-d)*mass*12/d),true);}
   // Loose matter can enter the pool; buoyant support and an entry impulse couple it to the water.
   const waterView=this.terrain?.at(p.x,p.z),wet=(this.terrain?!!waterView:inWater(p.x,p.z))&&p.y<.02;
   if(wet){const u=(p.x-.5)/5,v=(p.z+4)/5,n=this.water?.size??1,index=Math.round(v*(n-1))*n+Math.round(u*(n-1)),surface=-.19+(waterView?this.terrain.sample(waterView,p.x,p.z):(this.water?.height[index]??0)),draft=o.type==='seed'?.05:.009;
    const submerged=surface+draft-p.y;
    if(submerged>0)o.body.addForce({x:-velocity.x*mass*3,y:Math.min(35,9.81+submerged*60-velocity.y*6)*mass,z:-velocity.z*mass*3},true);
    if(!o.lastWet){const impulse=Math.min(1.6,.25+Math.abs(velocity.y)*.3);if(this.terrain)this.terrain.disturb(p.x,p.z,impulse);else this.water?.disturb(u,v,impulse,.12);}
   }
   o.lastWet=wet;
  }
 }
 syncBaths(){
  const objects=this.collision.objects.filter(o=>(o.type==='birdbath'||o.type==='fountain'));
  for(const [o,view]of this.bathViews)if(!objects.includes(o)){view.dispose();this.bathViews.delete(o);}
  const baths=[],contexts=bathWaterContexts(objects,this.bathViews);
  for(const o of objects){
   let view=this.bathViews.get(o);
   if(view&&view.context!==contexts.get(o)){view.dispose();this.bathViews.delete(o);view=null;for(const bird of this.colony.birds)if(bird.pileId===`bath-${o.id}`)this.colony.depart(bird,this.pointer);}
   if(!view){view=new BathWater(o,contexts.get(o));this.bathViews.set(o,view);view.lastPosition=o.mesh.position.clone();view.lastRotation=o.mesh.quaternion.clone();this.colony.quiet.set(`bath-${o.id}`,this.colony.time);}
   const active=!o.hanging&&new THREE.Vector3(0,1,0).applyQuaternion(o.mesh.quaternion).y>.98;
   const moved=o.mesh.position.distanceTo(view.lastPosition)>.001||o.mesh.quaternion.angleTo(view.lastRotation)>.001;
   if(moved||!active){for(const bird of this.colony.birds)if(bird.pileId===`bath-${o.id}`)this.colony.depart(bird,this.pointer);this.colony.quiet.set(`bath-${o.id}`,this.colony.time);view.reset();}
   view.lastPosition.copy(o.mesh.position);view.lastRotation.copy(o.mesh.quaternion);view.group.visible=active;
   const dimensions=bathDimensions(o);
   if(active)baths.push({id:`bath-${o.id}`,kind:'bath',object:o,position:new THREE.Vector3(o.mesh.position.x,o.mesh.position.y-o.height/2,o.mesh.position.z),rimY:dimensions.height,waterY:dimensions.waterY,rimRadius:dimensions.rimRadius,joins:o.bathJoins??0});
  }
  this.habitats=[...this.sticks.sites(),...this.food.sites(),...this.piles,...baths];
 }
 clearSpot(position,site,bird){
  const scale=bird?.scale??1;
  if(site?.kind!=='bath'&&position.y<.12&&this.collision.layout.contains(position.x,position.z))return false;const shape=new this.R.Ball(.11*scale),p={x:position.x,y:position.y+.04*scale,z:position.z};
  for(const o of this.collision.objects){if(o===site?.object)continue;if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();if(o.mesh.position.distanceTo(new THREE.Vector3(p.x,p.y,p.z))>o.geometry.boundingSphere.radius+.18*scale)continue;for(const part of o.parts){const center=this.collision.position(part,o.mesh.position,o.mesh.quaternion);const c=shape.contactShape(p,IDENTITY,part.shape,center,o.mesh.quaternion,0);if(c&&c.distance<0)return false;}}
  return true;
 }
 update(delta,camera,width,height){
  this.clock+=delta;this.food.updatePhysics(delta);
  for(const o of this.loose){o.mesh.position.copy(o.body.translation());o.mesh.quaternion.copy(o.body.rotation());}
  // Each pile follows its physical leaves; scattered or submerged leaves no longer attract birds.
  for(const pile of this.piles){const leaves=this.loose.filter(o=>o.pileId===pile.id&&o.type==='leaf'&&!o.lastWet&&o.mesh.position.y<.35);let best=[];
   for(const leaf of leaves){const cluster=leaves.filter(o=>o.mesh.position.distanceTo(leaf.mesh.position)<1.25);if(cluster.length>best.length)best=cluster;}
   pile.count=best.length;if(best.length){pile.position.set(0,0,0);for(const o of best)pile.position.add(o.mesh.position);pile.position.multiplyScalar(1/best.length);pile.position.y=0;}
  }
  this.syncBaths();
  this.accumulator+=Math.min(delta,.05);let steps=0;
  const colliders=prepareGrassColliders([...this.collision.objects,...this.loose]);
  while(this.accumulator+1e-10>=1/60){
   for(const item of this.strands){const {strand}=item,collide=makeGrassCollider(this.R,colliders,strand.root,strand.height);strand.step(1/60,this.wind.sample(strand.root.x,strand.root.z),collide,this.pointer);}
   this.colony.step(1/60,this.habitats,this.feedingMode?null:this.pointer,(p,site,bird)=>this.clearSpot(p,site,bird));this.accumulator-=1/60;steps++;
  }
  this.foodView.update();
  if(steps)for(const item of this.strands)this.updateBlade(item);
  const steppedFields=new Set();for(const [o,view]of this.bathViews)if(view.group.visible){view.update(delta,this.wind.sample(o.mesh.position.x,o.mesh.position.z),!steppedFields.has(view.field));steppedFields.add(view.field);}
  // Screen-space proximity also scares birds in midair, not just birds beneath the ground ray.
  if(!this.feedingMode&&camera&&this.pointerScreen)for(const bird of this.colony.birds){const projected=bird.position.clone().project(camera),x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;if(Math.hypot(x-this.pointerScreen.x,y-this.pointerScreen.y)<60)this.colony.depart(bird,this.pointer);}
  for(const [id,view]of this.birdViews)if(!this.colony.birds.some(b=>b.id===id)){this.group.remove(view.group);view.group.traverse(o=>o.geometry?.dispose());for(const m of view.materials)m.dispose();this.birdViews.delete(id);}
  for(const bird of this.colony.birds){let view=this.birdViews.get(bird.id);if(!view){view=birdMesh(BIRD_PALETTES[(bird.id-1)%BIRD_PALETTES.length]);this.birdViews.set(bird.id,view);this.group.add(view.group);}view.group.position.copy(bird.position);view.group.rotation.y=bird.yaw;view.group.scale.setScalar(bird.scale??1);view.body.rotation.z=-bird.peck*.52;
   attachCarriedStick(view,bird);setBirdWings(view,bird.wingSpread,bird.wing);setBirdFatness(view,view.fatness+(bird.fatness-view.fatness)*(1-Math.exp(-8*delta)));for(const m of view.materials)m.opacity=bird.opacity;view.group.traverse(o=>{if(o.isMesh)o.castShadow=bird.opacity>.7;});
  }
 }
 updateBlade({strand,mesh,head,angle,width}){
  const a=mesh.geometry.attributes.position;
  for(let i=0;i<strand.nodes.length;i++){
   const p=strand.nodes[i],t=i/(strand.nodes.length-1),w=width*(1-t),dx=Math.cos(angle)*w,dz=Math.sin(angle)*w;
   a.setXYZ(i*2,p.x-dx,p.y,p.z-dz);a.setXYZ(i*2+1,p.x+dx,p.y,p.z+dz);
  }
  a.needsUpdate=true;mesh.geometry.computeVertexNormals();
  if(head){const tip=strand.nodes.at(-1),direction=tip.clone().sub(strand.nodes.at(-2)).normalize();head.position.copy(tip);head.quaternion.setFromUnitVectors(UP,direction);}
 }
 reset(){
  this.sticks.reset();this.food.reset();this.foodView.update();
  for(const o of this.loose){o.body.setTranslation(o.spawn,true);o.body.setRotation(o.spawnRotation,true);o.body.setLinvel({x:0,y:0,z:0},true);o.body.setAngvel({x:0,y:0,z:0},true);o.body.resetForces(true);o.body.resetTorques(true);o.mesh.position.copy(o.spawn);o.mesh.quaternion.copy(o.spawnRotation);o.lastWet=false;}
  for(const item of this.strands){item.strand.reset();this.updateBlade(item);}this.colony.reset();for(const view of this.birdViews.values()){this.group.remove(view.group);view.group.traverse(o=>o.geometry?.dispose());for(const m of view.materials)m.dispose();}this.birdViews.clear();for(const view of this.bathViews.values())view.dispose();this.bathViews.clear();this.habitats=[];this.accumulator=0;this.pointer=null;this.pointerScreen=null;
 }
 read(){return {sticksCollected:[...this.sticks.taken],birdseed:this.food.read(),grassStrands:this.strands.length,grassClusters:this.grassClusters.map(c=>({position:c.root.toArray(),blades:c.blades.length})),leaves:this.loose.filter(o=>o.type==='leaf').length,seedPods:this.loose.filter(o=>o.type==='seed').map(o=>({id:o.id,position:o.mesh.position.toArray(),velocity:o.body.linvel()})),piles:this.piles.map(p=>({id:p.id,count:p.count,position:p.position.toArray()})),baths:[...this.bathViews].map(([o,view])=>({objectId:o.id,active:view.group.visible,splashes:view.splashCount})),birds:this.colony.birds.map(b=>({color:BIRD_PALETTES[(b.id-1)%BIRD_PALETTES.length].name,id:b.id,scale:b.scale,habitat:b.habitat,state:b.state,carryingStick:b.carriedStick?.userData.stickId??null,caution:b.caution,fullness:b.fullness,capacity:b.capacity,fatness:b.fatness,wingState:b.wingState,wingSpread:b.wingSpread,wingStroke:b.wing,position:b.position.toArray(),opacity:b.opacity,pile:b.pileId}))};}
}
