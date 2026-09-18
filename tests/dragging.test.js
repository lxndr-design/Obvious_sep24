import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {CollisionScene} from '../src/collision.js';
import {StackScene} from '../src/stacking.js';
import {PendulumScene} from '../src/pendulums.js';
import {dragFloor,dragAnchor,DragPresentation,DragGhost} from '../src/dragging.js';
import {HangingFocus} from '../src/hanging-focus.js';
await R.init();
function setup(){const c=new CollisionScene(R),s=new StackScene(c);const add=(type,x,z)=>{const f=makeForm(type,R),mesh=new THREE.Mesh(f.geometry,new THREE.MeshStandardMaterial());mesh.position.set(x,f.height/2,z);const o={...f,mesh,type};c.objects.push(o);return o;};return {c,s,add};}
const target=(o,x,z)=>new THREE.Vector3(x,o.mesh.position.y,z);
test('blocked drag leaves the exact last valid position, then escapes to a free destination across the obstruction',()=>{
 const {s,add}=setup(),a=add('box',-8,0),b=add('box',-6,0),start=a.mesh.position.clone();
 assert.equal(dragFloor(s,a,target(a,-6,0)).moved,false);assert.deepEqual(a.mesh.position.toArray(),start.toArray(),'no clipped movement toward the blocker');
 const escaped=dragFloor(s,a,target(a,-4,0));assert.deepEqual(escaped,{moved:true,relocated:true});assert.equal(a.mesh.position.x,-4);assert.equal(b.mesh.position.x,-6);
});
test('escape validates every carried shape, preserves its support links, and cancellation restores the stack',()=>{
 const {s,add}=setup(),table=add('table-square-half',-9,0),ball=add('sphere',-9,3),blocker=add('box',-5,0);assert.ok(s.move(ball,target(ball,-9,0)));
 const before=s.snapshot(table);blocker.mesh.position.y=1.5;blocker.hanging=true;
 assert.equal(dragFloor(s,table,target(table,-5,0)).moved,false);assert.equal(table.mesh.position.x,-9);assert.equal(ball.support,table);
 assert.ok(dragFloor(s,table,target(table,-3,0)).moved);assert.equal(ball.mesh.position.x,-3);s.restore(before);assert.equal(ball.mesh.position.x,-9);assert.equal(ball.support,table);
});
test('a blocked anchor remains in place and a free anchor destination escapes without stretching the cable',()=>{
 const {c,add}=setup(),p=new PendulumScene(R),a=add('sphere',-9,0),b=add('box',-6,0);a.hanging=true;a.cableLength=4;a.anchor=new THREE.Vector3(-9,8.5,0);a.mesh.position.y=3.75;b.mesh.position.y=3.75;p.add(a);p.add(b);p.beginAnchor(a);
 const original=a.anchor.clone(),length=p.attachment(a).distanceTo(a.anchor);
 assert.equal(dragAnchor(p,c,a,new THREE.Vector3(-6,8.5,0)).moved,false);assert.deepEqual(a.anchor.toArray(),original.toArray());
 assert.ok(dragAnchor(p,c,a,new THREE.Vector3(-3,8.5,0)).moved);assert.ok(Math.abs(p.attachment(a).distanceTo(a.anchor)-length)<1e-6);p.dispose();
});
test('render easing is monotonic, frame-rate independent, and never changes logical poses',()=>{
 const run=hz=>{const {add}=setup(),o=add('box',-9,0),v=new DragPresentation(),snapshot=v.capture([o]);o.mesh.position.x=-8;v.animate(snapshot);let last=-9;
  for(let i=0;i<hz/5;i++){v.step(1/hz);const restore=v.apply();assert.ok(o.mesh.position.x>=last&&o.mesh.position.x<=-8);last=o.mesh.position.x;restore();assert.equal(o.mesh.position.x,-8);}return last;};
 assert.ok(Math.abs(run(30)-run(120))<1e-6);assert.ok(run(60)>-8.02);
});
test('ghosts have no hit target or collider and relocation fading restores original materials',()=>{
 const {add}=setup(),o=add('box',-9,0),scene=new THREE.Scene(),ghost=new DragGhost(scene),v=new DragPresentation();ghost.begin([o]);ghost.show(new THREE.Vector3(2,0,0));
 assert.equal(ghost.group.children[0].position.x,-7);assert.equal(o.mesh.position.x,-9);const hits=[];ghost.group.children[0].raycast(null,hits);assert.equal(hits.length,0);
 const material=o.mesh.material;v.animate(v.capture([o]),true);const restore=v.apply();assert.ok(o.mesh.material.transparent);assert.ok(o.mesh.material.opacity<1);restore();assert.equal(o.mesh.material,material);assert.equal(material.opacity,1);ghost.end();assert.equal(ghost.group.children.length,0);
});
test('hanging focus masks only hanging geometry and keeps ground forms as depth occluders',()=>{
 const {add,c}=setup(),a=add('sphere',-9,0),b=add('box',-6,0),focus=new HangingFocus();a.hanging=true;
 let current=null,renders=0;const renderer={getRenderTarget:()=>current,setRenderTarget:t=>current=t,clear:()=>{},render:()=>renders++};
 focus.resize(800,600);assert.ok(focus.render(renderer,new THREE.Camera(),c.objects));assert.equal(focus.proxies.get(a).material,focus.white);assert.equal(focus.proxies.get(b).material,focus.black);assert.equal(current,null);assert.equal(renders,1);
 a.hanging=false;assert.equal(focus.render(renderer,new THREE.Camera(),c.objects),false);assert.equal(renders,1);focus.target.dispose();focus.white.dispose();focus.black.dispose();
});

test('rotation easing follows a rigid stack arc, settles quickly, and restores collision poses',()=>{
 const {s,add}=setup(),table=add('table-square-full',-8,0),pot=add('plant-snake-small',-7.5,0);
 pot.support=table;pot.mesh.position.y=table.mesh.position.y+table.stacking.headY-pot.stacking.bottomY;
 const v=new DragPresentation(),members=s.members(table),start=v.capture(members),pivot=table.mesh.position.clone(),distance=pot.mesh.position.distanceTo(table.mesh.position);
 assert.ok(s.rotate(table));const final=s.snapshot(table);v.animate(start,false,pivot);
 let restore=v.apply();assert.ok(table.mesh.quaternion.angleTo(start[0].rotation)<1e-7);restore();
 v.step(.05);restore=v.apply();assert.ok(table.mesh.quaternion.angleTo(final[0].rotation)>.05);assert.ok(Math.abs(pot.mesh.position.distanceTo(table.mesh.position)-distance)<1e-6);restore();
 for(let i=0;i<12;i++)v.step(1/60);
 restore=v.apply();assert.ok(table.mesh.quaternion.angleTo(final[0].rotation)<.01,'turn should be essentially complete in 250ms');restore();
 assert.deepEqual(s.snapshot(table).map(x=>[x.position.toArray(),x.rotation.toArray()]),final.map(x=>[x.position.toArray(),x.rotation.toArray()]));
});
test('repeated rotations retarget from the displayed pose without a jump',()=>{
 const {s,add}=setup(),o=add('arch',-8,0),v=new DragPresentation();let snapshot=v.capture([o]);assert.ok(s.rotate(o));v.animate(snapshot,false,o.mesh.position);v.step(.04);
 const shown=v.capture([o]);assert.ok(s.rotate(o));v.animate(shown,false,o.mesh.position);const restore=v.apply();assert.ok(o.mesh.quaternion.angleTo(shown[0].rotation)<1e-7);restore();
});
