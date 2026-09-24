import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {presetGeometry} from '../src/splash/presets.js';
import {
 BUMP_DEFAULTS,resolveBumpParams,hash3u,noise3,fbm3,displacePositions,FBM3_GLSL,
} from '../src/splash/gen/bump3d.js';
import {displace3D,finishDisplaced} from '../src/splash/gen/bump-geometry.js';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');

test('resolveBumpParams: defaults, clamping and loud validation',()=>{
 assert.deepEqual(resolveBumpParams(),BUMP_DEFAULTS);
 assert.deepEqual(resolveBumpParams({}),BUMP_DEFAULTS);
 // Range clamping for slider-style callers…
 const clamped=resolveBumpParams({octaves:99,frequency:1000,amplitude:5,lacunarity:0,gain:2,seed:-3});
 assert.deepEqual(clamped,{octaves:8,frequency:16,amplitude:1,lacunarity:1,gain:1,seed:0});
 // …but garbage types fail loudly, never silently.
 assert.throws(()=>resolveBumpParams({seed:2.5}),/integer/);
 assert.throws(()=>resolveBumpParams({octaves:1.5}),/integer/);
 assert.throws(()=>resolveBumpParams({frequency:'high'}),/finite number/);
 assert.throws(()=>resolveBumpParams({amplitude:NaN}),/finite number/);
 assert.throws(()=>resolveBumpParams(null),/must be an object/);
 // Frozen: configs cross the worker boundary and get cached by the kit.
 assert.equal(Object.isFrozen(resolveBumpParams({seed:3})),true);
});

test('fbm3 is deterministic, seeded and bounded to [-1,1)',()=>{
 for(const seed of [0,7,12345]){
  const a=fbm3(.37,-1.2,2.5,{seed});
  const b=fbm3(.37,-1.2,2.5,{seed});
  assert.equal(a,b);
 }
 assert.notEqual(fbm3(.37,-1.2,2.5,{seed:7}),fbm3(.37,-1.2,2.5,{seed:8}));
 for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++){
  const v=fbm3(x*.5,y*.5,z*.5,{seed:11});
  assert.ok(v>=-1&&v<1,`fbm3 out of range at (${x},${y},${z}): ${v}`);
 }
 // Amplitude normalization: octave count must not change the output range.
 for(const octaves of [1,2,5,8]){
  const v=fbm3(1.3,.7,-.4,{octaves,seed:5});
  assert.ok(v>=-1&&v<1,`fbm3 octaves=${octaves} out of range: ${v}`);
 }
});

test('noise3 is smooth across cell borders (no lattice popping)',()=>{
 // Values just either side of an integer border must be close: a broken
 // fade or hash mismatch shows up as a jump here.
 const a=noise3(1.999,0.5,0.5,7),b=noise3(2.001,0.5,0.5,7);
 assert.ok(Math.abs(a-b)<.15,`border jump too large: ${a} vs ${b}`);
});

test('displacePositions is deterministic per seed and bounded',()=>{
 const sphere=new THREE.SphereGeometry(1,16,12);
 const source=sphere.attributes.position.array;
 const A=BUMP_DEFAULTS.amplitude;
 const first=displacePositions(source,{seed:7});
 const second=displacePositions(source,{seed:7});
 assert.deepEqual(first,second);
 assert.notDeepEqual(displacePositions(source,{seed:8}),first);
 for(let i=0;i<source.length;i+=3){
  const x=source[i],y=source[i+1],z=source[i+2];
  const r0=Math.hypot(x,y,z);
  const r1=Math.hypot(first[i],first[i+1],first[i+2]);
  assert.ok(r1>=r0-A-1e-6&&r1<=r0+A+1e-6,`radius ${r1} escaped [${r0}-A, ${r0}+A]`);
  // Radial push: the displaced point stays on the same ray from the origin.
  const dot=(x*first[i]+y*first[i+1]+z*first[i+2])/(r0*r1);
  assert.ok(dot>.99,`displacement left the radial ray: dot=${dot}`);
 }
 assert.throws(()=>displacePositions(source,null),/must be an object|params/);
 assert.throws(()=>displacePositions(new Float32Array(4),{}),/xyz triples/);
 assert.throws(()=>displacePositions([0,1,0],{}),/Float32Array/);
});

