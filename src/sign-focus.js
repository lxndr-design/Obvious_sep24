import * as THREE from 'three';
import {messageHopBounds} from './message-hops.js';
export function signFocusPose(pole,objects,camera,width,height){
 const bounds=messageHopBounds(pole);for(const o of objects)if(o.support===pole)bounds.union(messageHopBounds(o));
 const target=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
 const normal=new THREE.Vector3(0,0,1).applyQuaternion(pole.mesh.quaternion),position=target.clone().addScaledVector(normal,15);
 const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position,target,new THREE.Vector3(0,1,0)));
 const right=new THREE.Vector3(1,0,0).applyQuaternion(rotation),span=Math.abs(right.x)*size.x+Math.abs(right.z)*size.z;
 const zoom=Math.min((camera.right-camera.left)*Math.max(.35,(width-330)/width)/(span+.8),(camera.top-camera.bottom)*Math.max(.4,(height-210)/height)/(size.y+.75));
 return {position,target,rotation,zoom};
}
export class SignFocus {
 constructor(camera,controls){this.camera=camera;this.controls=controls;this.pole=null;this.saved=null;this.transition=null;}
 get active(){return !!this.saved;}
 capture(){return {position:this.camera.position.clone(),rotation:this.camera.quaternion.clone(),zoom:this.camera.zoom,target:this.controls.target.clone()};}
 enter(pole,objects,width,height){if(this.active)return;this.saved=this.capture();this.pole=pole;this.controls.enabled=false;this.transition={from:this.capture(),to:signFocusPose(pole,objects,this.camera,width,height),age:0};}
 exit(immediate=false){if(!this.saved)return;this.pole=null;this.transition={from:this.capture(),to:this.saved,age:0,returning:true};if(immediate)this.step(1);}
 step(dt){const t=this.transition;if(!t)return;this.controls.enabled=false;t.age+=dt;const k=Math.min(1,t.age/.32),ease=k*k*(3-2*k);this.camera.position.lerpVectors(t.from.position,t.to.position,ease);this.camera.quaternion.slerpQuaternions(t.from.rotation,t.to.rotation,ease);this.camera.zoom=THREE.MathUtils.lerp(t.from.zoom,t.to.zoom,ease);this.controls.target.lerpVectors(t.from.target,t.to.target,ease);this.camera.updateProjectionMatrix();if(k===1){this.camera.position.copy(t.to.position);this.camera.quaternion.copy(t.to.rotation);this.camera.zoom=t.to.zoom;this.controls.target.copy(t.to.target);this.camera.updateProjectionMatrix();this.transition=null;if(t.returning){this.saved=null;this.controls.enabled=true;}}}
}
export class PoleEye {
 constructor(stage,onFocus){this.pole=null;this.grace=0;this.over=false;this.button=document.createElement('button');this.button.className='pole-eye';this.button.hidden=true;this.button.setAttribute('aria-label','Focus sign pole');this.button.title='View signpost';this.button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';stage.append(this.button);this.button.onpointerenter=()=>this.over=true;this.button.onpointerleave=()=>{this.over=false;this.grace=.6;};this.button.onclick=()=>{if(this.pole)onFocus(this.pole);};}
 target(o){const p=o?.type==='sign-pole'?o:o?.support?.type==='sign-pole'?o.support:null;if(p&&!p.properties?.locked){this.pole=p;this.hover=true;this.grace=.65;}else {this.hover=false;if(!this.over)this.grace=Math.min(this.grace,.65);}}
 step(dt,camera,canvas,objects,active){if(!this.over&&!this.hover)this.grace-=dt;if(this.grace<=0&&!this.over)this.pole=null;if(!objects.includes(this.pole)||active){this.button.hidden=true;return;}const box=messageHopBounds(this.pole);for(const o of objects)if(o.support===this.pole)box.union(messageHopBounds(o));const p=new THREE.Vector3(this.pole.mesh.position.x,box.max.y+.25,this.pole.mesh.position.z).project(camera);this.button.hidden=p.z<-1||p.z>1;this.button.style.left=((p.x+1)*canvas.clientWidth/2-16)+'px';this.button.style.top=((1-p.y)*canvas.clientHeight/2-32)+'px';}
}
