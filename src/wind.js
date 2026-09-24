import * as THREE from 'three';
const fade=t=>t*t*t*(t*(t*6-15)+10),mix=(a,b,t)=>a+(b-a)*t;
const hash=(x,z,t)=>{let h=Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(t,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295*2-1;};
// Smooth value noise: nearby blades share gusts without identical periodic motion.
export function windNoise(x,z,t){
 const ix=Math.floor(x),iz=Math.floor(z),it=Math.floor(t),fx=fade(x-ix),fz=fade(z-iz),ft=fade(t-it);
 const plane=k=>mix(mix(hash(ix,iz,k),hash(ix+1,iz,k),fx),mix(hash(ix,iz+1,k),hash(ix+1,iz+1,k),fx),fz);
 return mix(plane(it),plane(it+1),ft);
}
export class WindField{
 constructor(){this.strength=.14;this.direction=35;this.turbulence=.35;this.time=0;}
 step(dt){this.time+=dt;}
 sample(x=0,z=0,out=new THREE.Vector3()){
  if(this.strength===0)return out.set(0,0,0);
  const t=this.time,k=this.turbulence;
  const broad=windNoise(x*.22-t*.28,z*.22,t*.38),fine=windNoise(x*.85+13,z*.85-t*.42,t*1.1+17);
  const gust=1+k*(.65*broad+.3*fine),angle=this.direction*Math.PI/180+k*(.85*windNoise(x*.3+51,z*.3,t*.65)+.24*fine);
  return out.set(Math.cos(angle),0,Math.sin(angle)).multiplyScalar(this.strength*gust);
 }
}
