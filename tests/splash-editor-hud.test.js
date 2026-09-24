import test from 'node:test';
import assert from 'node:assert/strict';
import {formatStats} from '../src/splash/editor/hud.js';

test('formatStats renders every metric the kit reports',()=>{
 const lines=formatStats({
  fps:60,drawCalls:5,instances:20000,batches:3,queued:0,bumpTransport:'worker',tier:2,
 });
 assert.deepEqual(lines,[
  'FPS 60',
  'Draw calls 5',
  'Instances 20,000',
  'Batches 3',
  'Queue 0',
  'Bump worker',
  'Tier 2',
 ]);
});

test('formatStats shows dashes for absent metrics — never invented values',()=>{
 const lines=formatStats(null);
 assert.deepEqual(lines,[
  'FPS —',
  'Draw calls —',
  'Instances 0', // zero instances is real data, not a missing metric
  'Batches —',
  'Queue —',
  'Bump —',
  'Tier —', // the governor has not published a tier yet
 ]);
});

test('the tier line accepts either key the governor might publish',()=>{
 assert.equal(formatStats({governorTier:1}).at(-1),'Tier 1');
 assert.equal(formatStats({tier:3,fps:52}).at(-1),'Tier 3');
 assert.equal(formatStats({tier:null}).at(-1),'Tier —');
});
