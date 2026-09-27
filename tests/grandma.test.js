import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm,LABELS} from '../src/shapes.js';
import {makeSizedForm} from '../src/object-size.js';
import {CollisionScene} from '../src/collision.js';
import {StackScene} from '../src/stacking.js';
import {PendulumScene} from '../src/pendulums.js';
import {dragFloor,placementAt} from '../src/dragging.js';
import {GrandmaFeeding,applyGrandmaPlacement,poseGrandmaIdle} from '../src/grandma.js';
import {Ecology} from '../src/ecology.js';
import {WindField} from '../src/wind.js';
import {BirdseedField} from '../src/birdseed.js';
await R.init();
function setup(){const collision=new CollisionScene(R),stacks=new StackScene(collision),p=new PendulumScene(R);let id=0;
 const add=(type,x,z=0)=>{const f=makeForm(type,R),mesh=new THREE.Mesh(f.geometry),o={...f,mesh,type,id:++id};mesh.position.set(x,f.height/2,z);collision.objects.push(o);p.add(o);return o;};return {collision,stacks,p,add};}
const advance=(fn,seconds,rate=60)=>{for(let i=0;i<Math.round(seconds*rate);i++)fn(1/rate);};
test('Grandma sits on a bench facing its front, moves with it, and stands when dragged away',()=>{
 const {collision,stacks,p,add}=setup(),bench=add('bench',0),g=add('grandma',3);assert.equal(LABELS.grandma,'Grandma');
 assert.ok(dragFloor(stacks,g,new THREE.Vector3()).moved);assert.equal(g.support,bench);assert.ok(g.seated);assert.ok(collision.canPlace(g,g.mesh.position));p.syncPose(g);assert.equal(g.bodyGeometry,g.geometry);
 assert.ok(stacks.move(bench,new THREE.Vector3(-3,bench.mesh.position.y,0)));assert.equal(g.mesh.position.x,-3);assert.ok(stacks.rotate(bench));assert.ok(g.mesh.quaternion.angleTo(bench.mesh.quaternion)<1e-8);
 const snapshot=stacks.snapshot(g);assert.ok(dragFloor(stacks,g,new THREE.Vector3(3,0,3)).moved);assert.equal(g.seated,false);assert.equal(g.support,null);assert.ok(Math.abs(g.mesh.position.y-g.height/2)<1e-6);p.syncPose(g);
 stacks.restore(snapshot);p.syncPose(g);assert.equal(g.seated,true);assert.equal(g.support,bench);assert.ok(collision.canPlace(g,g.mesh.position));assert.equal(g.bodyGeometry,g.geometry);p.dispose();
});
test('toolbar seating, occupied seats, blocked destinations and bench removal keep exact colliders',()=>{
 const {collision,stacks,p,add}=setup(),bench=add('bench',0),g=add('grandma',3);bench.mesh.rotation.y=Math.PI/2;p.syncPose(bench);
 const placement=placementAt(stacks,g,0,0);assert.ok(placement?.seated);applyGrandmaPlacement(g,placement,collision);p.syncPose(g);
 const other=add('grandma',-3);assert.equal(placementAt(stacks,other,0,0),null);assert.equal(other.seated,false);
 const block=add('box',3,3),snapshot=stacks.snapshot(g);assert.equal(dragFloor(stacks,g,block.mesh.position).moved,false);assert.ok(g.seated);assert.deepEqual(g.mesh.position.toArray(),snapshot[0].position.toArray());
 collision.objects.splice(collision.objects.indexOf(bench),1);p.remove(bench);g.support=null;assert.ok(stacks.settle(g));p.syncPose(g);assert.equal(g.seated,false);assert.ok(collision.canPlace(g,g.mesh.position));p.dispose();
});
test('Grandma tosses individually accounted physical seeds forward at occasional intervals, and pauses while carried',()=>{
 const {stacks,p,add}=setup(),bench=add('bench',0),g=add('grandma',3),food=new BirdseedField(()=>.5),feeding=new GrandmaFeeding(()=>.5);food.attachPhysics(p.world,R);
 feeding.step(5,[g],food);assert.equal(food.remaining,0);feeding.step(.6,[g],food);assert.equal(food.remaining,6);
 assert.ok(food.available().every(s=>!s.settled&&s.body.linvel().z>.7&&s.position.y>.9));
 for(let i=0;i<180;i++){p.step(1/60);food.updatePhysics(1/60);}assert.ok(food.available().every(s=>s.position.z>.5&&s.position.y<.06));
 feeding.busy=()=>true;feeding.step(30,[g],food);assert.equal(food.remaining,6);feeding.busy=()=>false;stacks.placeGrandma(g,new THREE.Vector3());p.syncPose(g);g.mesh.rotation.y=Math.PI;feeding.step(15,[g],food);assert.equal(food.remaining,12);assert.ok(food.available().slice(6).every(s=>s.body.linvel().z<-.7));
 feeding.step(30,[],food);assert.equal(food.remaining,12);assert.equal(feeding.timers.size,0);feeding.reset();assert.equal(feeding.scatters,0);food.reset();p.dispose();
});

