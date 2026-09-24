// Rectangular boolean union shared by rendering, water, and rigid-body terrain.
export const TERRAIN_EXTENT=4096;
export const DEFAULT_HOLES=[{id:0,x:3,z:-1.5,size:5}];
const EPS=1e-7;
export const holeBounds=h=>({x0:h.x-h.size/2,x1:h.x+h.size/2,z0:h.z-h.size/2,z1:h.z+h.size/2});
export const contains=(r,x,z,margin=0)=>x>=r.x0-margin&&x<=r.x1+margin&&z>=r.z0-margin&&z<=r.z1+margin;
const patch=(x0,x1,z0,z1)=>({x:(x0+x1)/2,z:(z0+z1)/2,w:x1-x0,d:z1-z0});
function rectangles(xs,zs,inside,want){
 const result=[],active=new Map();
 for(let z=0;z<zs.length-1;z++){
  const next=new Map();let x=0;
  while(x<xs.length-1){if(inside[z][x]!==want){x++;continue;}const start=x;while(x<xs.length-1&&inside[z][x]===want)x++;
   const key=`${start}:${x}`,old=active.get(key),r=old??{x0:xs[start],x1:xs[x],z0:zs[z],z1:zs[z+1]};r.z1=zs[z+1];if(!old)result.push(r);next.set(key,r);
  }
  active.clear();for(const [key,r]of next)active.set(key,r);
 }
 return result.map(r=>patch(r.x0,r.x1,r.z0,r.z1));
}
export class HoleLayout {
 constructor(holes=DEFAULT_HOLES){this.set(holes);}
 set(holes){
  this.holes=holes.map(h=>({...h}));this.rects=this.holes.map(holeBounds);
  const xs=[...new Set([-TERRAIN_EXTENT,TERRAIN_EXTENT,...this.rects.flatMap(r=>[r.x0,r.x1])])].sort((a,b)=>a-b);
  const zs=[...new Set([-TERRAIN_EXTENT,TERRAIN_EXTENT,...this.rects.flatMap(r=>[r.z0,r.z1])])].sort((a,b)=>a-b);
  const inside=zs.slice(1).map((_,z)=>xs.slice(1).map((_,x)=>this.contains((xs[x]+xs[x+1])/2,(zs[z]+zs[z+1])/2)));
  this.ground=rectangles(xs,zs,inside,false);this.bottom=rectangles(xs,zs,inside,true);this.walls=[];
  for(let z=0;z<zs.length-1;z++)for(let x=0;x<xs.length-1;x++)if(inside[z][x]){
   const x0=xs[x],x1=xs[x+1],z0=zs[z],z1=zs[z+1];
   if(!inside[z][x-1])this.walls.push(patch(x0-.04,x0,z0,z1));
   if(!inside[z][x+1])this.walls.push(patch(x1,x1+.04,z0,z1));
   if(!inside[z-1]?.[x])this.walls.push(patch(x0,x1,z0-.04,z0));
   if(!inside[z+1]?.[x])this.walls.push(patch(x0,x1,z1,z1+.04));
  }
  // Keep contact patches around tiny leaves and pods numerically well-scaled.
  this.physicsGround=this.ground.flatMap(p=>{
   const x0=p.x-p.w/2,x1=p.x+p.w/2,z0=p.z-p.d/2,z1=p.z+p.d/2;
   const xx=[x0,...[-32,32].filter(v=>v>x0&&v<x1),x1],zz=[z0,...[-32,32].filter(v=>v>z0&&v<z1),z1],out=[];
   for(let z=1;z<zz.length;z++)for(let x=1;x<xx.length;x++)out.push(patch(xx[x-1],xx[x],zz[z-1],zz[z]));return out;
  });
  this.components=[];const remaining=new Set(this.holes);
  while(remaining.size){const group=[remaining.values().next().value];remaining.delete(group[0]);
   for(let i=0;i<group.length;i++)for(const b of remaining){const a=holeBounds(group[i]),r=holeBounds(b),dx=Math.min(a.x1,r.x1)-Math.max(a.x0,r.x0),dz=Math.min(a.z1,r.z1)-Math.max(a.z0,r.z0);
    if(dx>=-EPS&&dz>=-EPS&&(dx>EPS||dz>EPS)){group.push(b);remaining.delete(b);}
   }
   const rs=group.map(holeBounds);this.components.push({holes:group,rects:rs,x0:Math.min(...rs.map(r=>r.x0)),x1:Math.max(...rs.map(r=>r.x1)),z0:Math.min(...rs.map(r=>r.z0)),z1:Math.max(...rs.map(r=>r.z1))});
  }
 }
 contains(x,z){return this.rects.some(r=>contains(r,x,z));}
}
const initial=new HoleLayout();
export const GROUND_PATCHES=initial.ground,PHYSICS_GROUND_PATCHES=initial.physicsGround;
export function inWater(x,z){return initial.contains(x,z);}
