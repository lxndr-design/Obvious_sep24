import {Vector3,Box3} from 'three';

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
export function messageHopBounds(o){
 if(!o.mesh.geometry.boundingBox)o.mesh.geometry.computeBoundingBox();
 o.mesh.updateWorldMatrix(true,false);return new Box3().copy(o.mesh.geometry.boundingBox).applyMatrix4(o.mesh.matrixWorld);
}
export function messageHopSize(o){const size=messageHopBounds(o).getSize(new Vector3());return Math.max(size.x,size.y,size.z,.01);}
export class MessageHops {
 constructor(random=Math.random){this.random=random;this.time=0;this.schedule=new Map();this.active=null;this.offsets=new Map();this.events=[];}
 reset(){this.time=0;this.schedule.clear();this.active=null;this.offsets.clear();this.events=[];}
 step(dt,objects,{disabled=false,busy=()=>false,clear=()=>true}={}){
  this.time+=Math.max(0,dt);this.offsets.clear();this.events=[];
  const eligible=objects.filter(o=>o.type!=='pool'&&o.support?.type!=='sign-pole'&&!o.messageSeen&&hasMessage(o));
  for(const o of this.schedule.keys())if(!eligible.includes(o))this.schedule.delete(o);
  for(const o of eligible)if(!this.schedule.has(o))this.schedule.set(o,this.time+1.2+this.random()*2);
  const unavailable=members=>disabled||members.some(o=>!objects.includes(o)||o.properties?.locked||busy(o));
  if(this.active){
   const a=this.active;
   if(!hasMessage(a.root)||unavailable(a.members)||!clear(a.members,a.height)){this.schedule.set(a.root,this.time+6+this.random()*6);this.active=null;}
   else{a.age+=dt;if(a.age>=a.duration){this.events.push({...a,kind:'landing'});this.schedule.set(a.root,this.time+6+this.random()*7);this.active=null;}}
  }
  if(!this.active&&!disabled)for(const root of eligible){
   if(this.time<this.schedule.get(root))continue;
   const members=messageHopMembers(root,objects),size=messageHopSize(root),height=size*.085,duration=Math.max(.24,Math.min(.55,.36*Math.sqrt(size)));
   if(unavailable(members)||!clear(members,height)){this.schedule.set(root,this.time+.8);continue;}
   // One little hop at a time keeps a scene of message objects from bouncing in unison.
   this.active={root,members,height,duration,age:0};this.events.push({...this.active,kind:'takeoff'});break;
  }
  if(this.active){const a=this.active,t=a.age/a.duration,lift=a.height*4*t*(1-t);for(const o of a.members)this.offsets.set(o,lift);}
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
