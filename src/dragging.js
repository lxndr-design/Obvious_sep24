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
 capture(objects){return objects.map(object=>({object,position:object.mesh.position.clone().add(this.motion.get(object)?.offset??new THREE.Vector3())}));}
 animate(snapshot,relocated=false){for(const {object,position} of snapshot)this.motion.set(object,{offset:relocated?new THREE.Vector3():position.sub(object.mesh.position),fade:relocated?.2:1});}
 clear(object){this.motion.delete(object);}
 step(dt){const decay=Math.exp(-22*dt);for(const [o,m]of this.motion){m.offset.multiplyScalar(decay);m.fade=1-(1-m.fade)*decay;if(m.offset.lengthSq()<1e-8&&m.fade>.999)this.motion.delete(o);}}
 apply(){const restore=[];for(const [o,m]of this.motion){
  const position=o.mesh.position.clone(),anchor=o.anchor?.clone(),materials=[];o.mesh.position.add(m.offset);if(o.hanging&&o.anchor)o.anchor.add(m.offset);
  if(m.fade<.999)o.mesh.traverse(child=>{if(!child.isMesh||!child.material)return;const original=child.material;
   const fade=material=>{let clone=this.faders.get(material);if(!clone){clone=material.clone();clone.transparent=true;clone.depthWrite=false;this.faders.set(material,clone);material.addEventListener('dispose',()=>clone.dispose());}clone.opacity=material.opacity*m.fade;return clone;};
   child.material=Array.isArray(original)?original.map(fade):fade(original);materials.push({child,original});
  });
  o.mesh.updateMatrixWorld(true);restore.push(()=>{o.mesh.position.copy(position);if(anchor)o.anchor.copy(anchor);for(const s of materials)s.child.material=s.original;o.mesh.updateMatrixWorld(true);});
 }return ()=>{for(const fn of restore)fn();};}
}

export class DragGhost {
 constructor(scene){this.group=new THREE.Group();this.group.visible=false;scene.add(this.group);this.material=new THREE.MeshBasicMaterial({color:0x89938d,transparent:true,opacity:.28,depthWrite:false,depthTest:false,side:THREE.DoubleSide});this.members=[];}
 begin(members){this.group.clear();this.members=members;for(const o of members){const mesh=new THREE.Mesh(o.geometry,this.material);mesh.raycast=()=>{};mesh.renderOrder=20;this.group.add(mesh);}}
 show(delta){this.group.visible=true;for(let i=0;i<this.members.length;i++){const o=this.members[i],mesh=this.group.children[i];mesh.position.copy(o.mesh.position).add(delta);mesh.quaternion.copy(o.mesh.quaternion);}}
 hide(){this.group.visible=false;}
 end(){this.hide();this.group.clear();this.members=[];}
}
