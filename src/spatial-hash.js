// Uniform spatial hash over the x/z plane backing CollisionScene's broad phase.
// Candidates from near() are a strict superset of the exact answers; callers keep
// their exact narrow phase (collision.js), so a stale or generous hash can only
// cost time, never change results.
//
// Cell lists are pooled and reused, keys are integers in two-level maps (no
// string building, no per-query allocation), so frame-time queries are
// allocation-free. Coordinates are unbounded: outer maps are keyed by integer
// cell coordinate, not by packed bits.
export class SpatialHash{
 constructor(cell=1){
  this.cell=cell;
  this.buckets=new Map();  // ix -> Map(iz -> pooled list {arr,n})
  this.pool=[];            // free bucket lists
  this.entries=new Map();  // object -> {minX,minZ,maxX,maxZ,cells:[ix,iz,...],cellCount}
  this.count=0;            // indexed objects; sync logic in collision.js compares this with the source array
  this.seen=new WeakMap(); // object -> last near() stamp, for candidate dedup
  this.stamp=0;
  this.source=null;        // array this index was last built against
 }
 bucket(ix,iz){
  let row=this.buckets.get(ix);if(!row){row=new Map();this.buckets.set(ix,row);}
  let list=row.get(iz);if(!list){list=this.pool.pop()||{arr:[],n:0};list.n=0;row.set(iz,list);}
  return list;
 }
 release(list,ix,iz){const row=this.buckets.get(ix);if(row.delete(iz)&&!row.size)this.buckets.delete(ix);list.n=0;this.pool.push(list);}
 removeFromCells(object,entry){
  const cells=entry.cells;
  for(let i=0;i<entry.cellCount;i++){
   const ix=cells[i*2],iz=cells[i*2+1],list=this.buckets.get(ix).get(iz),arr=list.arr;
   for(let j=0;j<list.n;j++)if(arr[j]===object){arr[j]=arr[--list.n];break;}
   if(!list.n)this.release(list,ix,iz);
  }
 }
 // Insert an object covering [minX,maxX]x[minZ,maxZ], or reindex it when the
 // coverage changed. The cells array on the record is reused across reindexes.
 index(object,minX,minZ,maxX,maxZ){
  let entry=this.entries.get(object);
  if(!entry){entry={minX,minZ,maxX,maxZ,cells:[],cellCount:0};this.entries.set(object,entry);this.count++;}
  else if(entry.minX===minX&&entry.minZ===minZ&&entry.maxX===maxX&&entry.maxZ===maxZ)return entry;
  else this.removeFromCells(object,entry);
  entry.minX=minX;entry.minZ=minZ;entry.maxX=maxX;entry.maxZ=maxZ;
  const cells=entry.cells;let count=0;
  for(let ix=Math.floor(minX/this.cell);ix<=Math.floor(maxX/this.cell);ix++)for(let iz=Math.floor(minZ/this.cell);iz<=Math.floor(maxZ/this.cell);iz++){cells[count++]=ix;cells[count++]=iz;const list=this.bucket(ix,iz);list.arr[list.n++]=object;}
  entry.cellCount=count/2;return entry;
 }
 remove(object){
  const entry=this.entries.get(object);if(!entry)return;
  this.removeFromCells(object,entry);this.entries.delete(object);this.count--;
 }
 clear(){
  for(const row of this.buckets.values())for(const list of row.values()){list.n=0;this.pool.push(list);}
  this.buckets.clear();this.entries.clear();this.count=0;this.source=null;
 }
 // Fills out (a reused array) with the objects whose indexed coverage overlaps
 // the query rectangle, deduplicated, and returns it. Superset of the exact
 // answer: cell membership is conservative, exact filtering is the caller's job.
 near(minX,minZ,maxX,maxZ,out){
  out.length=0;const stamp=++this.stamp,seen=this.seen;
  for(let ix=Math.floor(minX/this.cell);ix<=Math.floor(maxX/this.cell);ix++){
   const row=this.buckets.get(ix);if(!row)continue;
   for(let iz=Math.floor(minZ/this.cell);iz<=Math.floor(maxZ/this.cell);iz++){
    const list=row.get(iz);if(!list)continue;
    for(let i=0;i<list.n;i++){const object=list.arr[i];if(seen.get(object)===stamp)continue;seen.set(object,stamp);out.push(object);}
   }
  }return out;
 }
}
