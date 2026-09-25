import * as THREE from 'three';
import {PRESETS,presetGeometry} from '../presets.js';
import {createMaterial} from '../materials/index.js';

// The GPU batching layer: one InstancedMesh per (preset, material) bucket,
// pooled slots, per-body instanceColor, and matrix writes only for bodies the
// sim marked dirty — settled bodies cost zero work. sync() and applyPoses()
// run every frame once the sim lands: neither may allocate.

const INITIAL_CAPACITY=256;

export class InstanceField{
 constructor(scene,{capacity=24000,createMaterial:materialFactory}={}){
  this.scene=scene;
  this.capacity=capacity;
  // Injectable so kit.fractalBump can hand 'bump' buckets their preset's noise
  // params; default defers to the registry. Signature: (kind, preset) => material.
  this.materialFactory=materialFactory??((kind)=>createMaterial(kind));
  // Preset → displaced geometry (kit.fractalBump). Overrides are field-owned
  // clones — the shared preset cache is never mutated or disposed here.
  this.geometryOverrides=new Map();
  this.buckets=new Map();
  this.handles=new Map();
  this.nextId=1;
  this.used=0;
  this.disposed=false;
  // Governor tier-3 pose interpolation: when the sim runs at 60 Hz, sync()
  // blends each awake body between its previous and current sim pose (alpha
  // from the kit's arrival timing) instead of snapping on arrival frames.
  this.interpolation={enabled:false,alpha:0};
  // Frame-loop temps, allocated once for the field's whole life.
  this._m=new THREE.Matrix4();
  this._q=new THREE.Quaternion();
  this._v=new THREE.Vector3();
  this._s=new THREE.Vector3();
  this._c=new THREE.Color();
  this._pv=new THREE.Vector3();
  this._pq=new THREE.Quaternion();
  this._cq=new THREE.Quaternion();
  this._iq=new THREE.Quaternion();
 }
 get bucketCount(){return this.buckets.size;}

 acquire(name,opts={}){
  if(this.disposed)throw new Error('InstanceField: acquire after dispose');
  const preset=PRESETS[name];
  if(!preset)throw new Error(`Unknown preset: ${name}`);
  if(this.used>=this.capacity)throw new Error(`Instance cap reached (${this.capacity})`);
  const material=opts.material??preset.material;
  const key=`${name}:${material}`;
  let bucket=this.buckets.get(key);
  if(!bucket)bucket=this.createBucket(name,material,key);
  let slot;
  if(bucket.free.length){
   slot=bucket.free.pop();
   if(slot>=bucket.highWater)bucket.highWater=slot+1;
  }else{
   if(bucket.highWater>=bucket.capacity)this.grow(bucket);
   slot=bucket.highWater++;
  }
  bucket.mesh.count=bucket.highWater;
  const handle={
   id:this.nextId++,preset:name,material,bucket:key,slot,
   position:[0,0,0],rotation:[0,0,0,1],scale:1,
   prevPosition:[0,0,0],prevRotation:[0,0,0,1], // interpolation source (tier 3)
   color:opts.color??preset.color,
   behavior:opts.behavior??preset.behavior,
   seed:opts.seed??this.nextId,
   dirty:true,synced:false,asleep:false,
  };
  this.handles.set(handle.id,handle);
  bucket.bySlot[slot]=handle;
  bucket.dirtyIds.add(handle.id);
  this._c.set(handle.color);
  bucket.mesh.setColorAt(slot,this._c);
  if(bucket.mesh.instanceColor)bucket.mesh.instanceColor.needsUpdate=true;
  this.used++;
  return handle;
 }

 // Accepts a handle or a bare body id (the worker only knows ids).
 release(handleOrId){
  const handle=typeof handleOrId==='object'?handleOrId:this.handles.get(handleOrId);
  if(!handle)return false;
  const bucket=this.buckets.get(handle.bucket);
  bucket.bySlot[handle.slot]=undefined;
  bucket.dirtyIds.delete(handle.id);
  this.handles.delete(handle.id);
  this._m.makeScale(0,0,0); // zero-scale hides the pooled slot in the high-water range
  bucket.mesh.setMatrixAt(handle.slot,this._m);
  bucket.mesh.instanceMatrix.needsUpdate=true;
  bucket.free.push(handle.slot);
  while(bucket.highWater>0&&bucket.bySlot[bucket.highWater-1]===undefined)bucket.highWater--;
  bucket.mesh.count=bucket.highWater;
  this.used--;
  return true;
 }