test('displacement never mutates its input and welds duplicated seam vertices',()=>{
 const sphere=new THREE.SphereGeometry(1,12,8);
 const before=Float32Array.from(sphere.attributes.position.array);
 displace3D(sphere,{seed:7});
 assert.deepEqual(sphere.attributes.position.array,before);
 // SphereGeometry duplicates seam/column vertices; identical inputs must get
 // identical outputs or the surface tears.
 const out=displace3D(sphere,{seed:7}).attributes.position.array;
 const seen=new Map();
 for(let i=0;i<before.length;i+=3){
  const key=[before[i],before[i+1],before[i+2]].map(v=>v.toFixed(6)).join(',');
  const point=[out[i],out[i+1],out[i+2]].map(v=>v.toFixed(9)).join(',');
  if(seen.has(key))assert.equal(seen.get(key),point,`seam vertex ${key} displaced inconsistently`);
  else seen.set(key,point);
 }
});

test('displace3D: normals finite, unit, outward — and no NEW degeneracies',()=>{
 // "No degenerate or inverted normals": every normal finite and unit length;
 // on origin-centered convex forms the normal must point away from the
 // surface (positive dot with the radial direction). Torus is excluded — its
 // surface normal legitimately points inward near the ring axis.
 const radial=new THREE.Vector3(),n=new THREE.Vector3(),baseN=new THREE.Vector3();
 const check=(name,{radialOut=true}={})=>{
  const base=presetGeometry(name);
  base.computeVertexNormals(); // degeneracy reference — what the PRESET already ships
  const degenerate=new Set();
  for(let i=0;i<base.attributes.position.count;i++){
   baseN.fromBufferAttribute(base.attributes.normal,i);
   if(baseN.lengthSq()<1e-12)degenerate.add(i);
  }
  const g=displace3D(base,{seed:7});
  const pos=g.attributes.position,nor=g.attributes.normal;
  assert.ok(nor,`${name}: normal attribute present`);
  let newDegenerate=0;
  for(let i=0;i<pos.count;i++){
   n.fromBufferAttribute(nor,i);
   assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y)&&Number.isFinite(n.z),`${name}[${i}]: normal not finite`);
   if(n.lengthSq()<1e-12){
    newDegenerate+=degenerate.has(i)?0:1; // pre-existing preset artifact, e.g. blob poles
    continue;
   }
   assert.ok(Math.abs(n.length()-1)<1e-4,`${name}[${i}]: normal not unit length (${n.length()})`);
   if(radialOut){
    radial.fromBufferAttribute(pos,i).normalize();
    assert.ok(n.dot(radial)>0,`${name}[${i}]: normal inverted (dot=${n.dot(radial).toFixed(4)})`);
   }
  }
  assert.equal(newDegenerate,0,`${name}: displacement introduced ${newDegenerate} degenerate normal(s)`);
 };
 check('blob');
 check('ico');
 check('capsule');
 check('torus',{radialOut:false});
});

test('displaced clones own their userData — the preset cache stays pristine',()=>{
 // BufferGeometry.clone() shares userData by reference; the stamp must install
 // a fresh object per clone or the cache and sibling clones get polluted.
 const base=presetGeometry('ico');
 const a=displace3D(base,{seed:3}),b=displace3D(base,{seed:4});
 assert.equal(base.userData.bump3d,undefined,'displace3D stamped the shared preset cache');
 assert.notEqual(a.userData,b.userData);
 assert.equal(a.userData.bump3d.seed,3);
 assert.equal(b.userData.bump3d.seed,4);
});

