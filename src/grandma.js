import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const GRANDMA_OUTFITS={skirt:'Skirt',pants:'Pants'};
export const GRANDMA_HAIR={bun:'Bun · no hat',short:'Short hair · no hat',puffy:'Puffy hair',hat:'Sun hat'};
export const GRANDMA_LABELS=Object.fromEntries(Object.entries(GRANDMA_OUTFITS).flatMap(([outfit,label])=>Object.entries(GRANDMA_HAIR).map(([hair,name])=>[`grandma-${outfit}-${hair}`,`Grandma · ${label.toLowerCase()} · ${name.toLowerCase()}`])));
export function makeGrandma(R,type='grandma'){
 const [,outfit='skirt',hair='bun']=type.split('-');
 if(!GRANDMA_OUTFITS[outfit]||!GRANDMA_HAIR[hair])throw Error('Unknown Grandma variant');
 const pants=outfit==='pants';
 const build=seated=>{
  const pieces=[],parts=[],limbs=[];let limb=null;
  const add=(g,x,y,z,collide=true)=>{
   g.translate(x,y,z);const flat=g.index?g.toNonIndexed():g.clone();flat.deleteAttribute('uv');(limb?limb.geoms:pieces).push(flat);
   if(collide)parts.push({shape:new R.ConvexPolyhedron(new Float32Array(g.attributes.position.array)),offset:new THREE.Vector3()});g.dispose();
  };
  const box=(w,h,d,x,y,z)=>add(new THREE.BoxGeometry(w,h,d),x,y,z);
  const ball=(r,x,y,z)=>add(new THREE.IcosahedronGeometry(r,1),x,y,z);
  const noodle=(points,r)=>{
   const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments=8,sides=8;
   const g=new THREE.TubeGeometry(curve,segments,r,sides,false),positions=g.attributes.position;
   // Separate hulls follow the bend; a single hull would fill the elbow/knee gap.
   for(let segment=0;segment<segments;segment++){
    const vertices=[];for(let ring=segment;ring<=segment+1;ring++)for(let side=0;side<sides;side++){
     const i=ring*(sides+1)+side;vertices.push(positions.getX(i),positions.getY(i),positions.getZ(i));
    }
    parts.push({shape:new R.ConvexPolyhedron(new Float32Array(vertices)),offset:new THREE.Vector3()});
   }
   add(g,0,0,0,false);
  };
  const shoe=(x,y,z)=>add(new THREE.SphereGeometry(1,12,6).scale(.082,.055,.145),x,y,z);
  const seatedDress=()=>{
   // Cross-sections sweep from the seat, over the knees, then down the shins.
   // Below the seat, even the back of the fabric stays beyond its front edge.
   const rings=[[-.13,.10,.24,.10,0],[.23,.115,.25,.115,0],[.43,.07,.27,.065,.06],[.48,-.12,.28,0,.10],[.48,-.23,.29,0,.10]];
   const sides=12,vertices=[],indices=[];
   for(const [z,y,width,dy,dz]of rings)for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2;vertices.push(Math.cos(a)*width,y+Math.sin(a)*dy,z+Math.sin(a)*dz);}
   for(let ring=0;ring<rings.length-1;ring++){
    for(let side=0;side<sides;side++){const a=ring*sides+side,b=ring*sides+(side+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c);}
    parts.push({shape:new R.ConvexPolyhedron(new Float32Array(vertices.slice(ring*sides*3,(ring+2)*sides*3))),offset:new THREE.Vector3()});
   }
   for(let side=1;side<sides-1;side++){indices.push(0,side+1,side);const end=(rings.length-1)*sides;indices.push(end,end+side,end+side+1);}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();add(g,0,0,0,false);
  };
  // Local +Z is forward. Her cardigan, skirt, bun and glasses stay white.
  add(new THREE.CylinderGeometry(.19,.24,.43,8),0,.37,0);
  ball(.165,0,.72,.025);
  if(hair==='bun')ball(.092,0,.83,-.09);
  else if(hair==='short')add(new THREE.SphereGeometry(.175,8,4,0,Math.PI*2,0,Math.PI/2),0,.72,.025);
  else if(hair==='puffy'){
   for(let i=0;i<7;i++){const angle=i/7*Math.PI*2;ball(.083,Math.cos(angle)*.145,.825,Math.sin(angle)*.145+.015);}
   ball(.105,0,.895,.015);
  }else{
   add(new THREE.CylinderGeometry(.27,.27,.03,12),0,.875,.025);
   add(new THREE.CylinderGeometry(.16,.20,.13,10),0,.945,.025);
  }
  for(const x of [-.072,.072])add(new THREE.TorusGeometry(.052,.010,4,8),x,.745,.177);
  box(.038,.016,.018,0,.745,.18);
  if(seated){
   if(pants)box(.42,.20,.28,0,.10,.06);else seatedDress();
   for(const x of [-.13,.13]){
    if(pants)noodle([[x,.105,.08],[x,.105,.30],[x,.045,.46],[x,-.12,.48],[x,-.30,.44]],.083);
    else noodle([[x,-.10,.46],[x+.012,-.21,.47],[x,-.30,.44]],.052);
    shoe(x,-.345,.49);
   }
  }else{
   if(pants)box(.43,.20,.30,0,.10,0);
   else add(new THREE.CylinderGeometry(.22,.31,.72,12),0,-.17,0);
   for(const x of [-.13,.13]){
    limb={kind:'hips',geoms:[],pivot:new THREE.Vector3(x,pants?.06:-.45,0)};limbs.push(limb);
    noodle(pants?[[x,.07,0],[x*1.08,-.23,.025],[x*.92,-.47,-.015],[x,-.69,0]]:[[x,-.49,0],[x*1.04,-.59,.02],[x,-.69,0]],pants?.095:.05);
    shoe(x,-.735,.06);limb=null;
   }
  }
  if(seated){
   noodle([[-.20,.53,0],[-.27,.39,.035],[-.28,.26,.14],[-.18,.20,.29]],.058);
   noodle([[.20,.53,0],[.28,.41,.04],[.30,.29,.19],[.24,.27,.41]],.056);
   ball(.065,.24,.27,.41);ball(.065,-.18,.20,.29);
  }else for(const [side,points,r] of [[-1,[[-.20,.53,0],[-.27,.39,.035],[-.28,.26,.14],[-.18,.20,.29]],.058],[1,[[.20,.53,0],[.28,.41,.04],[.30,.29,.19],[.24,.27,.41]],.056]]){
   limb={kind:'shoulders',geoms:[],pivot:new THREE.Vector3(.19*side,.52,0)};limbs.push(limb);
   noodle(points,r);ball(.065,points[3][0],points[3][1],points[3][2]);limb=null;
  }
  box(.24,.29,.16,-.15,.16,.31); // seed bag held at her waist
  const flatLimbs=limbs.flatMap(l=>l.geoms);
  // Full bind-pose geometry anchors colliders, the debug view and size labels;
  // the standing torso renders on the object mesh while limbs ride pivot groups.
  const geometry=mergeGeometries([...pieces,...flatLimbs]),meshGeometry=seated?null:mergeGeometries(pieces);
  geometry.computeBoundingBox();if(meshGeometry)meshGeometry.computeBoundingBox();
  const center=(geometry.boundingBox.max.y+geometry.boundingBox.min.y)/2;
  geometry.translate(0,-center,0);geometry.computeBoundingBox();
  if(meshGeometry){meshGeometry.translate(0,-center,0);meshGeometry.computeBoundingBox();}
  pieces.concat(flatLimbs).forEach(g=>g.dispose());
  for(const part of parts)part.offset.y=-center;
  const height=geometry.boundingBox.max.y-geometry.boundingBox.min.y;
  const rig=seated?null:{hips:[],shoulders:[]};
  if(!seated)for(const l of limbs){
   const merged=mergeGeometries(l.geoms);l.geoms.forEach(g=>g.dispose());
   merged.translate(0,-center,0);merged.computeBoundingBox();
   const pivot=l.pivot.clone();pivot.y-=center;
   rig[l.kind].push({geometry:merged,pivot});
  }
  return {geometry,parts,height,seated,seatY:-center,hand:new THREE.Vector3(.24,.27-center,.54),...(seated?{}:{meshGeometry,rig}),stacking:{foot:1,head:0,bottomY:geometry.boundingBox.min.y,headY:geometry.boundingBox.max.y,heads:[],points:[[-.13,.06],[.13,.06]]}};
 };
 const standing=build(false),sitting=build(true),grandmaForms={standing,sitting};return {...standing,grandmaForms,grandmaVariant:{outfit,hair}};
}
export function setGrandmaPose(o,seated,collision){
 if(!o.grandmaForms)return;
 const form=o.grandmaForms[seated?'sitting':'standing'];
 Object.assign(o,form);o.mesh.geometry=form.meshGeometry??form.geometry;if(o.debug)o.debug.geometry=form.geometry;
 collision?.prepared.delete(o);
}
// View wiring for the pivot rig: wraps the object mesh in a bob root and hangs
// hip/shoulder pivot groups off the mesh. Limb geometry is baked in form space;
// each pivot sits at the joint with its limb mesh counter-offset, so bind pose
// is exact and pivot rotations swing the limb about the joint. The bob root is
// visual-only — collision reads the mesh transform, which never bobs.
export function attachGrandmaRig(o,material=o.mesh.material){
 const standing=o.grandmaForms?.standing,parent=o.mesh.parent;
 if(!standing?.rig||!parent)return;
 const root=new THREE.Group();parent.add(root);root.add(o.mesh);
 const make=defs=>defs.map(({geometry,pivot})=>{
  const group=new THREE.Group();group.position.copy(pivot);group.visible=false;
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.position.copy(pivot).negate();
  group.add(mesh);return group;
 });
 o.hipPivots=make(standing.rig.hips);o.shoulderPivots=make(standing.rig.shoulders);
 for(const p of o.hipPivots)root.add(p);for(const p of o.shoulderPivots)root.add(p);
 o.visualRoot=root;
}
export function grandmaPlacement(collision,o,x,z,groundOnly=false){
 const standing=o.grandmaForms.standing,sitting=o.grandmaForms.sitting;
 const probe=(form,position,rotation,support)=>{
  const candidate={...o,...form,mesh:{position,quaternion:rotation}};
  return collision.canPlace(candidate,position,rotation,new Set([o]))?{position,rotation,support,seated:form.seated}:null;
 };
 if(!groundOnly)for(const bench of collision.objects){
  if(bench.type!=='bench'||bench.hanging||new THREE.Vector3(0,1,0).applyQuaternion(bench.mesh.quaternion).y<.999)continue;
  const local=new THREE.Vector3(x-bench.mesh.position.x,0,z-bench.mesh.position.z).applyQuaternion(bench.mesh.quaternion.clone().invert());
  if(Math.abs(local.x)>.72*(bench.modelScale??1)||Math.abs(local.z)>.55*(bench.modelScale??1))continue;
  // A proportionally taller character may need to sit nearer the front edge.
  for(const forward of [0,.06,.12,.18,.24]){
   const position=new THREE.Vector3(Math.round(local.x*2)/2,0,forward*(o.modelScale??1)).applyQuaternion(bench.mesh.quaternion).add(bench.mesh.position);
   position.y=bench.mesh.position.y+bench.stacking.headY-sitting.seatY;
   const placed=probe(sitting,position,bench.mesh.quaternion.clone(),bench);if(placed)return placed;
  }
 }
 const rotation=o.mesh.quaternion.clone(),candidate={...o,...standing};
 const position=new THREE.Vector3(x,collision.supportY(candidate,x,z,rotation),z);
 return probe(standing,position,rotation,null);
}
export function applyGrandmaPlacement(o,placement,collision){
 setGrandmaPose(o,placement.seated,collision);o.mesh.position.copy(placement.position);o.mesh.quaternion.copy(placement.rotation);o.support=placement.support;
}
export function disposeGrandma(o){
 if(!o.grandmaForms)return;
 o.visualRoot?.removeFromParent();
 for(const form of Object.values(o.grandmaForms)){
  if(form.geometry!==o.geometry)form.geometry.dispose();
  if(form.meshGeometry&&form.meshGeometry!==form.geometry)form.meshGeometry.dispose();
  if(form.rig)for(const limb of [...form.rig.hips,...form.rig.shoulders])limb.geometry.dispose();
 }
}

