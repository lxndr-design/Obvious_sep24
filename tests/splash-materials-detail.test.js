import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaterial,setBumpDetailEnabled} from '../src/splash/materials/index.js';
import {resolveBumpParams} from '../src/splash/gen/bump3d.js';

// Governor tier 4's lever: the fragment fBm taps compile out via the
// SPLASH_BUMP_DETAIL define. Toggling must flip the define and recompile.

test('setBumpDetailEnabled flips the fragment-detail define and flags recompile',()=>{
 const cfg=resolveBumpParams({seed:7});
 const mat=createMaterial('bump',cfg);
 assert.equal(mat.defines.SPLASH_BUMP_DETAIL,'1'); // detail is the default tier
 const baseVersion=mat.version;
 setBumpDetailEnabled(mat,false);
 assert.equal(mat.defines.SPLASH_BUMP_DETAIL,'0');
 assert.ok(mat.version>baseVersion,'the shader must recompile without the define');
 const nextVersion=mat.version;
 setBumpDetailEnabled(mat,true);
 assert.equal(mat.defines.SPLASH_BUMP_DETAIL,'1');
 assert.ok(mat.version>nextVersion);
});

test('setBumpDetailEnabled rejects materials without the bump contract',()=>{
 assert.throws(()=>setBumpDetailEnabled(createMaterial('gloss'),false),/bump/);
 assert.throws(()=>setBumpDetailEnabled({},false),/bump/);
});
