import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSplashKit} from '../src/splash/splashkit.js';

// Full SplashKit drive with a fake renderer — proves the whole main-thread
// stack (kit → field → engine) works headless and sends protocol-valid sims.
function fakeRenderer(){
 const calls={loops:[],disposed:false};
 return{
  calls,
  setPixelRatio(){},
  setSize(){},
  setAnimationLoop(cb){calls.loops.push(cb);},
  render(){},
  dispose(){calls.disposed=true;},
  info:{render:{calls:3}},
 };
}
function kitDriven(extra={}){
 return createSplashKit(undefined,{
  rendererFactory:()=>fakeRenderer(),
  capacity:64,
  ...extra,
 });
}
const matrixAt=(mesh,i)=>{
 const m=new THREE.Matrix4();
 mesh.getMatrixAt(i,m);
 return[m.elements[12],m.elements[13],m.elements[14]];
};

test('createSplashKit boots engine, field and banner; no sim messages without spawns',()=>{
 const kit=kitDriven();
 assert.ok(kit.banner,'banner config present');
 assert.equal(kit.sim.pending(),0);
 const s=kit.stats();
 assert.equal(s.instances,0);
 assert.equal(s.drawCalls,3);
 kit.dispose();
});

test('spawn creates one pooled handle and one batched spawn message',()=>{
 const kit=kitDriven();
 const a=kit.spawn('ico',{color:'#112233'});
 const b=kit.spawn('ico',{color:'#112233'}); // same bucket
 assert.equal(a.preset,'ico');
 assert.equal(a.material,'gloss');
 assert.equal(typeof a.id,'number');
 assert.deepEqual(kit.sim.messages().filter(m=>m.type==='spawn').map(m=>m.bodies.length),[1,1]);
 assert.notEqual(b.id,a.id);
 assert.equal(kit.despawn(a.id),true);
 const c=kit.spawn('ico',{color:'#112233'});
 assert.equal(c.slot,a.slot,'pool reuses the freed slot');
 assert.notEqual(c.id,a.id,'body ids are never recycled');
 kit.dispose();
});

test('spawnSeries batches once and honors count deterministically',()=>{
 const kit=kitDriven();
 const first=kit.spawnSeries({count:7,shape:'arc',seed:3});
 assert.equal(first.length,7);
 assert.equal(kit.sim.messages().filter(m=>m.type==='spawn').length,1);
 const ids=first.map(h=>h.id);
 assert.equal(new Set(ids).size,7,'handles must be unique');
 kit.dispose();
});

test('fillGrid supports grid, ring and row layouts in one batch',()=>{
 const kit=kitDriven();
 assert.equal(kit.fillGrid({shape:'grid',cols:4,rows:3}).length,12);
 assert.equal(kit.fillGrid({shape:'ring',count:10}).length,10);
 assert.equal(kit.fillGrid({shape:'row',count:5}).length,5);
 const spawns=kit.sim.messages().filter(m=>m.type==='spawn');
 assert.equal(spawns.length,3,'one spawn message per fill call');
 kit.dispose();
});

test('despawn(all) empties the pool and sends one message',()=>{
 const kit=kitDriven();
 kit.fillGrid({shape:'grid',cols:3,rows:2});
 assert.equal(kit.despawn('all'),6);
 assert.equal(kit.stats().instances,0);
 const despawns=kit.sim.messages().filter(m=>m.type==='despawn');
 assert.equal(despawns.length,1);
 assert.equal(despawns[0].ids.length,6);
 kit.dispose();
});

test('pointer and shockwave forward as protocol messages',()=>{
 const kit=kitDriven();
 kit.setPointer('attract',2,9);
 kit.shockwave([1,2,3],.5);
 const msgs=kit.sim.messages();
 assert.deepEqual(msgs.at(-2),{type:'pointer',mode:'attract',p:[0,0,0],strength:2,radius:9});
 assert.deepEqual(msgs.at(-1),{type:'impulse',kind:'radial',p:[1,2,3],strength:.5,radius:8});
 kit.dispose();
});

test('drag and dragRelease forward as protocol messages',()=>{
 const kit=kitDriven();
 kit.drag(7,[1,2,3]);
 kit.dragRelease(7,[.1,.2,.3]);
 kit.dragRelease(7); // release without a throw velocity is schema-valid
 const msgs=kit.sim.messages();
 assert.deepEqual(msgs.at(-3),{type:'drag',id:7,p:[1,2,3]});
 assert.deepEqual(msgs.at(-2),{type:'dragRelease',id:7,v:[.1,.2,.3]});
 assert.deepEqual(msgs.at(-1),{type:'dragRelease',id:7});
 kit.dispose();
});