test('different seeds deform the same base differently; same seed matches across call paths',()=>{
 const base=presetGeometry('ico');
 const a=displace3D(base,{seed:3}),b=displace3D(base,{seed:3}),c=displace3D(base,{seed:4});
 assert.deepEqual(Array.from(a.attributes.position.array),Array.from(b.attributes.position.array));
 assert.notDeepEqual(Array.from(a.attributes.position.array),Array.from(c.attributes.position.array));
 // The kit's async path stamps the SAME field: channel positions == direct positions.
 const source=base.attributes.position.array;
 assert.deepEqual(
  Array.from(displacePositions(source,{seed:3})),
  Array.from(a.attributes.position.array),
 );
 assert.equal(a.userData.bump3d.generator,'fbm3-displace3d');
 assert.equal(a.userData.bump3d.seed,3);
});

test('finishDisplaced rejects mismatched buffers',()=>{
 const base=presetGeometry('ico');
 assert.throws(()=>finishDisplaced(base,'not-an-array',{seed:1}),/Float32Array/);
 assert.throws(()=>finishDisplaced(base,new Float32Array(3),{seed:1}),/matching the source/);
});

// --- GLSL mirror parity -----------------------------------------------------

// The fragment tier must evaluate the SAME field as the geometry displacer.
// GLSL output cannot run in node, so the parity net is structural: every hash
// constant and shift in the JS hash must appear verbatim in the GLSL mirror,
// and the mirror must expose the functions the material injects.
test('FBM3_GLSL mirrors hash3u constants, shifts and lattice offset',()=>{
 const source=readFileSync(join(root,'src/splash/gen/bump3d.js'),'utf8');
 const body=source.slice(source.indexOf('export function hash3u'),source.indexOf('function corner'));
 const constants=[...body.matchAll(/0x[0-9A-F]{8}/g)].map(m=>m[0]);
 assert.ok(constants.length>=3,'expected the hash multipliers in hash3u');
 for(const c of constants)assert.ok(FBM3_GLSL.includes(c),`GLSL mirror missing hash constant ${c}`);
 for(const match of body.matchAll(/>>>\s*(\d+)/g)){
  const shift=Number(match[1]);
  // `>>>0` is JS's coerce-to-uint32 — meaningless in GLSL where uint is
  // already unsigned, so only the mixing shifts have mirrors.
  if(shift===0)continue;
  assert.ok(FBM3_GLSL.includes(`>>${shift}u`),`GLSL mirror missing shift >>${shift}u`);
 }
 assert.ok(FBM3_GLSL.includes('1048576'),'GLSL mirror missing the lattice offset');
});

test('FBM3_GLSL exposes the surface the bump material injects',()=>{
 assert.match(FBM3_GLSL,/uint splashHash\(uint a,uint b,uint c,uint seed\)/);
 assert.match(FBM3_GLSL,/float splashNoise\(vec3 p,uint seed\)/);
 assert.match(FBM3_GLSL,/float splashFbm\(vec3 p,float frequency,uint seed\)/);
 // The field defines are read inside the fBm loop; the SEED define is
 // consumed at the material's call site (asserted in the kit tests).
 for(const define of ['SPLASH_BUMP_OCTAVES','SPLASH_BUMP_LACUNARITY','SPLASH_BUMP_GAIN']){
  assert.ok(FBM3_GLSL.includes(define),`GLSL mirror never reads ${define}`);
 }
});

test('hash3u is well distributed enough for lattice noise',()=>{
 // Degenerate hashes (all zeros, or identical for neighbours) would flatten
 // the field into stripes. Cheap smoke over an 8×8×8 lattice block.
 const values=[];
 for(let x=0;x<8;x++)for(let y=0;y<8;y++)for(let z=0;z<8;z++){
  values.push(hash3u((x+1048576)>>>0,(y+1048576)>>>0,(z+1048576)>>>0,7)>>>8);
 }
 assert.equal(new Set(values).size,values.length,'hash collisions in an 8×8×8 lattice');
});
