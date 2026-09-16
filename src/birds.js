import * as THREE from 'three';
export function seededRandom(seed=901){return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// Behavior is deterministic under a seed; rendering is separate from ecology.
export class BirdColony {
 constructor(random=seededRandom(419)){this.random=random;this.time=0;this.nextArrival=7;this.birds=[];this.quiet=new Map();this.sequence=0;this.limit=5;this.onPeck=null;}
 disturb(position,piles){
  for(const pile of piles)if(position.distanceTo(pile.position)<2.1)this.quiet.set(pile.id,this.time);
  const startled=this.birds.filter(b=>b.state!=='departing'&&b.position.distanceTo(position)<1.65);
  for(const b of this.birds)if(b.state!=='departing'&&(startled.includes(b)||startled.some(n=>n.position.distanceTo(b.position)<1.4)))this.depart(b,position);
 }
 depart(b,from){
  if(b.state==='departing')return;b.state='departing';b.age=0;b.from=b.position.clone();
  const away=b.position.clone().sub(from??b.position.clone().add(new THREE.Vector3(1,0,1)));away.y=0;if(away.lengthSq()<.01)away.set(-1,0,1);away.normalize();
  b.to=b.position.clone().addScaledVector(away,3.5).add(new THREE.Vector3(0,4.1,0));b.startOpacity=b.opacity;b.yaw=Math.atan2(-(b.to.z-b.from.z),b.to.x-b.from.x);
  this.quiet.set(b.pileId,this.time);this.nextArrival=Math.max(this.nextArrival,this.time+11);
 }
 step(dt,piles,pointer=null,isClear=()=>true){
  this.time+=dt;if(pointer)this.disturb(pointer,piles);
  for(const b of this.birds){b.age+=dt;
   const pile=piles.find(p=>p.id===b.pileId&&p.count>=3);
   if(b.state!=='departing'&&(!pile||!isClear(b.target)))this.depart(b,pointer);
   if(b.state==='arriving'){
    const t=Math.min(1,b.age/2.8),s=smooth(t);b.position.lerpVectors(b.from,b.target,s);b.position.y+=Math.sin(Math.PI*t)*.35;
    b.opacity=smooth(t/.8);b.wing=Math.sin(b.age*34)*.95;b.peck=0;
    if(t===1){b.state='foraging';b.age=0;b.walkTarget=b.target.clone();b.nextWalk=.5;b.lastPeck=-1;b.wing=0;}
   }else if(b.state==='foraging'){
    b.opacity=1;b.wing=0;
    if(b.age>=b.nextWalk){const a=this.random()*Math.PI*2,r=.2+this.random()*.4;const target=pile.position.clone().add(new THREE.Vector3(Math.cos(a)*r,.08,Math.sin(a)*r));if(isClear(target)&&this.birds.every(other=>other===b||other.state!=='foraging'||other.position.distanceTo(target)>.4))b.walkTarget=target;b.nextWalk=b.age+1.8+this.random()*2.1;}
    const delta=b.walkTarget.clone().sub(b.position);delta.y=0;const distance=delta.length();
    if(distance>.025){const next=b.position.clone().addScaledVector(delta,Math.min(1,dt*.65/distance));if(isClear(next)&&this.birds.every(other=>other===b||other.state!=='foraging'||other.position.distanceTo(next)>.33))b.position.copy(next);b.yaw=Math.atan2(-delta.z,delta.x);b.position.y=.08+Math.abs(Math.sin(b.age*17))*.018;b.peck=0;}
    else{b.position.y=.08;const cycle=Math.floor(b.age/2.5),phase=(b.age%2.5)/2.5;b.peck=phase<.36?Math.sin(phase/.36*Math.PI):0;if(b.peck>.9&&cycle!==b.lastPeck){b.lastPeck=cycle;this.onPeck?.(b.position,pile);}}
    // Quiet visitors linger, then leave naturally even without a scare.
    if(b.age>50+8*b.id)this.depart(b,null);
   }else{
    const t=Math.min(1,b.age/2.5);b.position.lerpVectors(b.from,b.to,smooth(t));b.opacity=b.startOpacity*(1-smooth((t-.1)/.75));b.wing=Math.sin(b.age*38)*1.15;b.peck=0;
   }
  }
  this.birds=this.birds.filter(b=>b.state!=='departing'||b.age<2.5);
  if(this.time>=this.nextArrival&&this.birds.length<this.limit){
   const candidates=piles.filter(p=>p.count>=3&&this.time-(this.quiet.get(p.id)??0)>6&&(!pointer||pointer.distanceTo(p.position)>2.1));
   // Prefer the same leaf pile as calm existing birds, without packing identical positions.
   candidates.sort((a,b)=>this.birds.filter(v=>v.pileId===b.id&&v.state==='foraging').length-this.birds.filter(v=>v.pileId===a.id&&v.state==='foraging').length);
   const pile=candidates[0];
   if(pile){let target=null;for(let i=0;i<12;i++){const a=this.random()*Math.PI*2,r=.15+this.random()*.65,p=pile.position.clone().add(new THREE.Vector3(Math.cos(a)*r,.08,Math.sin(a)*r));if(isClear(p)&&this.birds.every(b=>b.target.distanceTo(p)>.45)){target=p;break;}}
    if(target){const from=target.clone().add(new THREE.Vector3(-2.5-this.random(),3.5+this.random(),-1));this.birds.push({id:++this.sequence,pileId:pile.id,state:'arriving',age:0,position:from.clone(),from,target,opacity:0,wing:0,peck:0,yaw:Math.atan2(-(target.z-from.z),target.x-from.x)});this.nextArrival=this.time+8+this.random()*5;}
    else this.nextArrival=this.time+2;
   }else this.nextArrival=this.time+1;
  }
 }
 reset(){this.time=0;this.nextArrival=7;this.birds=[];this.quiet.clear();this.sequence=0;}
}
