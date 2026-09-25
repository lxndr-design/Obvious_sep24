import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {InstanceField} from '../src/splash/core/instance-field.js';
import {presetGeometry} from '../src/splash/presets.js';

const field=capacity=>new InstanceField(new THREE.Scene(),{capacity});
const matrixXY=(mesh,i)=>{
 const m=new THREE.Matrix4();
 mesh.getMatrixAt(i,m);
 return[m.elements[12],m.elements[13]];
};

test('one bucket per preset+material, sharing the preset geometry',()=>{
 const f=field();
 const a=f.acquire('blob');
 const b=f.acquire('blob'); // same bucket: blob+gloss
 f.acquire('blob',{material:'matte'});
 f.acquire('ico');
 assert.equal(f.bucketCount,3);
 const bucket=f.buckets.get('blob:gloss');
 assert.ok(bucket.mesh instanceof THREE.InstancedMesh);
 assert.equal(bucket.mesh.geometry,presetGeometry('blob'));
 assert.ok(bucket.mesh.instanceColor,'instanceColor buffer must exist');
 assert.equal(bucket.mesh.count,2);
 assert.equal(a.bucket,'blob:gloss');
 assert.equal(b.bucket,'blob:gloss');
});

test('released slots are reused while body ids stay unique',()=>{
 const f=field();
 const a=f.acquire('blob');
 const b=f.acquire('blob');
 assert.equal(f.used,2);
 assert.equal(f.release(a.id),true);
 assert.equal(f.used,1);
 const c=f.acquire('blob');
 assert.equal(c.slot,a.slot,'released slot must be reused by the pool');
 assert.notEqual(c.id,a.id,'body ids are protocol-level and never recycled');
 assert.equal(f.buckets.get('blob:gloss').mesh.count,2);
 assert.equal(f.release(999),false);
 assert.equal(f.release(b.id),true);
 assert.equal(f.release(c.id),true);
 assert.equal(f.used,0);
 assert.deepEqual(f.releaseAll(),[]);
});

test('capacity is a hard cap the kit can spend by preset mix',()=>{
 const f=field(8);
 const handles=Array.from({length:8},()=>f.acquire('blob'));
 assert.equal(f.used,8);
 assert.throws(()=>f.acquire('blob'),/cap/i);
 // Releasing one slot frees exactly one for any preset.
 f.release(handles[0].id);
 const extra=f.acquire('ico');
 assert.equal(extra.preset,'ico');
 assert.equal(f.used,8);
});

test('reusing a released slot resets its pose, not the previous matrix',()=>{
 const f=field();
 const a=f.acquire('blob');
 f.setPose(a,{position:[3,0,0],scale:2});
 f.sync();
 const bucket=f.buckets.get('blob:gloss');
 assert.deepEqual(matrixXY(bucket.mesh,0),[3,0]);
 f.release(a.id);
 const b=f.acquire('blob');
 assert.equal(b.slot,a.slot);
 f.sync();
 assert.deepEqual(matrixXY(bucket.mesh,0),[0,0],'reused slot must render with its fresh default pose');
});

test('applyPoses skips sleeping bodies; sync only touches dirty buckets',()=>{
 const f=field();
 const a=f.acquire('blob');
 const b=f.acquire('blob');
 f.sync(); // initial poses land
 const bucket=f.buckets.get('blob:gloss');
 const before=bucket.mesh.instanceMatrix.version;
 const positions=new Float32Array([9,9,9, 1,2,3]);
 const quats=new Float32Array([0,0,0,1, 0,0,0,1]);
 const sleep=new Uint8Array([1,0]); // a asleep, b awake
 f.applyPoses({count:2,ids:[a.id,b.id],positions,quaternions:quats,sleep});
 assert.equal(bucket.dirtyIds.has(a.id),false,'sleeping body must not be queued for rewrite');
 assert.equal(bucket.dirtyIds.has(b.id),true);
 f.sync();
 assert.equal(bucket.mesh.instanceMatrix.version,before+1,'one bump for the dirty bucket');
 assert.deepEqual(matrixXY(bucket.mesh,0),[0,0],'sleeping body keeps its settled matrix');
 assert.deepEqual(matrixXY(bucket.mesh,1),[1,2]);
});

