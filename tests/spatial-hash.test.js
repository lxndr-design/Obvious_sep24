import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialHash} from '../src/spatial-hash.js';

function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

test('near finds every object covering the query cells, exactly once',()=>{
 const hash=new SpatialHash(1),a={id:'a'},b={id:'b'};
 hash.index(a,.5,.5,1.5,1.5); // spans cells (0,0)..(1,1)
 hash.index(b,2.25,2.25,2.75,2.75);
 const out=hash.near(0,0,3,3,[]);
 assert.deepEqual([...out].sort((x,y)=>x.id<y.id?-1:1),[a,b]); // dedup across cells
 // near() is cell-granular and conservative: this window shares cell 1 with a
 // and cell 2 with b, so both are legitimate candidates even though the rects
 // do not overlap. The exact bounds filter in the caller restores precision.
 assert.equal(hash.near(1.6,1.6,2.2,2.2,[]).length,2);
 assert.equal(hash.near(-9,-9,-3,-3,[]).length,0);
 assert.equal(hash.count,2);
});

test('reindex moves coverage: the old cells stop answering, the new ones start',()=>{
 const hash=new SpatialHash(1),a={id:'a'};
 hash.index(a,0,0,1,1);
 assert.equal(hash.near(0,0,1,1,[]).length,1);
 hash.index(a,5,5,6,6);
 assert.equal(hash.near(0,0,1,1,[]).length,0);
 assert.equal(hash.near(5,5,6,6,[]).length,1);
 // Identical coverage re-index is a no-op, not a duplicate.
 hash.index(a,5,5,6,6);
 assert.equal(hash.near(5,5,6,6,[]).length,1);
 assert.equal(hash.count,1);
});

test('removed objects leave no trace and pooled cell lists come back clean',()=>{
 const hash=new SpatialHash(1),a={id:'a'},b={id:'b'};
 hash.index(a,0,0,1,1);
 hash.index(b,3,3,4,4);
 hash.remove(a);
 assert.equal(hash.near(0,0,1,1,[]).length,0);
 assert.equal(hash.count,1);
 // b reuses pooled structures; nothing from a may leak into it.
 hash.remove(b);
 hash.index(a,0,0,1,1);
 hash.index(b,0.5,0.5,1.5,1.5);
 const out=hash.near(0,0,2,2,[]);
 assert.equal(out.length,2);
 assert.equal(hash.count,2);
 hash.clear();
 assert.equal(hash.count,0);
 assert.equal(hash.near(0,0,100,100,[]).length,0);
});

test('randomized coverage stays a sound superset of a naive rectangle scan',()=>{
 const random=mulberry32(20260924),hash=new SpatialHash(1),objects=[];
 for(let i=0;i<200;i++){
  const o={id:i},big=random()<.1,size=big?1+random()*5:.05+random()*1.5,x=random()*40-20,z=random()*40-20;
  o.minX=x;o.minZ=z;o.maxX=x+size;o.maxZ=z+size;
  hash.index(o,o.minX,o.minZ,o.maxX,o.maxZ);objects.push(o);
 }
 for(let q=0;q<400;q++){
  const size=random()<.9?1+random()*3:8+random()*12,x=random()*44-22,z=random()*44-22,qBox={minX:x,minZ:z,maxX:x+size,maxZ:z+size};
  const hits=hash.near(qBox.minX,qBox.minZ,qBox.maxX,qBox.maxZ,[]),found=new Set(hits);
  for(const o of objects){
   const overlaps=!(o.maxX<qBox.minX||o.minX>qBox.maxX||o.maxZ<qBox.minZ||o.minZ>qBox.maxZ);
   if(overlaps)assert.ok(found.has(o),`missed object ${o.id} at [${o.minX},${o.maxX}]x[${o.minZ},${o.maxZ}]`);
   else{ // a returned candidate must share a cell with the query window —
    // mirror the hash's own floor arithmetic; non-returned objects are unconstrained
    const near=!(Math.floor(o.maxX)<Math.floor(qBox.minX)||Math.floor(o.minX)>Math.floor(qBox.maxX)||Math.floor(o.maxZ)<Math.floor(qBox.minZ)||Math.floor(o.minZ)>Math.floor(qBox.maxZ));
    assert.ok(!found.has(o)||near,`object ${o.id} leaked beyond cell granularity`);
   }
  }
 }
});

test('negative coordinates and cell boundaries are handled without collisions',()=>{
 const hash=new SpatialHash(1),west={id:'w'},east={id:'e'},edge={id:'e2'};
 hash.index(west,-2.5,-2.5,-1.5,-1.5);
 hash.index(east,1.5,1.5,2.5,2.5);
 hash.index(edge,-0.001,-0.001,0.001,0.001); // touches four cells around the origin
 assert.equal(hash.near(-3,-3,0,0,[]).length,2); // west + edge
 assert.equal(hash.near(0,0,3,3,[]).length,2); // east + edge
 assert.equal(hash.near(-1,-1,1,1,[]).length,2); // edge shares cells with both; west's cells stop at -2
});
