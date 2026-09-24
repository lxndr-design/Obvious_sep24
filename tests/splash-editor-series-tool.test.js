import test from 'node:test';
import assert from 'node:assert/strict';
import {BannerConfig} from '../src/splash/banner-config.js';
import {createSeriesTool} from '../src/splash/editor/series-tool.js';

// The generator controller against a recording kit. The injected scheduler is
// a manual queue: tests flush it explicitly, so coalescing is observable.

function mockKit(){
 const calls=[];
 const kit={
  banner:new BannerConfig(),
  despawn(arg){calls.push(['despawn',arg]);return Array.isArray(arg)?arg.length:1;},
  spawnSeries(params){calls.push(['spawnSeries',params]);return[{id:1},{id:2}];},
  fillGrid(params){calls.push(['fillGrid',params]);return[{id:3}];},
 };
 return{kit,calls};
}

function manualSchedule(){
 const queue=[];
 const schedule=fn=>queue.push(fn);
 return{schedule,flush(){while(queue.length)queue.shift()();}};
}

test('regen spawns the series from banner state',()=>{
 const {kit,calls}=mockKit();
 const {schedule,flush}=manualSchedule();
 const tool=createSeriesTool(kit,{schedule});
 tool.requestRegen();
 flush();
 assert.equal(calls[0][0],'spawnSeries');
 assert.equal(tool.handles.length,2,'handles recorded from the spawn return');
 assert.deepEqual(calls[0][1],{
  preset:'blob',material:'gloss',color:'#7fd4ff',behavior:null,
  count:24,shape:'arc',spacing:1.2,base:1,
  amplitude:.4,frequency:1,phase:0,
  volatility:.15,seed:7,
 });
});

test('banner patches coalesce into one regen per flush',()=>{
 const {kit,calls}=mockKit();
 const {schedule,flush}=manualSchedule();
 const tool=createSeriesTool(kit,{schedule});
 tool.requestRegen();
 flush();
 assert.equal(calls.filter(c=>c[0]==='spawnSeries').length,1);
 kit.banner.patch({count:48});
 kit.banner.patch({base:2});
 kit.banner.patch({volatility:.3}); // same frame — all fold into one regen
 flush();
 flush(); // a second flush must not re-run anything
 assert.equal(calls.filter(c=>c[0]==='spawnSeries').length,2);
});

test('regen diffs: one batched despawn of the previous handles, then the spawn',()=>{
 const {kit,calls}=mockKit();
 const {schedule,flush}=manualSchedule();
 const tool=createSeriesTool(kit,{schedule});
 tool.requestRegen();
 flush();
 const first=tool.handles;
 kit.banner.patch({count:10});
 flush();
 const kinds=calls.map(c=>c[0]).filter(k=>k==='despawn'||k==='spawnSeries');
 assert.deepEqual(kinds,['spawnSeries','despawn','spawnSeries']);
 assert.deepEqual(calls[1][1],first,'the whole previous batch goes in one despawn');
});

test('array mode calls fillGrid with the tool locals',()=>{
 const {kit,calls}=mockKit();
 const {schedule,flush}=manualSchedule();
 const tool=createSeriesTool(kit,{schedule});
 tool.setMode('array');
 flush();
 assert.equal(calls.filter(c=>c[0]==='fillGrid').length,1);
 const params=calls.find(c=>c[0]==='fillGrid')[1];
 assert.deepEqual(
  {cols:params.cols,rows:params.rows,jitter:params.jitter,scale:params.scale},
  {cols:6,rows:6,jitter:0,scale:1},
 );
 tool.tool.cols=8;
 tool.requestRegen();
 flush();
 assert.equal(calls.filter(c=>c[0]==='fillGrid').length,2);
 assert.equal(calls.filter(c=>c[0]==='fillGrid'&&c[1].cols===8).length,1);
});

test('setMode to the same mode does not regen',()=>{
 const {kit,calls}=mockKit();
 const {schedule,flush}=manualSchedule();
 const tool=createSeriesTool(kit,{schedule});
 tool.requestRegen();
 flush();
 tool.setMode('series');
 flush();
 assert.equal(calls.filter(c=>c[0]==='spawnSeries'||c[0]==='fillGrid').length,1);
});

test('clear empties the stage and cancels a pending regen',()=>{
 const {kit,calls}=mockKit();
 const {schedule,flush}=manualSchedule();
 const tool=createSeriesTool(kit,{schedule});
 tool.requestRegen();
 flush();
 kit.banner.patch({count:12}); // pending…
 tool.clear();
 flush(); // the pending regen must not resurrect the arrangement
 assert.deepEqual(calls.filter(c=>c[0]==='despawn').pop(),['despawn','all']);
 assert.equal(calls.filter(c=>c[0]==='spawnSeries').length,1);
 assert.equal(tool.handles.length,0);
});

test('dispose unsubscribes banner patches',()=>{
 const {kit,calls}=mockKit();
 const {schedule,flush}=manualSchedule();
 const tool=createSeriesTool(kit,{schedule});
 tool.requestRegen();
 flush();
 tool.dispose();
 kit.banner.patch({count:99});
 flush();
 assert.equal(calls.filter(c=>c[0]==='spawnSeries').length,1);
});
