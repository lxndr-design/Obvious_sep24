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
