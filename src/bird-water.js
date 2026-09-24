import {birdFootHeight} from './bird-traits.js';

// Feed contact impulses into the existing wave solver, before its next step.
// Only wet bodies disturb water; a bird flying over a pool leaves no wake.
export class BirdWaterContacts {
 constructor(){this.contacts=new Map();this.impulses=0;}
 step(dt,birds,waterAt){
  const live=new Set();
  for(const bird of birds){
   const key=`${bird.species??'bird'}-${bird.id}`;live.add(key);
   const previous=this.contacts.get(key),p=bird.position,water=waterAt(p);
   const foot=bird.species==='duck'?.18*(bird.scale??1):birdFootHeight(bird);
   const wet=water&&bird.opacity>.15&&p.y-foot<water.y+.06&&p.y>water.y-.12;
   if(!wet){if(previous?.wet)this.impulse(previous.water,previous.position,.10*previous.scale,.10*previous.scale);this.contacts.delete(key);continue;}
   const scale=bird.scale??1,mass=(bird.species==='duck'?2.8:1)*scale*scale;
   const continuous=previous?.wet&&previous.water.field===water.field;
   if(!continuous)this.impulse(water,p,-.22*mass,.11*scale);
   const angle=bird.dabbleAngle??0,angleChange=continuous?angle-(previous.angle??0):0;
   if(Math.abs(angleChange)>.0001){const head=p.clone();head.x+=Math.cos(bird.yaw??0)*.22*scale;head.z-=Math.sin(bird.yaw??0)*.22*scale;const headWater=waterAt(head);if(headWater?.field===water.field)this.impulse(headWater,head,angleChange*.22*mass,.12*scale);}
   const distance=continuous?Math.hypot(p.x-previous.position.x,p.z-previous.position.z):0;
   const speed=Math.min(2,distance/Math.max(dt,.001));
   // A depression beneath the body and a raised trailing wake conserve the
   // solver's zero-mean surface and scale with movement, rather than frame rate.
   if(speed>.015){
    this.impulse(water,p,-speed*dt*.9*mass,.10*scale);
    const trail=p.clone();trail.x-=(p.x-previous.position.x)/distance*.19*scale;trail.z-=(p.z-previous.position.z)/distance*.19*scale;
    const behind=waterAt(trail);if(behind?.field===water.field)this.impulse(behind,trail,speed*dt*.65*mass,.13*scale);
   }
   this.contacts.set(key,{wet:true,position:p.clone(),water,scale,angle});
  }
  for(const key of this.contacts.keys())if(!live.has(key))this.contacts.delete(key);
 }
 impulse(water,p,strength,radius){const uv=water.uv(p);water.field.disturb(uv.u,uv.v,strength,radius);this.impulses++;}
 reset(){this.contacts.clear();this.impulses=0;}
}
