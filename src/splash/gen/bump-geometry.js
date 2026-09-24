import * as THREE from 'three';
import {displacePositions,resolveBumpParams} from './bump3d.js';

// Three-aware half of the bump generator: geometry in, displaced geometry out.
// bump3d.js itself stays import-free so the noise worker can bundle it alone;
// all geometry assembly happens here, on the main thread, where three.js is
// already loaded. The heavy per-vertex math (displacePositions) still runs
// off-thread through the noise channel — these helpers only stamp results in
// and rebuild normals, which is cheap adjacency work over the index.

// Synchronous one-shot displacement (the spec's displace3D sample): clones the
// source, displaces on the calling thread, rebuilds normals. The kit goes
// through the noise channel instead; this is the direct-call convenience used
// by tests and by any caller that already owns the wait.
export function displace3D(geometry,params={}){
 const cfg=resolveBumpParams(params);
 return finishDisplaced(geometry,displacePositions(geometry.attributes.position.array,cfg),cfg);
}

// Stamps worker-returned positions into a fresh clone of the source geometry
// and rebuilds normals from the real displaced surface — the geometry's
// silhouette normals stay honest, no faked derivative tricks.
export function finishDisplaced(geometry,positions,params){
 const cfg=resolveBumpParams(params);
 if(!(positions instanceof Float32Array)||positions.length!==geometry.attributes.position.array.length){
  throw new TypeError('finishDisplaced: positions must be a Float32Array matching the source');
 }
 const out=geometry.clone();
 out.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 out.computeVertexNormals();
 // BufferGeometry.clone() shares userData by reference (verified in three
 // 0.180: two clones report identical userData objects) — stamping out.userData
 // directly would leak the stamp into the SHARED preset cache and every other
 // clone. Install a fresh userData on the clone instead.
 out.userData={...geometry.userData,bump3d:{...cfg,generator:'fbm3-displace3d'}}; // provenance for tests and the editor HUD
 return out;
}
