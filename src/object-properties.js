import * as THREE from 'three';
export const properties=()=>({locked:false,tone:0,reflectance:0,emittance:0,messageMode:'ordered',messages:[]});
export function applyMaterialProperties(object){
 const p=object.properties??=properties(),m=object.primaryMaterial??object.mesh.material;
 m.color.setScalar(1-p.tone);m.roughness=1-.96*p.reflectance;
 if(m.specular)m.specular.setScalar(.04+.96*p.reflectance);
 if(m.shininess!==undefined)m.shininess=5+195*p.reflectance;
 m.emissive?.setScalar(1);m.emissiveIntensity=p.emittance*2;
 if(p.emittance>0){if(!object.emissionLight){object.emissionLight=new THREE.PointLight(0xffffff,0,5,2);object.mesh.add(object.emissionLight);}object.emissionLight.intensity=p.emittance*14;}
 else if(object.emissionLight){object.emissionLight.removeFromParent();object.emissionLight.dispose();object.emissionLight=null;}
}
export const canManipulate=(object,members=[object])=>!!object&&!members.some(o=>o.properties?.locked);
export class MessagePlayer {
 constructor(random=Math.random){this.random=random;this.object=null;this.index=0;this.elapsed=0;}
 enter(object){if(this.object!==object){this.object=object;this.index=0;this.elapsed=0;}}
 current(){return this.object?.properties?.messages[this.index]??null;}
 step(dt){const p=this.object?.properties;if(!p||p.messages.length<2||p.messageMode==='branching')return false;this.elapsed+=dt;if(this.elapsed<3)return false;this.elapsed%=3;
  this.index=p.messageMode==='random'?(this.index+1+Math.floor(this.random()*(p.messages.length-1)))%p.messages.length:(this.index+1)%p.messages.length;return true;
 }
 choose(target){if(!Number.isInteger(target)||!this.object?.properties.messages[target])return false;this.index=target;this.elapsed=0;return true;}
}