test('every Grandma outfit and hairstyle keeps both poses, bench support and seed scattering',()=>{
 const {collision,stacks,p,add}=setup(),bench=add('bench',0),food=new BirdseedField(()=>.5),feeding=new GrandmaFeeding(()=>.5);food.attachPhysics(p.world,R);
 for(const type of Object.keys(LABELS).filter(type=>type.startsWith('grandma-'))){
  const g=add(type,3);assert.ok(g.grandmaVariant);const stand=g.geometry;
  assert.ok(dragFloor(stacks,g,new THREE.Vector3()).moved,`${type} fits on bench`);assert.ok(g.seated);assert.notEqual(g.geometry,stand);assert.ok(collision.canPlace(g,g.mesh.position));p.syncPose(g);
  assert.ok(g.mesh.position.y+g.geometry.boundingBox.min.y>.3,'feet dangle');
  const before=food.remaining;feeding.step(6,[g],food);assert.equal(food.remaining,before+6,`${type} feeds birds`);food.reset();feeding.reset();
  assert.ok(dragFloor(stacks,g,new THREE.Vector3(3,0,0)).moved);assert.equal(g.geometry,stand);assert.equal(g.support,null);
  collision.objects.splice(collision.objects.indexOf(g),1);p.remove(g);for(const form of Object.values(g.grandmaForms))form.geometry.dispose();
 }
 p.dispose();
});

