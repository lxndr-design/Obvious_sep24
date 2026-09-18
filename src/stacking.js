import * as THREE from 'three';

const up=new THREE.Vector3(0,1,0);
const rect=(x,z,w,d)=>({kind:'rect',x,z,w,d});
const circle=r=>({kind:'circle',x:0,z:0,r});
function outline(p){
 if(p.kind==='circle')return Array.from({length:32},(_,i)=>[p.x+Math.cos(i*Math.PI/16)*p.r,p.z+Math.sin(i*Math.PI/16)*p.r]);
 return [[p.x-p.w/2,p.z-p.d/2],[p.x+p.w/2,p.z-p.d/2],[p.x+p.w/2,p.z+p.d/2],[p.x-p.w/2,p.z+p.d/2]];
}
const area=p=>p.kind==='circle'?Math.PI*p.r*p.r:p.w*p.d;
const contains=(p,x,z)=>p.kind==='circle'?Math.hypot(x-p.x,z-p.z)<=p.r+.0001:Math.abs(x-p.x)<=p.w/2+.0001&&Math.abs(z-p.z)<=p.d/2+.0001;
const upright=o=>up.clone().applyQuaternion(o.mesh.quaternion).y>.9999;

// 0–10 flat-area saturation. Contact footprints remain separate from the score:
// a pot can overhang its base; all four feet of a table must still be supported.
export function stackingProfile(type,form){
 const b=form.geometry.boundingBox,w=b.max.x-b.min.x,d=b.max.z-b.min.z,footprints=[],heads=[];
 let headY=b.max.y;
 if(type==='box'){footprints.push(rect(0,0,w,d));heads.push(rect(0,0,w,d));}
 else if(type==='cylinder'){footprints.push(circle(w/2));heads.push(circle(w/2));}
 else if(type.startsWith('table-')){
  const scale=type.endsWith('-half')?.5:1,round=type.includes('-round-'),spread=(round?.53:.79)*scale;
  for(const x of [-spread,spread])for(const z of [-spread,spread])footprints.push(rect(x,z,.13*scale,.13*scale));
  heads.push(round?circle(scale):rect(0,0,2*scale,2*scale));
 }else if(type.startsWith('plant-')){const scale=type.endsWith('-small')?.65:type.endsWith('-large')?1.5:1;footprints.push(circle(.23*scale));}
 else if(type==='hedge')footprints.push(rect(0,0,w,d));
 else if(type==='birdbath'||type==='fountain')footprints.push(circle(.46));
 else if(type==='arch')for(const x of [-.84,.84])footprints.push(rect(x,0,.52,.7));
 else if(type==='bench'){
  for(const x of [-.92,.92])for(const z of [-.24,.24])footprints.push(rect(x,z,.12,.12));
  for(let i=0;i<4;i++)heads.push(rect(0,-.265+i*.18,2.35,.145));headY=.7675-form.height/2;
 }
 const saturation=ps=>Math.min(10,10*ps.reduce((sum,p)=>sum+area(p),0)/(w*d));
 // A curved bottom has zero flat area, but still has a physical contact point.
 let points=footprints.flatMap(outline);
 if(!points.length){const a=form.geometry.attributes.position;let lowest=0;for(let i=1;i<a.count;i++)if(a.getY(i)<a.getY(lowest))lowest=i;points=[[a.getX(lowest),a.getZ(lowest)]];}
 return {foot:saturation(footprints),head:saturation(heads),bottomY:b.min.y,headY,heads,points};
}

