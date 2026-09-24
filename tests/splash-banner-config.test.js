import test from 'node:test';
import assert from 'node:assert/strict';
import {BannerConfig,BANNER_DEFAULTS} from '../src/splash/banner-config.js';

test('banner config starts from defaults and patches live',()=>{
 const banner=new BannerConfig();
 assert.equal(banner.get('preset'),'blob');
 assert.equal(banner.get('behavior'),null); // null = presets keep their own behavior
 banner.patch({base:99,volatility:-2,count:100.4});
 assert.equal(banner.get('base'),4);
 assert.equal(banner.get('volatility'),0);
 assert.equal(banner.get('count'),100); // clamped then rounded to an integer
 banner.patch({preset:'torus',material:'iridescent',color:'#ff00aa',shape:'ring'});
 assert.equal(banner.get('preset'),'torus');
 assert.equal(banner.get('material'),'iridescent');
 assert.equal(banner.get('color'),'#ff00aa');
});

test('banner config rejects unknown keys and bad values',()=>{
 const banner=new BannerConfig();
 assert.throws(()=>banner.patch({nope:1}),/Unknown banner key/);
 assert.throws(()=>banner.patch({preset:'wedge'}),/must be one of/);
 assert.throws(()=>banner.patch({material:'chrome'}),/must be one of/);
 assert.throws(()=>banner.patch({shape:'zigzag'}),/must be one of/);
 assert.throws(()=>banner.patch({color:'red'}),/hex/);
 assert.throws(()=>banner.patch({seed:-1}),/non-negative/);
 assert.throws(()=>banner.patch({base:'way'}),/number/);
 assert.throws(()=>banner.patch({behavior:'yank'}),/behavior/);
 assert.throws(()=>banner.patch(null),/expects an object/);
});

test('banner config notifies subscribers with changed keys only',()=>{
 const banner=new BannerConfig();
 const seen=[];
 const off=banner.subscribe((values,changed)=>seen.push(changed));
 banner.patch({base:2});
 banner.patch({base:2}); // no change — no notification
 off();
 banner.patch({base:3});
 assert.deepEqual(seen,[['base']]);
});

test('initial config is validated, not trusted',()=>{
 assert.throws(()=>new BannerConfig({frequency:'fast'}),/number/);
 const banner=new BannerConfig({amplitude:5});
 assert.equal(banner.get('amplitude'),2);
 assert.deepEqual(banner.all(),{...BANNER_DEFAULTS,amplitude:2});
});