test('unknown ids in a pose frame are ignored',()=>{
 const f=field();
 const a=f.acquire('blob');
 f.sync(); // drain the initial dirty flag
 f.applyPoses({count:1,ids:[42],positions:new Float32Array(3),quaternions:new Float32Array(4),sleep:new Uint8Array(0)});
 assert.equal(f.buckets.get('blob:gloss').dirtyIds.size,0);
 f.applyPoses({count:1,ids:[a.id],positions:new Float32Array([1,1,1]),quaternions:new Float32Array(4),sleep:new Uint8Array(0)});
 assert.deepEqual([...f.buckets.get('blob:gloss').dirtyIds],[a.id]);
});

test('dispose clears buckets and rejects further work',()=>{
 const f=field();
 const a=f.acquire('blob');
 f.dispose();
 assert.equal(f.bucketCount,0);
 assert.throws(()=>f.acquire('blob'),/dispose/);
 assert.equal(f.release(a.id),false);
});

test('cullOldest sheds the oldest bodies (ascending id) and skips a protected id',()=>{
 const f=field(16);
 const handles=Array.from({length:5},()=>f.acquire('blob'));
 assert.deepEqual(f.cullOldest(0),[]);
 assert.deepEqual(f.cullOldest(-1),[]);
 const culled=f.cullOldest(2);
 assert.deepEqual(culled,[handles[0].id,handles[1].id],'spawn order is id order');
 assert.equal(f.used,3);
 // The protected id survives even if it is oldest.
 const culled2=f.cullOldest(2,{keep:handles[2].id});
 assert.deepEqual(culled2,[handles[3].id,handles[4].id]);
 assert.equal(f.used,1);
 assert.ok(f.handles.has(handles[2].id));
 // Culling more than exists sheds everything live except the protected one.
 assert.deepEqual(f.cullOldest(10,{keep:handles[2].id}),[]);
 assert.equal(f.used,1);
 assert.equal(f.cullOldest(10).length,1); // now nothing is protected
 assert.equal(f.used,0);
});

test('interpolation: sync blends between previous and current pose at the frame alpha',()=>{
 const f=field(4);
 const h=f.acquire('blob');
 f.setPose(h,{position:[0,0,0]});
 f.sync();
 f.setInterpolation(true);
 const bucket=f.buckets.get('blob:gloss');
 // First pose: prev is the enable snapshot [0,0,0], cur moves to [2,0,0] —
 // alpha .5 lands halfway between them.
 f.applyPoses({count:1,ids:[h.id],positions:new Float32Array([2,0,0]),quaternions:new Float32Array([0,0,0,1]),sleep:new Uint8Array([0])});
 f.interpolation.alpha=.5;
 f.sync();
 const mid=matrixXY(bucket.mesh,h.slot);
 assert.ok(Math.abs(mid[0]-1)<1e-6,`expected the enable->pose midpoint x=1, got ${mid[0]}`);
 // Second pose moves cur to x=4; prev was x=2 — alpha .5 lands at x=3.
 f.applyPoses({count:1,ids:[h.id],positions:new Float32Array([4,0,0]),quaternions:new Float32Array([0,0,0,1]),sleep:new Uint8Array([0])});
 f.sync();
 const blended=matrixXY(bucket.mesh,h.slot);
 assert.ok(Math.abs(blended[0]-3)<1e-6,`expected x=3 at alpha .5, got ${blended[0]}`);
 // Alpha 1 snaps to the current pose.
 f.interpolation.alpha=1;
 f.sync();
 assert.deepEqual(matrixXY(bucket.mesh,h.slot),[4,0]);
});

test('interpolation skips settled bodies — no matrix writes, no version bump',()=>{
 const f=field(4);
 const h=f.acquire('blob');
 f.setPose(h,{position:[0,0,0]});
 f.sync();
 f.setInterpolation(true);
 f.applyPoses({count:1,ids:[h.id],positions:new Float32Array([1,0,0]),quaternions:new Float32Array([0,0,0,1]),sleep:new Uint8Array([1])});
 f.sync(); // settles the body with its final matrix
 const bucket=f.buckets.get('blob:gloss');
 const version=bucket.mesh.instanceMatrix.version;
 for(let i=0;i<3;i++)f.sync(); // frames with nothing awake
 assert.equal(bucket.mesh.instanceMatrix.version,version,'sleeping bodies must not rewrite matrices');
});
