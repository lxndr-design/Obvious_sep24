import * as THREE from 'three';

// Pure pointer-to-scene math for the interaction layer: every screen mapping
// goes through a camera-facing plane so the cursor tracks the banner without
// depth drift. DOM-free — the entry feeds it the camera and NDC coordinates,
// and node --test drives the same functions headless with a real camera.
//
// Two plane flavors share one rule (the camera's view direction as normal):
//  - through the scene origin: hover magnet, shockwave clicks, editor drop zone
//  - through the picked body: drag targets keep their own depth while following
//    the cursor, so a throw never flicks the body toward the camera

// Tuning constants for the interaction feel. The drag spring itself uses the
// repo-proven pendulums gains and lives in the sim world's config.
export const THROW_WINDOW_MS=90;  // velocity window for a drag release
export const THROW_SCALE=1.15;    // pointer velocity -> world velocity
export const THROW_MAX_SPEED=50;  // cap so a fling cannot exceed the bounds spring
export const HOLD_MS=180;         // empty-space press: click vs hold-to-repel
export const CLICK_SLOP_NDC=.02;  // press movement still counted as a click
export const POINTER_RADIUS=6;    // default magnet reach (protocol pointer.radius)
export const SHOCKWAVE_STRENGTH=1;
export const SHOCKWAVE_RADIUS=8;

const _ray=new THREE.Raycaster();
const _ndc=new THREE.Vector2();
const _normal=new THREE.Vector3();

// Camera-facing plane through a world point (default: the scene origin).
export function cameraPlane(camera,through=[0,0,0]){
 camera.getWorldDirection(_normal); // camera looks down -normal; the plane faces back
 return new THREE.Plane().setFromNormalAndCoplanarPoint(
  _normal.negate(),
  new THREE.Vector3(through[0],through[1],through[2]),
 );
}

// NDC point -> world point on the plane, or null when the ray never reaches it
// (plane behind the camera). `out` lets hot callers reuse a vector; events are
// sparse, so allocating is fine too.
export function planePoint(camera,ndcX,ndcY,plane,out=new THREE.Vector3()){
 _ndc.set(ndcX,ndcY);
 _ray.setFromCamera(_ndc,camera);
 return _ray.ray.intersectPlane(plane,out);
}

// Release velocity from timestamped plane samples ({t, p:[x,y,z]} pushed in
// time order): a differenced velocity over the recent window, scaled and
// capped. Returns null when the window holds fewer than two usable samples —
// an instant grab-release throws nothing.
export function pointerVelocity(samples,now,windowMs=THROW_WINDOW_MS){
 let oldest=null,newest=null;
 for(let i=samples.length-1;i>=0;i--){
  const s=samples[i];
  if(now-s.t>windowMs)break;
  if(!newest)newest=s;
  else oldest=s;
 }
 if(!oldest||!newest)return null;
 const dt=(newest.t-oldest.t)/1000;
 if(!(dt>0))return null;
 const v=[
  (newest.p[0]-oldest.p[0])/dt*THROW_SCALE,
  (newest.p[1]-oldest.p[1])/dt*THROW_SCALE,
  (newest.p[2]-oldest.p[2])/dt*THROW_SCALE,
 ];
 const mag=Math.hypot(v[0],v[1],v[2]);
 if(mag>THROW_MAX_SPEED){
  const k=THROW_MAX_SPEED/mag;
  v[0]*=k;v[1]*=k;v[2]*=k;
 }
 return v;
}
