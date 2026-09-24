import * as THREE from 'three';
import {readDragPayload,spawnCall} from './bindings.js';

// Drag-out placement: gallery tile → canvas drop → one spawned body at the
// world point under the cursor. The interaction slice builds the real
// ghost-preview and drag-throw hooks on this drop target — the payload type
// and the spawn call are the contract (integration note in the PR).

// Screen point → world point on the y=0 drop plane. Null when the ray never
// hits the plane (camera at/below the horizon) — no placement, not a guess.
export function dropPoint({clientX,clientY,camera,rect}){
 const ndc=new THREE.Vector2(
  ((clientX-rect.left)/rect.width)*2-1,
  -((clientY-rect.top)/rect.height)*2+1,
 );
 const ray=new THREE.Raycaster();
 // The camera may not have rendered since its last move (fresh instance,
 // engine resize): compose its matrices here rather than trusting the caller.
 camera.updateMatrixWorld();
 ray.setFromCamera(ndc,camera);
 const t=-ray.ray.origin.y/ray.ray.direction.y;
 if(!Number.isFinite(t)||t<=0)return null;
 const p=ray.ray.origin.clone().addScaledVector(ray.ray.direction,t);
 return[p.x,0,p.z];
}

export function installDrop({canvas,camera,kit,onDrop}={}){
 if(!canvas)return()=>{};
 const drop=e=>{
  e.preventDefault(); // a drop that isn't ours must not navigate either
  const preset=readDragPayload(e.dataTransfer);
  if(!preset)return;
  const point=dropPoint({
   clientX:e.clientX,clientY:e.clientY,camera,
   rect:canvas.getBoundingClientRect(),
  });
  if(!point)return;
  const handle=kit.spawn(preset,spawnCall(preset,point,kit.banner));
  onDrop?.(handle);
 };
 const over=e=>{
  e.preventDefault(); // required for the drop event to fire at all
  e.dataTransfer.dropEffect='copy';
 };
 canvas.addEventListener('dragover',over);
 canvas.addEventListener('drop',drop);
 return()=>{
  canvas.removeEventListener('dragover',over);
  canvas.removeEventListener('drop',drop);
 };
}
