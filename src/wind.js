import * as THREE from 'three';
// A coherent, spatial wind field. Zero strength means exactly zero forcing.
export class WindField{
 constructor(){this.strength=.14;this.direction=35;this.time=0;}
 step(dt){this.time+=dt;}
 sample(x=0,z=0,out=new THREE.Vector3()){
  if(this.strength===0)return out.set(0,0,0);
  const phase=this.time*.65-x*.17-z*.13;
  const gust=.72+.2*Math.sin(phase)+.13*Math.sin(phase*2.1+1.7);
  const angle=this.direction*Math.PI/180+.12*Math.sin(this.time*.27+x*.09);
  return out.set(Math.cos(angle),0,Math.sin(angle)).multiplyScalar(this.strength*gust);
 }
}