test('Grandma waits for all seed ahead, including reserved and airborne seed, and detects the area after rotation',()=>{
 const {p,add}=setup(),g=add('grandma',3),food=new BirdseedField(()=>.5),feeding=new GrandmaFeeding(()=>.5);
 g.mesh.rotation.y=Math.PI/2;
 food.scatter(new THREE.Vector3(4,0,0));const seed=food.available()[0];seed.settled=false;seed.owner=77;
 feeding.step(20,[g],food);assert.equal(food.sequence,1);assert.equal(feeding.scatters,0);
 seed.settled=true;assert.ok(food.consume(seed.id,77));feeding.step(1.1,[g],food);assert.equal(food.remaining,6);assert.equal(feeding.scatters,1);
 feeding.step(30,[g],food);assert.equal(food.remaining,6,'her airborne scatter also prevents another toss');
 food.reset();food.scatter(new THREE.Vector3(2,0,0));feeding.step(2,[g],food);assert.equal(food.remaining,7,'seed behind her does not block a fresh toss');p.dispose();
});
test('Grandma scatter settles into a two-dimensional patch and she waits until the patch is eaten',()=>{
 const {p,add}=setup(),g=add('grandma',3,3),food=new BirdseedField(()=>.5),feeding=new GrandmaFeeding(()=>.5);food.attachPhysics(p.world,R);
 feeding.step(6,[g],food);for(let i=0;i<240;i++){p.step(1/60);food.updatePhysics(1/60);}
 const seeds=food.available(),points=seeds.map(s=>s.position);let area=0;
 for(const a of points)for(const b of points)for(const c of points)area=Math.max(area,Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/2);
 assert.ok(area>.04,`scatter triangle area ${area}`);assert.ok(seeds.every(s=>s.settled));feeding.step(30,[g],food);assert.equal(food.remaining,6);
 for(const s of seeds){s.owner=1;assert.ok(food.consume(s.id,1));}feeding.step(1.1,[g],food);assert.equal(food.remaining,6);assert.equal(food.eaten,6);food.reset();p.dispose();
});
test('standing form carries a pivot rig with unchanged colliders; sitting stays baked',()=>{
 const g=makeForm('grandma-pants-bun',R),standing=g.grandmaForms.standing,sitting=g.grandmaForms.sitting;
 assert.equal(standing.rig.hips.length,2);assert.equal(standing.rig.shoulders.length,2);
 for(const limb of [...standing.rig.hips,...standing.rig.shoulders])assert.ok(limb.geometry.attributes.position.count>0);
 assert.ok(standing.meshGeometry);assert.notEqual(standing.meshGeometry,standing.geometry);
 assert.equal(sitting.rig,undefined);assert.equal(sitting.meshGeometry,undefined);
 // Rigging is view-only: both forms expose the same collider set.
 assert.equal(standing.parts.length,sitting.parts.length);
 // Limb geometry is baked in form space: the torso render sits within the full bind bounds.
 const full=standing.geometry.boundingBox,torso=standing.meshGeometry.boundingBox;
 assert.ok(full.min.y<=torso.min.y+1e-6&&full.max.y>=torso.max.y-1e-6);
});
test('makeSizedForm scales the rig pivots and limb geometry proportionally',()=>{
 const small=makeSizedForm('grandma-skirt-bun',R,1).grandmaForms.standing,large=makeSizedForm('grandma-skirt-bun',R,3).grandmaForms.standing;
 assert.equal(small.rig.hips.length,2);assert.equal(large.rig.shoulders.length,2);
 for(let i=0;i<2;i++)for(const kind of ['hips','shoulders']){
  const a=small.rig[kind][i],b=large.rig[kind][i];
  assert.ok(Math.abs(b.pivot.x-a.pivot.x*3)<1e-6&&Math.abs(b.pivot.y-a.pivot.y*3)<1e-6);
  assert.ok(Math.abs(b.geometry.boundingBox.max.y-a.geometry.boundingBox.max.y*3)<1e-5);
 }
});
test('grandmas never move on their own: a simulated interval holds them in place',()=>{
 const scene=new THREE.Scene(),p=new PendulumScene(R),collision=new CollisionScene(R),e=new Ecology(scene,p,collision,new WindField(),R);p.beforeStep=dt=>e.beforeStep(dt);
 const f=makeForm('grandma',R),mesh=new THREE.Mesh(f.meshGeometry??f.geometry),g={...f,mesh,type:'grandma',id:1};
 mesh.position.set(2,g.height/2,1);collision.objects.push(g);p.add(g);
 const start=mesh.position.clone();
 // Thirty simulated seconds: the former schedule's quiet window was 7-15s, so
 // she would certainly have wandered by now.
 advance(dt=>{p.step(dt);e.update(dt,null,0,0);},30);
 assert.equal(e.grandmaSchedule,undefined,'the wander schedule must stay removed');
 assert.ok(mesh.position.distanceTo(start)<1e-9,'she displaced herself');
 assert.ok(g.swayPhase>0&&g.swayPhase<1,'idle sway never ticked');
 p.dispose();
});
test('poseGrandmaIdle sways her shoulders and breathes without moving her mesh',()=>{
 const pivot=()=>({rotation:{x:0,z:0},visible:true});
 const position=new THREE.Vector3(1,2,3);
 const o={mesh:{position},visualRoot:{position:{y:0}},hipPivots:[pivot(),pivot()],shoulderPivots:[pivot(),pivot()],swayPhase:.25,seated:false};
 poseGrandmaIdle(o);
 assert.ok(o.shoulderPivots[0].rotation.z>.04,'lead shoulder sways out');
 assert.ok(o.shoulderPivots[1].rotation.z<-.04,'shoulders counter-sway');
 assert.ok(o.visualRoot.position.y>.005,'she breathes');
 assert.equal(o.hipPivots[0].rotation.x,0,'legs stay planted');
 assert.ok(position.equals(new THREE.Vector3(1,2,3)),'idle sway never moves her mesh');
 const seated={...o,seated:true};
 poseGrandmaIdle(seated);
 for(const p of [...seated.hipPivots,...seated.shoulderPivots])assert.equal(p.visible,false);
 assert.equal(seated.visualRoot.position.y,0);
});