export class StackScene {
 constructor(collision){this.collision=collision;}
 members(root){const result=[root],seen=new Set(result);for(let i=0;i<result.length;i++)for(const o of this.collision.objects)if(!o.hanging&&o.support===result[i]&&!seen.has(o)){seen.add(o);result.push(o);}return result;}
 fits(object,host,x,z,rotation=object.mesh.quaternion){
  const a=object.stacking,b=host.stacking;
  if(!a||!b||host.hanging||!upright(host)||up.clone().applyQuaternion(rotation).y<.9999||a.foot>=b.head-1e-6)return false;
  const inverse=host.mesh.quaternion.clone().invert();
  return a.points.every(([px,pz])=>{const p=new THREE.Vector3(px,0,pz).applyQuaternion(rotation).add(new THREE.Vector3(x-host.mesh.position.x,0,z-host.mesh.position.z)).applyQuaternion(inverse);return b.heads.some(s=>contains(s,p.x,p.z));});
 }
 supports(object,x,z,exclude=new Set(this.members(object))){
  const ground={host:null,y:this.collision.supportY(object,x,z)},choices=[];
  if(object.stacking)for(const host of this.collision.objects){if(exclude.has(host)||!this.fits(object,host,x,z))continue;
   const y=host.mesh.position.y+host.stacking.headY-object.stacking.bottomY;
   if(y>=ground.y-.001)choices.push({host,y});
  }
  return [...choices.sort((a,b)=>b.y-a.y),ground];
 }
 snapshot(root){return this.members(root).map(o=>({object:o,position:o.mesh.position.clone(),rotation:o.mesh.quaternion.clone(),support:o.support??null}));}
 restore(snapshot){for(const s of snapshot){s.object.mesh.position.copy(s.position);s.object.mesh.quaternion.copy(s.rotation);s.object.support=s.support;}}
 valid(members,delta){const ignore=new Set(members);return members.every(o=>this.collision.canPlace(o,o.mesh.position.clone().add(delta),o.mesh.quaternion,ignore));}
 sweep(members,from,to){const ignore=new Set(members);let fraction=1;for(const o of members)fraction=Math.min(fraction,this.collision.castFraction(o,o.mesh.position.clone().add(from),o.mesh.position.clone().add(to),ignore));return fraction;}
 clear(members,from,to){return (1-this.sweep(members,from,to))*from.distanceTo(to)<.001;}
 translate(members,delta){for(const o of members)o.mesh.position.add(delta);}
 move(root,target){
  if(!target.toArray().every(Number.isFinite))return false;
  const members=this.members(root),from=root.mesh.position.clone();if(from.x===target.x&&from.z===target.z)return true;
  const choices=this.supports(root,target.x,target.z,new Set(members)),zero=new THREE.Vector3();
  // Preserve the fast floor path for ordinary unstacked moves.
  if(members.length===1&&!root.support&&choices.length===1)return this.collision.move(root,target);
  for(const choice of choices){
   // Brief clearance prevents tangential casts from sticking; final placement has no gap.
   const lift=new THREE.Vector3(0,Math.max(from.y,choice.y,-this.collision.bounds(root,zero).min.y)+.003-from.y,0);
   const across=new THREE.Vector3(target.x-from.x,lift.y,target.z-from.z),down=new THREE.Vector3(across.x,choice.y-from.y,across.z);
   if(!this.valid(members,lift)||!this.clear(members,zero,lift)||!this.valid(members,across)||!this.clear(members,lift,across)||!this.valid(members,down)||!this.clear(members,across,down))continue;
   this.translate(members,down);root.support=choice.host;return true;
  }
  return false;
 }
 settle(root){
  const members=this.members(root),zero=new THREE.Vector3();
  for(const choice of this.supports(root,root.mesh.position.x,root.mesh.position.z,new Set(members))){
   if(choice.y>root.mesh.position.y+.001)continue;const delta=new THREE.Vector3(0,choice.y-root.mesh.position.y,0);
   if(this.valid(members,delta)&&this.clear(members,zero,delta)){this.translate(members,delta);root.support=choice.host;return true;}
  }return false;
 }
 rotate(root){
  const snapshot=this.snapshot(root),members=snapshot.map(s=>s.object),ignore=new Set(members),pivot=root.mesh.position.clone();
  for(let i=1;i<=18;i++){
   const rotation=new THREE.Quaternion().setFromAxisAngle(up,i*Math.PI/36);
   for(const s of snapshot){s.object.mesh.position.copy(s.position).sub(pivot).applyQuaternion(rotation).add(pivot);s.object.mesh.quaternion.copy(rotation).multiply(s.rotation);}
   if(members.some(o=>!this.collision.canPlace(o,o.mesh.position,o.mesh.quaternion,ignore))||root.support&&!this.fits(root,root.support,root.mesh.position.x,root.mesh.position.z)){this.restore(snapshot);return false;}
  }return true;
 }
}
