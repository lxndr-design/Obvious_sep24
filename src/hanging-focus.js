import * as THREE from 'three';

// A lightweight depth-tested silhouette mask. Ground forms occlude hanging forms,
// and only hanging pixels receive the subtle pre-dither softening.
export class HangingFocus {
 constructor(){
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0);
  this.white=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});this.black=new THREE.MeshBasicMaterial({color:0,toneMapped:false});
  this.target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});this.proxies=new Map();
 }
 resize(w,h){this.target.setSize(w,h);}
 render(renderer,camera,objects){
  for(const [o,proxy]of this.proxies)if(!objects.includes(o)){proxy.removeFromParent();this.proxies.delete(o);}
  if(!objects.some(o=>o.hanging))return false;
  for(const o of objects){let proxy=this.proxies.get(o);if(!proxy){proxy=new THREE.Mesh(o.geometry,this.black);proxy.matrixAutoUpdate=false;this.proxies.set(o,proxy);this.scene.add(proxy);}o.mesh.updateWorldMatrix(true,false);proxy.matrix.copy(o.mesh.matrixWorld);proxy.material=o.hanging?this.white:this.black;proxy.visible=o.mesh.visible;}
  const previous=renderer.getRenderTarget();renderer.setRenderTarget(this.target);renderer.clear();renderer.render(this.scene,camera);renderer.setRenderTarget(previous);return true;
 }
}