export class GrandmaFeeding {
 constructor(random=Math.random){this.random=random;this.timers=new Map();this.busy=()=>false;this.scatters=0;}
 hasSeedInFront(o,food){
  const inverse=o.mesh.quaternion.clone().invert(),handY=o.hand.clone().applyQuaternion(o.mesh.quaternion).add(o.mesh.position).y;
  return food.available().some(seed=>{
   const p=seed.position.clone().sub(o.mesh.position).applyQuaternion(inverse);
   return p.z>.12&&p.z<3&&Math.abs(p.x)<Math.min(1.8,.55+p.z*.55)&&seed.position.y<handY+.45;
  });
 }
 step(dt,objects,food){
  const present=new Set(objects.filter(o=>o.grandmaForms));
  for(const o of this.timers.keys())if(!present.has(o))this.timers.delete(o);
  for(const o of present){
   let timer=this.timers.get(o)??(4+this.random()*3);
   if(o.hanging||this.busy(o)){this.timers.set(o,Math.max(timer,2));continue;}
   timer-=dt;
   if(timer<=0&&this.hasSeedInFront(o,food)){this.timers.set(o,1);continue;}
   if(timer<=0){
    const hand=o.hand.clone().applyQuaternion(o.mesh.quaternion).add(o.mesh.position),count=4+Math.floor(this.random()*4);
    for(let i=0;i<count;i++){
     // Spread directions across a fan and stagger near/far distances independently.
     const angle=-.9+(i+this.random())/count*1.8,speed=.7+1.65*((i*.61803398875+this.random()*.5)%1);
     const velocity=new THREE.Vector3(Math.sin(angle)*speed,.3+this.random()*.55,Math.cos(angle)*speed).applyQuaternion(o.mesh.quaternion);
     const release=hand.clone().add(new THREE.Vector3((this.random()-.5)*.10,this.random()*.025,0).applyQuaternion(o.mesh.quaternion));
     food.drop(release,{lift:0,velocity});
    }
    this.scatters++;timer=10+this.random()*8;
   }
   this.timers.set(o,timer);
  }
 }
 reset(){this.timers.clear();this.scatters=0;}
}
