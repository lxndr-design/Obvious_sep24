import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import viteConfig from '../vite.config.js';
import * as THREE from 'three';
import {createBootSequence} from '../src/splash/boot.js';
import {createSplashScene,SPLASH_BACKGROUND} from '../src/splash/scene.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=(...parts)=>readFileSync(resolve(root,...parts),'utf8');

test('vite build declares both HTML entries and both files exist',()=>{
 const input=viteConfig.build.rollupOptions.input;
 assert.deepEqual(Object.keys(input).sort(),['main','splash']);
 assert.ok(input.main.endsWith('index.html'));
 assert.ok(input.splash.endsWith('splash.html'));
 for(const file of Object.values(input))assert.equal(existsSync(file),true,`${file} missing`);
});

test('splash.html wires the splash entry and never references app glue',()=>{
 const html=read('splash.html');
 assert.match(html,/src="\/src\/splash-entry\.js"/);
 assert.doesNotMatch(html,/style\.css/);
 assert.doesNotMatch(html,/src\/main\.js/);
});

test('splash entry owns its CSS, boots SplashKit, and never imports app glue',()=>{
 const entry=read('src','splash-entry.js');
 assert.match(entry,/import '\.\/splash\.css';/);
 assert.match(entry,/createSplashKit/);
 assert.match(entry,/window\.splashkit/); // distinct global — whitewater is taken
 assert.doesNotMatch(entry,/rapier3d|@dimforge/i); // main thread never imports Rapier
 assert.doesNotMatch(entry,/import ['"]\.\/style\.css/);
 assert.doesNotMatch(entry,/import ['"]\.\/main\.js/);
 assert.doesNotMatch(entry,/import ['"]\.\/entry\.js/);
});

test('index.html keeps the birdbath entry and only gains the splash cross-link',()=>{
 const html=read('index.html');
 assert.match(html,/src="\/src\/entry\.js"/);
 assert.match(html,/\?catalog=1/);
 assert.match(html,/href="\.\/splash\.html"/);
});

test('boot milestones complete only when every step is marked',()=>{
 const boot=createBootSequence([{id:'a',label:'A'},{id:'b',label:'B'}]);
 assert.equal(boot.isComplete(),false);
 boot.mark('a');
 assert.deepEqual(boot.items().map(i=>i.done),[true,false]);
 assert.equal(boot.isComplete(),false);
 boot.mark('b');
 assert.equal(boot.isComplete(),true);
 assert.throws(()=>boot.mark('nope'),/Unknown boot milestone/);
});

test('splash scene is a dark empty shell with a camera and lights',()=>{
 const {scene,camera}=createSplashScene();
 assert.ok(scene.background instanceof THREE.Color);
 assert.equal(scene.background.getHexString(),SPLASH_BACKGROUND.slice(1));
 assert.ok(camera instanceof THREE.PerspectiveCamera);
 assert.ok(scene.children.length>=2);
 assert.ok(scene.children.every(o=>o.isLight));
});