 releaseAll(){
  const ids=[...this.handles.keys()];
  for(const id of ids)this.release(id);
  return ids;
 }

 // Governor tier-2 lever: shed the oldest live bodies (ascending id — spawn
 // order) back toward a target count, pooled like any release. `keep` protects
 // one id (the body under a drag spring). Returns the released ids for the
 // caller's sim despawn message.
 cullOldest(count,{keep}={}){
  if(!(count>0))return[];
  const ids=[];
  for(const handle of this.handles.values()){ // Map order = ascending id
   if(handle.id===keep)continue;
   ids.push(handle.id);
   this.release(handle);
   if(ids.length>=count)break;
  }
  return ids;
 }

 // Editor-time placement: spawn, DnD ghosts, drag targets.
 setPose(handle,pose={}){
  const bucket=this.buckets.get(handle.bucket);
  if(pose.position)for(let i=0;i<3;i++)handle.position[i]=pose.position[i];
  if(pose.rotation)for(let i=0;i<4;i++)handle.rotation[i]=pose.rotation[i];
  if(pose.scale!==undefined)handle.scale=pose.scale;
  handle.dirty=true;
  bucket.dirtyIds.add(handle.id);
 }

 // Sim frame consumer (protocol "poses" payload): copies poses for awake
 // bodies, skips matrix work for bodies already asleep and settled. With
 // interpolation enabled, the outgoing pose is kept as the blend source
 // first — in-place, never allocated.
 applyPoses(frameMsg){
  const{ids,positions,quaternions,sleep}=frameMsg;
  const interp=this.interpolation.enabled;
  for(let k=0;k<ids.length;k++){
   const handle=this.handles.get(ids[k]);
   if(!handle)continue;
   handle.asleep=sleep[k]===1;
   if(handle.asleep&&handle.synced&&!handle.dirty)continue;
   if(interp){
    handle.prevPosition[0]=handle.position[0];
    handle.prevPosition[1]=handle.position[1];
    handle.prevPosition[2]=handle.position[2];
    handle.prevRotation[0]=handle.rotation[0];
    handle.prevRotation[1]=handle.rotation[1];
    handle.prevRotation[2]=handle.rotation[2];
    handle.prevRotation[3]=handle.rotation[3];
   }
   const o=k*3,qo=k*4;
   handle.position[0]=positions[o];
   handle.position[1]=positions[o+1];
   handle.position[2]=positions[o+2];
   handle.rotation[0]=quaternions[qo];
   handle.rotation[1]=quaternions[qo+1];
   handle.rotation[2]=quaternions[qo+2];
   handle.rotation[3]=quaternions[qo+3];
   handle.dirty=true;
   handle.synced=true;
   this.buckets.get(handle.bucket).dirtyIds.add(handle.id);
  }
 }

 // Enables pose blending; sources snap to current poses first so the first
 // interpolated frame never blends from a zeroed placeholder.
 setInterpolation(enabled){
  if(enabled===this.interpolation.enabled)return;
  this.interpolation.enabled=enabled;
  this.interpolation.alpha=0;
  if(enabled)for(const handle of this.handles.values()){
   handle.prevPosition[0]=handle.position[0];
   handle.prevPosition[1]=handle.position[1];
   handle.prevPosition[2]=handle.position[2];
   handle.prevRotation[0]=handle.rotation[0];
   handle.prevRotation[1]=handle.rotation[1];
   handle.prevRotation[2]=handle.rotation[2];
   handle.prevRotation[3]=handle.rotation[3];
  }
 }

