import {Vector3} from 'three';

const hasMessage=o=>!o.properties?.locked&&o.properties?.messages?.some(m=>m.text?.trim());
// Carry upper stack members and joined tiles together so a hop cannot pull a
// connected surface apart. Logical transforms and physics bodies never move.
export function messageHopMembers(root,objects){
 const members=[root],seen=new Set(members);
 for(let i=0;i<members.length;i++){
  const o=members[i],joins=o.bathJoins??o.hedgeJoins??0,tile=o.type==='birdbath'?1.5:1;
  for(const other of objects){
   if(seen.has(other))continue;
   let joined=false;
   if(joins&&other.type===o.type&&!other.hanging&&Math.abs(other.mesh.position.y-o.mesh.position.y)<.001){
    const dx=other.mesh.position.x-o.mesh.position.x,dz=other.mesh.position.z-o.mesh.position.z;
    joined=Math.abs(dz)<.001&&(dx<0?joins&1:joins&2)&&Math.abs(Math.abs(dx)-tile)<.001||Math.abs(dx)<.001&&(dz<0?joins&4:joins&8)&&Math.abs(Math.abs(dz)-tile)<.001;
   }
   if(!other.hanging&&other.support===o||joined){seen.add(other);members.push(other);}
  }
 }
 return members;
}
export class MessageHops {
 constructor(random=Math.random){this.random=random;this.time=0;this.schedule=new Map();this.active=null;this.offsets=new Map();}
 reset(){this.time=0;this.schedule.clear();this.active=null;this.offsets.clear();}
 step(dt,objects,{disabled=false,busy=()=>false,clear=()=>true}={}){
  this.time+=Math.max(0,dt);this.offsets.clear();
  const eligible=objects.filter(o=>o.type!=='pool'&&hasMessage(o));
  for(const o of this.schedule.keys())if(!eligible.includes(o))this.schedule.delete(o);
  for(const o of eligible)if(!this.schedule.has(o))this.schedule.set(o,this.time+1.2+this.random()*2);
  const unavailable=members=>disabled||members.some(o=>!objects.includes(o)||o.properties?.locked||busy(o));
  if(this.active){
   const a=this.active;
   if(!eligible.includes(a.root)||unavailable(a.members)||!clear(a.members,a.height)){this.schedule.set(a.root,this.time+6+this.random()*6);this.active=null;}
   else{a.age+=dt;if(a.age>=.36){this.schedule.set(a.root,this.time+6+this.random()*7);this.active=null;}}
  }
  if(!this.active&&!disabled)for(const root of eligible){
   if(this.time<this.schedule.get(root))continue;
   const members=messageHopMembers(root,objects),height=Math.min(.13,Math.max(.06,(root.height??1)*.07));
   if(unavailable(members)||!clear(members,height)){this.schedule.set(root,this.time+.8);continue;}
   // One little hop at a time keeps a scene of message objects from bouncing in unison.
   this.active={root,members,height,age:0};break;
  }
  if(this.active){const a=this.active,t=a.age/.36,lift=a.height*4*t*(1-t);for(const o of a.members)this.offsets.set(o,lift);}
 }
 withPresentation(render){
  const saved=[...this.offsets].map(([o,y])=>({o,position:o.mesh.position.clone(),y}));
  try{for(const {o,y}of saved){o.mesh.position.y+=y;o.mesh.updateMatrixWorld(true);}return render();}
  finally{for(const {o,position}of saved){o.mesh.position.copy(position);o.mesh.updateMatrixWorld(true);}}
 }
}
export const hopClearance=(stacks,members,height)=>{
 const zero=new Vector3(),up=new Vector3(0,height,0);
 return stacks.valid(members,up)&&stacks.clear(members,zero,up);
};
