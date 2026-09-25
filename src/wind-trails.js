import * as THREE from 'three';
const SEGMENTS=64,SIDES=6,TAU=Math.PI*2;
const smooth=t=>t*t*(3-2*t);
const randomSource=()=>{let seed=6013;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
export const trailRate=power=>power<.18?0:.12+2.4*power*power;
export function trailPoint(trail,u,out=new THREE.Vector3()){
 let forward=trail.distance*(u-.5),up=trail.height+Math.sin(u*TAU*trail.waves+trail.phase)*trail.sway,side=Math.sin(u*TAU*trail.waves*.7+trail.phase)*trail.sway*2;
 if(trail.loop){const f=Math.max(0,Math.min(1,(u-trail.loopStart)/trail.loopSpan)),turn=smooth(f)*TAU;
  forward-=trail.distance*trail.loopSpan*.8*smooth(f);forward+=Math.sin(turn)*trail.radius;
  const arc=(1-Math.cos(turn))*trail.radius;up+=arc*Math.cos(trail.roll);side+=arc*Math.sin(trail.roll);
 }
 return out.set(trail.origin.x+trail.forward.x*forward+trail.side.x*side,up,trail.origin.z+trail.forward.z*forward+trail.side.z*side);
}
export class WindTrails{
 constructor(scene,random=randomSource()){
  this.random=random;this.slots=[];this.credit=0;this.spawned=0;this.accumulator=0;
  for(let n=0;n<10;n++){
   const geometry=new THREE.BufferGeometry(),positions=new Float32Array((SEGMENTS+1)*SIDES*3),normals=new Float32Array(positions.length),indices=[];
   for(let i=0;i<SEGMENTS;i++)for(let j=0;j<SIDES;j++){const a=i*SIDES+j,b=i*SIDES+(j+1)%SIDES;indices.push(a,b,a+SIDES,b,b+SIDES,a+SIDES);}
   geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
   const material=new THREE.MeshPhongMaterial({color:0xffffff,specular:0x555555,shininess:12,transparent:true,opacity:0,depthWrite:false});
   const mesh=new THREE.Mesh(geometry,material);mesh.visible=false;scene.add(mesh);this.slots.push({mesh,trail:null});
  }
  this.p=new THREE.Vector3();this.next=new THREE.Vector3();this.tangent=new THREE.Vector3();this.normal=new THREE.Vector3();this.binormal=new THREE.Vector3();
 }
 spawn(wind,center){
  const slot=this.slots.find(s=>!s.trail);if(!slot)return;const r=this.random,p=wind.strength,origin=new THREE.Vector3(center.x+(r()-.5)*15,0,center.z+(r()-.5)*15),forward=wind.sample(origin.x,origin.z).normalize(),side=new THREE.Vector3(-forward.z,0,forward.x);
  slot.trail={origin,forward,side,age:0,life:2.2+r()*1.4,distance:12+p*10+r()*5,span:.16+p*.14+r()*.07,width:.016+p*p*.085,height:.35+r()*1.2,sway:.07+r()*(.12+wind.turbulence*.35),waves:.6+r()*1.6,phase:r()*TAU,loop:r()<.25+wind.turbulence*.3,loopStart:.25+r()*.22,loopSpan:.24+r()*.12,radius:.45+r()*(.45+p*.55),roll:(r()-.5)*1.1,fade:1};
  this.spawned++;slot.mesh.visible=true;
 }
 update(dt,wind,center=new THREE.Vector3()){
  this.accumulator+=Math.min(dt,.1);
  while(this.accumulator+1e-9>=1/60){
   this.credit+=trailRate(wind.strength)/60;
   if(wind.strength<.18)this.credit=0;
   if(this.credit>=1){this.credit--;this.spawn(wind,center);}
   for(const slot of this.slots)if(slot.trail){const t=slot.trail;t.age+=1/60;if(wind.strength<.18)t.fade=Math.max(0,t.fade-1/24);if(t.age>=t.life||t.fade===0){slot.trail=null;slot.mesh.visible=false;}}
   this.accumulator-=1/60;
  }
  for(const slot of this.slots)if(slot.trail)this.draw(slot);
 }
 draw({trail:t,mesh}){
  const progress=t.age/t.life,head=progress*(1+t.span),tail=head-t.span,a=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
  for(let i=0;i<=SEGMENTS;i++){
   const v=i/SEGMENTS,u=Math.max(0,Math.min(1,tail+t.span*v));trailPoint(t,u,this.p);trailPoint(t,u+.0001,this.next);this.tangent.subVectors(this.next,this.p).normalize();
   this.normal.copy(t.side);this.binormal.crossVectors(this.tangent,this.normal).normalize();this.normal.crossVectors(this.binormal,this.tangent).normalize();
   const width=t.width*Math.pow(Math.sin(Math.PI*v),.8)*(tail+t.span*v<0||tail+t.span*v>1?0:1);
   for(let j=0;j<SIDES;j++){const c=Math.cos(j/SIDES*TAU),s=Math.sin(j/SIDES*TAU),nx=this.normal.x*c+this.binormal.x*s,ny=this.normal.y*c+this.binormal.y*s,nz=this.normal.z*c+this.binormal.z*s,k=i*SIDES+j;a.setXYZ(k,this.p.x+nx*width,this.p.y+ny*width,this.p.z+nz*width);n.setXYZ(k,nx,ny,nz);}
  }
  a.needsUpdate=n.needsUpdate=true;mesh.geometry.computeBoundingSphere();mesh.material.opacity=.8*Math.pow(Math.sin(Math.PI*progress),.45)*t.fade;
 }
 reset(){this.credit=this.accumulator=this.spawned=0;for(const s of this.slots){s.trail=null;s.mesh.visible=false;}}
 read(){return {active:this.slots.filter(s=>s.trail).length,spawned:this.spawned,loops:this.slots.filter(s=>s.trail?.loop).length};}
 dispose(){for(const s of this.slots){s.mesh.removeFromParent();s.mesh.geometry.dispose();s.mesh.material.dispose();}}
}