 // Writes matrices for dirty handles only; instanceMatrix.version bumps once
 // per bucket with actual changes, which is the observable write-skip signal.
 // With interpolation enabled (governor tier 3), every live awake slot is
 // rewritten each frame between prev and current pose at the frame alpha —
 // a 60 Hz sim feeding a 60 Hz renderer drifts, and the blend hides the beat.
 sync(){
  const interp=this.interpolation.enabled;
  for(const bucket of this.buckets.values()){
   if(!interp){
    if(!bucket.dirtyIds.size)continue;
    for(const id of bucket.dirtyIds){
     const handle=this.handles.get(id);
     this._v.set(handle.position[0],handle.position[1],handle.position[2]);
     this._q.set(handle.rotation[0],handle.rotation[1],handle.rotation[2],handle.rotation[3]);
     this._s.setScalar(handle.scale);
     this._m.compose(this._v,this._q,this._s);
     bucket.mesh.setMatrixAt(handle.slot,this._m);
     handle.dirty=false;
     handle.synced=true; // lets applyPoses skip settled bodies on the next frame
    }
    bucket.dirtyIds.clear();
    bucket.mesh.instanceMatrix.needsUpdate=true;
    continue;
   }
   const alpha=this.interpolation.alpha;
   let wrote=false;
   for(let slot=0;slot<bucket.highWater;slot++){
    const handle=bucket.bySlot[slot];
    if(!handle)continue; // free slot inside the high-water range
    if(handle.asleep&&handle.synced&&!handle.dirty)continue; // settled: keep last matrix
    this._pv.set(handle.prevPosition[0],handle.prevPosition[1],handle.prevPosition[2]);
    this._v.set(handle.position[0],handle.position[1],handle.position[2]);
    this._pv.lerp(this._v,alpha);
    this._pq.set(handle.prevRotation[0],handle.prevRotation[1],handle.prevRotation[2],handle.prevRotation[3]);
    this._cq.set(handle.rotation[0],handle.rotation[1],handle.rotation[2],handle.rotation[3]);
    this._iq.slerpQuaternions(this._pq,this._cq,alpha);
    this._s.setScalar(handle.scale);
    this._m.compose(this._pv,this._iq,this._s);
    bucket.mesh.setMatrixAt(slot,this._m);
    handle.dirty=false;
    handle.synced=true;
    wrote=true;
   }
   if(wrote)bucket.mesh.instanceMatrix.needsUpdate=true;
  }
 }

 // Replaces the geometry a preset renders with (kit.fractalBump): future
 // buckets get it immediately, live buckets swap in place — instanceMatrix
 // and instanceColor live on the mesh, so pooled slots survive the swap.
 registerGeometry(name,geometry){
  if(!PRESETS[name])throw new Error(`Unknown preset: ${name}`);
  if(!(geometry instanceof THREE.BufferGeometry))throw new TypeError('registerGeometry expects a BufferGeometry');
  const previous=this.geometryOverrides.get(name);
  if(previous&&previous!==geometry)previous.dispose(); // never the shared preset cache
  this.geometryOverrides.set(name,geometry);
  for(const bucket of this.buckets.values()){
   if(bucket.preset===name)bucket.mesh.geometry=geometry;
  }
 }

 createBucket(name,material,key){
  const capacity=Math.min(INITIAL_CAPACITY,this.capacity);
  const geometry=this.geometryOverrides.get(name)??presetGeometry(name);
  const mesh=new THREE.InstancedMesh(geometry,this.materialFactory(material,name),capacity);
  mesh.frustumCulled=false; // instances span the banner; per-geometry culling would pop batches
  mesh.count=0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.scene.add(mesh);
  const bucket={key,preset:name,material,mesh,capacity,highWater:0,free:[],dirtyIds:new Set(),bySlot:[]};
  this.buckets.set(key,bucket);
  return bucket;
 }

 grow(bucket){
  const capacity=Math.min(bucket.capacity*2,this.capacity);
  const mesh=new THREE.InstancedMesh(bucket.mesh.geometry,bucket.mesh.material,capacity);
  mesh.frustumCulled=false;
  mesh.count=bucket.highWater;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceMatrix.array.set(bucket.mesh.instanceMatrix.array);
  if(bucket.mesh.instanceColor){
   mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(bucket.mesh.instanceColor.array),bucket.mesh.instanceColor.itemSize);
   mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }
  this.scene.remove(bucket.mesh);
  bucket.mesh.dispose();
  this.scene.add(mesh);
  bucket.mesh=mesh;
  bucket.capacity=capacity;
 }

 dispose(){
  this.disposed=true;
  for(const bucket of this.buckets.values()){
   this.scene.remove(bucket.mesh);
   bucket.mesh.material.dispose(); // created per bucket; shared preset geometry stays cached
   bucket.mesh.dispose();
  }
  for(const geometry of this.geometryOverrides.values())geometry.dispose(); // field-owned displaced clones
  this.geometryOverrides.clear();
  this.buckets.clear();
  this.handles.clear();
  this.used=0;
 }
}
