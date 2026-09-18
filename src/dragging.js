import * as THREE from 'three';

// Drag placement is transactional: clipped travel must not leave a form wedged
// against an obstacle. A clear destination can be reached across a blocked path.
export function dragFloor(stacks,root,target){
 const snapshot=stacks.snapshot(root),members=snapshot.map(s=>s.object);
 if(stacks.move(root,target)&&Math.hypot(root.mesh.position.x-target.x,root.mesh.position.z-target.z)<.001)return {moved:true,relocated:false};
 stacks.restore(snapshot);
 for(const choice of stacks.supports(root,target.x,target.z,new Set(members))){
  const delta=new THREE.Vector3(target.x-root.mesh.position.x,choice.y-root.mesh.position.y,target.z-root.mesh.position.z);
  if(stacks.valid(members,delta)){stacks.translate(members,delta);root.support=choice.host;return {moved:true,relocated:true};}
 }
 return {moved:false,relocated:false};
}
export function dragAnchor(pendulums,collision,object,target){
 const snapshot=pendulums.snapshot(object);
 if(pendulums.moveAnchor(object,target,collision)&&Math.hypot(object.anchor.x-target.x,object.anchor.z-target.z)<.001)return {moved:true,relocated:false};
 pendulums.restore(object,snapshot);
 const delta=target.clone().sub(object.anchor);delta.y=0;
 const destination=object.mesh.position.clone().add(delta);
 if(!collision.canPlace(object,destination))return {moved:false,relocated:false};
 object.anchor.add(delta);object.mesh.position.copy(destination);pendulums.syncPose(object);return {moved:true,relocated:true};
}

// Render-only easing: collision poses remain exact and grid-locked. Transfers
// across obstacles fade in at the destination instead of sliding through solids.
export class DragPresentation {
 constructor(){this.motion=new Map();this.faders=new WeakMap();}
 capture(objects){const restore=this.apply();try{return objects.map(object=>({object,position:object.mesh.position.clone(),rotation:object.mesh.quaternion.clone()}));}finally{restore();}}
 animate(snapshot,relocated=false,pivot=null){for(const {object,position,rotation} of snapshot){
  const turn=relocated?new THREE.Quaternion():rotation.clone().multiply(object.mesh.quaternion.clone().invert());
  const center=pivot?.clone()??object.mesh.position.clone();
  const rotated=object.mesh.position.clone().sub(center).applyQuaternion(turn).add(center);
  this.motion.set(object,{offset:relocated?new THREE.Vector3():position.clone().sub(rotated),turn,pivot:center,fade:relocated?.2:1});
 }}
 clear(object){this.motion.delete(object);}
 withPresentation(render){const restore=this.apply();try{return render();}finally{restore();}}
 step(dt){const decay=Math.exp(-22*dt);for(const [o,m]of this.motion){m.offset.multiplyScalar(decay);m.turn.slerp(new THREE.Quaternion(),1-decay);m.fade=1-(1-m.fade)*decay;if(m.offset.lengthSq()<1e-8&&m.turn.angleTo(new THREE.Quaternion())<.001&&m.fade>.999)this.motion.delete(o);}}
 apply(){const restore=[];for(const [o,m]of this.motion){
  const position=o.mesh.position.clone(),rotation=o.mesh.quaternion.clone(),anchor=o.anchor?.clone(),materials=[];o.mesh.position.sub(m.pivot).applyQuaternion(m.turn).add(m.pivot).add(m.offset);o.mesh.quaternion.premultiply(m.turn);if(o.hanging&&o.anchor)o.anchor.add(m.offset);
  if(m.fade<.999)o.mesh.traverse(child=>{if(!child.isMesh||!child.material)return;const original=child.material;
   const fade=material=>{let clone=this.faders.get(material);if(!clone){clone=material.clone();
    // Material.copy JSON-copies userData and drops shader hooks. Keep live
    // refraction vectors, matrices and uniforms attached to their shader.
    clone.userData={...material.userData};clone.onBeforeCompile=material.onBeforeCompile;clone.customProgramCacheKey=material.customProgramCacheKey;
    // Stochastic coverage retains depth occlusion: alpha blending reveals
    // overlapping rim triangles and back faces as a spiky glass silhouette.
    clone.transparent=false;clone.depthWrite=true;clone.alphaHash=true;this.faders.set(material,clone);material.addEventListener('dispose',()=>clone.dispose());}clone.opacity=material.opacity*m.fade;return clone;};
   child.material=Array.isArray(original)?original.map(fade):fade(original);materials.push({child,original});
  });
  o.mesh.updateMatrixWorld(true);restore.push(()=>{o.mesh.position.copy(position);o.mesh.quaternion.copy(rotation);if(anchor)o.anchor.copy(anchor);for(const s of materials)s.child.material=s.original;o.mesh.updateMatrixWorld(true);});
 }return ()=>{for(const fn of restore)fn();};}
}

export class DragGhost {
 constructor(scene){this.group=new THREE.Group();this.group.visible=false;scene.add(this.group);this.material=new THREE.MeshBasicMaterial({color:0x89938d,transparent:true,opacity:.28,depthWrite:false,depthTest:false,side:THREE.DoubleSide});this.members=[];}
 begin(members){this.group.clear();this.members=members;for(const o of members){const mesh=new THREE.Mesh(o.geometry,this.material);mesh.raycast=()=>{};mesh.renderOrder=20;this.group.add(mesh);}}
 show(delta){this.group.visible=true;for(let i=0;i<this.members.length;i++){const o=this.members[i],mesh=this.group.children[i];mesh.geometry=o.geometry;mesh.position.copy(o.mesh.position).add(delta);mesh.quaternion.copy(o.mesh.quaternion);}}
 hide(){this.group.visible=false;}
 end(){this.hide();this.group.clear();this.members=[];}
}

// Probe destinations without adding a body or mutating the existing scene.
export function placementAt(stacks,object,x,z){
 for(const choice of stacks.supports(object,x,z)){
  const position=new THREE.Vector3(x,choice.y,z);
  if(stacks.collision.canPlace(object,position))return {position,support:choice.host};
 }
 return null;
}
