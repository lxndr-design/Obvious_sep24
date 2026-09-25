import test from 'node:test';
import assert from 'node:assert/strict';
import {mulberry32,sineSeries,layoutPositions,applyJitter,LAYOUT_SHAPES} from '../src/splash/gen/series.js';

test('mulberry32 is deterministic and uniform-ish',()=>{
 const a=mulberry32(42),b=mulberry32(42);
 for(let i=0;i<16;i++)assert.equal(a(),b());
 const rng=mulberry32(1);
 for(let i=0;i<100;i++){
  const v=rng();
  assert.ok(v>=0&&v<1,`random out of range: ${v}`);
 }
});

test('sineSeries is deterministic per seed',()=>{
 const a=sineSeries({count:8,seed:7}),b=sineSeries({count:8,seed:7});
 assert.deepEqual(a,b);
 assert.notDeepEqual(sineSeries({count:8,seed:8}),a);
});

test('sineSeries never collapses to zero scale',()=>{
 const cases=[
  {count:64,base:-5,amplitude:0,volatility:1,seed:3},
  {count:64,base:.05,amplitude:2,frequency:3,volatility:1,seed:99},
  {count:64,base:.2,amplitude:0,volatility:1,seed:123},
 ];
 for(const params of cases){
  for(const item of sineSeries(params)){
   assert.ok(item.scale>=.05,`scale ${item.scale} fell below the floor`);
  }
 }
});

test('sineSeries shape: length, x spacing, seedPhase range',()=>{
 const s=sineSeries({count:5,spacing:2,seed:1});
 assert.equal(s.length,5);
 s.forEach((item,i)=>assert.equal(item.x,i*2));
 for(const item of s)assert.ok(item.seedPhase>=0&&item.seedPhase<Math.PI*2);
});

test('layouts: grid counts, ring closes, arc is centered',()=>{
 assert.deepEqual(LAYOUT_SHAPES,['row','grid','ring','arc']);
 const grid=layoutPositions({shape:'grid',count:12,cols:4,spacing:1});
 assert.equal(grid.length,12);
 assert.deepEqual([grid[0].x,grid[0].z],[0,0]);
 assert.deepEqual([grid[4].x,grid[4].z],[0,1]);
 const ring=layoutPositions({shape:'ring',count:16,spacing:1});
 const step=Math.hypot(ring[1].x-ring[0].x,ring[1].z-ring[0].z);
 assert.ok(Math.abs(step-1)<.02,`ring step ${step} should trace one spacing along the circle`);
 const arc=layoutPositions({shape:'arc',count:7,spacing:1});
 assert.equal(arc.length,7);
 assert.ok(Math.abs(arc[3].x)<1e-9,'arc midpoint sits on the axis');
});

test('applyJitter is seeded and centered',()=>{
 const base=layoutPositions({count:9,spacing:1});
 const j=applyJitter(base,{jitter:.5,seed:5});
 assert.deepEqual(applyJitter(base,{jitter:.5,seed:5}),j);
 for(let i=0;i<9;i++)assert.ok(Math.abs(j[i].x-base[i].x)<=.5+1e-9);
 assert.deepEqual(applyJitter(base,{jitter:0,seed:5}),base.map(p=>({x:p.x,y:p.y,z:p.z})));
});
