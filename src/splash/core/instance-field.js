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
  // Frame-loop temps, allocated once for the field's whole life.
  this._m=new THREE.Matrix4();
  this._q=new THREE.Quaternion();
  this._v=new THREE.Vector3();
  this._s=new THREE.Vector3();
  this._c=new THREE.Color();
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
 // bodies, skips matrix work for bodies already asleep and settled.
 applyPoses(frameMsg){
  const{ids,positions,quaternions,sleep}=frameMsg;
  for(let k=0;k<ids.length;k++){
   const handle=this.handles.get(ids[k]);
   if(!handle)continue;
   handle.asleep=sleep[k]===1;
   if(handle.asleep&&handle.synced&&!handle.dirty)continue;
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

 // Writes matrices for dirty handles only; instanceMatrix.version bumps once
 // per bucket with actual changes, which is the observable write-skip signal.
 sync(){
  for(const bucket of this.buckets.values()){
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