test('screenToPlane maps the screen center to the scene center on the banner plane',()=>{
 const kit=kitDriven();
 kit.engine.camera.updateMatrixWorld(true); // project() reads matrixWorldInverse
 const p=kit.screenToPlane(0,0);
 assert.ok(p,'the center ray must reach the banner plane');
 assert.ok(Math.abs(p[0])<1e-6&&Math.abs(p[1])<1e-6&&Math.abs(p[2])<1e-6,`center must map to the origin, got ${p}`);
 // A `through` point re-anchors the plane (the drag/drop flavor): the picked
 // point, projected to ndc, must map back to itself through its own plane.
 const through=[0,0,2];
 const pNdc=new THREE.Vector3(...through).project(kit.engine.camera);
 const back=kit.screenToPlane(pNdc.x,pNdc.y,through);
 assert.ok(back&&back.every((v,i)=>Math.abs(v-through[i])<1e-6),`the drag plane through a point must map that point back, got ${back}`);
 kit.dispose();
});

test('pickBody returns the pooled handle under the cursor and null on empty space',()=>{
 const kit=kitDriven();
 const h=kit.spawn('blob',{position:[0,2,0]});
 // Instance matrices come from applied pose frames — feed one so the raycast
 // sees the body where it was spawned, exactly as after a real worker frame.
 kit.applyPoses({count:1,ids:[h.id],positions:new Float32Array([0,2,0]),quaternions:new Float32Array([0,0,0,1]),sleep:new Uint8Array([0])});
 const cam=kit.engine.camera;
 cam.updateMatrixWorld(true);
 const ndc=new THREE.Vector3(0,2,0).project(cam);
 const picked=kit.pickBody(ndc.x,ndc.y);
 assert.ok(picked,`the body under its own projection must be picked (ndc ${ndc.x.toFixed(3)},${ndc.y.toFixed(3)})`);
 assert.equal(picked.id,h.id);
 assert.equal(kit.pickBody(.98,-.98),null,'empty space picks nothing');
 kit.despawn(h.id);
 assert.equal(kit.pickBody(ndc.x,ndc.y),null,'a released body is no longer pickable');
 kit.dispose();
});

test('banner config patches flow into later spawns',()=>{
 const kit=kitDriven();
 kit.banner.patch({preset:'torus',material:'matte',color:'#abcdef'});
 const h=kit.spawn();
 assert.deepEqual([h.preset,h.material,h.color],['torus','matte','#abcdef']);
 kit.dispose();
});

test('applyPoses feeds the instance field end to end',()=>{
 const kit=kitDriven();
 const h=kit.spawn('blob');
 kit.field.sync(); // initial pose lands
 const bucket=kit.field.buckets.get('blob:gloss');
 const before=bucket.mesh.instanceMatrix.version;
 kit.applyPoses({count:1,ids:[h.id],positions:new Float32Array([0,5,0]),quaternions:new Float32Array([0,0,0,1]),sleep:new Uint8Array(0)});
 assert.equal(bucket.dirtyIds.has(h.id),true,'pose frame must queue the body for a rewrite');
 kit.field.sync(); // written on the next sync
 assert.equal(bucket.mesh.instanceMatrix.version,before+1);
 assert.deepEqual(matrixAt(bucket.mesh,0),[0,5,0]);
 kit.dispose();
});

test('dispose shuts everything down',()=>{
 const kit=kitDriven();
 kit.spawn('blob');
 kit.dispose();
 assert.equal(kit.sim.pending(),0);
 assert.throws(()=>kit.spawn('blob'),/dispose/);
});

test('despawn accepts a batch and emits one protocol message',()=>{
 const kit=kitDriven();
 const a=kit.spawn('ico',{color:'#112233'});
 const b=kit.spawn('ico',{color:'#112233'});
 const despawns=()=>kit.sim.messages().filter(m=>m.type==='despawn');
 assert.equal(kit.despawn([a,b]),2);
 assert.equal(despawns().length,1,'a batch replaces an arrangement with one message, not one per body');
 assert.deepEqual(despawns()[0].ids,[a.id,b.id]);
 assert.equal(kit.despawn([{id:99999}]),0,'unknown ids are skipped');
 assert.equal(despawns().length,1,'a no-op batch must not emit an empty message');
 kit.dispose();
});

test('kit exposes the engine camera for screen→world projection',()=>{
 const kit=kitDriven();
 assert.ok(kit.camera instanceof THREE.PerspectiveCamera);
 kit.dispose();
});
