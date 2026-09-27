import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_TYPES,catalogLayout,catalogName} from '../src/catalog-layout.js';
import {HOUSEHOLD_LABELS} from '../src/household.js';
import {LABELS} from '../src/shapes.js';
test('catalog has all canonical designs at each size without duplicate legacy sizes',()=>{
 const types=Object.keys(LABELS).filter(t=>t!=='grandma'&&t!=='photo-object'&&!/^plant-.*-(small|large)$/.test(t)&&!/^table-.*-half$/.test(t)); // photo objects are user-created, never catalog templates
 assert.deepEqual(new Set(CATALOG_TYPES),new Set([...types,'pool']));
 const cells=catalogLayout();assert.equal(cells.length,CATALOG_TYPES.length*3);
 for(const type of CATALOG_TYPES)assert.deepEqual(cells.filter(c=>c.type===type).map(c=>c.size),[1,2,3]);
});
test('every catalog footprint is on the unit grid with at least one empty tile between objects',()=>{
 const cells=catalogLayout();
 for(const a of cells){assert.equal(a.x0%1,0);assert.equal(a.z0%1,0);
  for(const b of cells){if(a===b)continue;const dx=Math.max(a.x0-b.x0-b.size,b.x0-a.x0-a.size),dz=Math.max(a.z0-b.z0-b.size,b.z0-a.z0-a.size);assert.ok(dx>=1||dz>=1,`${a.type}/${a.size} overlaps ${b.type}/${b.size}`);}
 }
});
test('the twelve household models are catalog designs with picker labels',()=>{
 assert.equal(Object.keys(HOUSEHOLD_LABELS).length,12);
 for(const [type,label] of Object.entries(HOUSEHOLD_LABELS)){
  assert.ok(CATALOG_TYPES.includes(type),type);
  assert.equal(LABELS[type],label);
  assert.equal(catalogName(type),label);
 }
});
