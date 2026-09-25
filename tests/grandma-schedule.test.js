import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {makeSizedForm} from '../src/object-size.js';
import {CollisionScene} from '../src/collision.js';
import {seededRandom} from '../src/birds.js';
import {GrandmaSchedule,gaitSwing,turnToward,yawOf,poseGrandmaGait,POI_RADIUS,APPROACH_MIN,APPROACH_SPAN} from '../src/grandma-schedule.js';
await R.init();
function setup(){
 const collision=new CollisionScene(R);
 const add=(type,x,z=0,ry=0)=>{
  const f=makeForm(type,R),mesh=new THREE.Mesh(f.meshGeometry??f.geometry);
  mesh.position.set(x,f.height/2,z);mesh.rotation.y=ry;
  const o={...f,mesh,type,id:collision.objects.length+1};mesh.userData.object=o;
  collision.objects.push(o);return o;
 };
 return {collision,add};
}
function schedule(collision,seed,pois,busy=()=>false){
 return new GrandmaSchedule(collision,seededRandom(seed),{pois:()=>pois,busy});
}
const dt=1/60,GUARD=20000;
function drive(s,g,until,guard=GUARD){let n=0;while(!until()&&n++<guard)s.step(dt,[g]);return n<guard;}

test('gait phase math swings sinusoidally with counter-phases and wraps',()=>{
 assert.equal(gaitSwing(0),0);
 assert.ok(Math.abs(gaitSwing(.25)-1)<1e-9);
 assert.ok(Math.abs(gaitSwing(.75)+1)<1e-9);
 assert.ok(Math.abs(gaitSwing(1.25)-gaitSwing(.25))<1e-9);
 assert.ok(Math.abs(gaitSwing(.25,Math.PI)+1)<1e-9); // counter-phase arm
});
test('turnToward takes the shortest arc and clamps to the turn rate',()=>{
 assert.equal(turnToward(0,.5,2),.5);
 assert.equal(turnToward(0,2,1),1);
 assert.ok(Math.abs(turnToward(3,-3,1)-(3.2831853071795867))<1e-9); // shortest arc crosses ±π
 assert.equal(turnToward(0,Math.PI,1),1);
});
test('yawOf reads heading from a quaternion',()=>{
 assert.ok(Math.abs(yawOf(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2))-Math.PI/2)<1e-9);
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
test('grandma walks to a bench, sits through the placement probes, and stands back up',()=>{
 const {collision,add}=setup();
 const bench=add('bench',2.5,0),g=add('grandma-skirt-bun',0,0);
 const s=schedule(collision,411,[{kind:'bench',object:bench,x:2.5,z:0}]);
 const state=()=>s.states.get(g);
 s.step(dt,[g]); // adopt → idle
 assert.equal(state().state,'idle');
 assert.ok(drive(s,g,()=>state().state==='wander'),'never began wandering');
 assert.ok(state().target);
 // While walking she stays placeable and never enters the bench footprint.
 let walked=false;
 while(state().state==='wander'){
  s.step(dt,[g]);walked=true;
  assert.ok(collision.canPlace(g,g.mesh.position,g.mesh.quaternion,new Set([g])),'walked into a solid');
  if(state().state!=='wander')break;
 }
 assert.ok(walked);
 assert.equal(state().state,'sit');
 assert.ok(g.seated);assert.equal(g.support,bench);
 assert.ok(drive(s,g,()=>state().state!=='sit'),'never stood up');
 assert.equal(state().state,'idle');
 assert.ok(!g.seated);assert.equal(g.support,null);
});
test('grandma feeds at a leaf pile and retires to idle afterwards',()=>{
 const {collision,add}=setup();
 const g=add('grandma-skirt-bun',0,0),pile={kind:'pile',x:2.2,z:1.1};
 const s=schedule(collision,87,[pile]);
 const state=()=>s.states.get(g);
 s.step(dt,[g]);
 assert.ok(drive(s,g,()=>state().state==='feed'),'never reached the pile');
 const d=Math.hypot(g.mesh.position.x-pile.x,g.mesh.position.z-pile.z);
 assert.ok(d>=APPROACH_MIN-.15&&d<=APPROACH_MIN+APPROACH_SPAN+.15,`stopped ${d} from the pile`);
 assert.ok(!g.seated);
 assert.ok(drive(s,g,()=>state().state!=='feed'),'never finished feeding');
 assert.equal(state().state,'idle');
});
test('a blocked path re-routes instead of stalling or clipping the obstacle',()=>{
 const {collision,add}=setup();
 const g=add('grandma-skirt-bun',0,0),pile={kind:'pile',x:0,z:3};
 const s=schedule(collision,19,[pile,{kind:'pile',x:3,z:0}]);
 const state=()=>s.states.get(g);
 s.step(dt,[g]);
 assert.ok(drive(s,g,()=>state().state==='wander'),'never began wandering');
 const box=add('box',0,1.5); // dropped onto her route mid-walk
 let n=0,inside=false;
 while(state().state!=='idle'&&n++<6000){
  s.step(dt,[g]);
  const p=g.mesh.position;
  if(Math.abs(p.x-box.mesh.position.x)<.45&&Math.abs(p.z-box.mesh.position.z)<.45)inside=true;
 }
 assert.ok(!inside,'walked through the box');
 assert.ok(n<6000,'stalled against the box');
 assert.ok(collision.canPlace(g,g.mesh.position,g.mesh.quaternion,new Set([g])));
});
test('dragging interrupts the schedule and she resumes from the release anchor',()=>{
 const {collision,add}=setup();
 const g=add('grandma-skirt-bun',0,0),pile={kind:'pile',x:2.5,z:0};
 let busy=false;
 const s=schedule(collision,23,[pile],()=>busy);
 const state=()=>s.states.get(g);
 s.step(dt,[g]);
 assert.ok(drive(s,g,()=>state().state==='wander'),'never began wandering');
 for(let i=0;i<60;i++)s.step(dt,[g]); // ~1s of walking
 const draggedTo=new THREE.Vector3(1.2,0,.8);
 g.mesh.position.copy(draggedTo); // simulate the drag carrying her elsewhere
 busy=true;s.step(dt,[g]);
 assert.equal(state().state,'idle');
 for(let i=0;i<60;i++)s.step(dt,[g]);
 assert.ok(g.mesh.position.distanceTo(draggedTo)<1e-9,'moved while dragged');
 busy=false;
 assert.ok(drive(s,g,()=>state().state==='wander'),'never resumed after release');
 assert.ok(Math.hypot(state().target.x-draggedTo.x,state().target.z-draggedTo.z)<=POI_RADIUS+APPROACH_SPAN+.15,'resumed from the old anchor');
});
test('removing a grandma prunes her schedule state',()=>{
 const {collision,add}=setup();
 const a=add('grandma-skirt-bun',0,0),b=add('grandma-pants-bun',2,0);
 const s=schedule(collision,5,[]);
 s.step(dt,[a,b]);
 assert.equal(s.states.size,2);
 s.step(dt,[a]);
 assert.equal(s.states.size,1);
 assert.ok(s.states.has(a));assert.ok(!s.states.has(b));
 s.reset();
 assert.equal(s.states.size,0);
});
test('identical seeds produce identical trajectories',()=>{
 const worlds=[];
 for(let w=0;w<2;w++){
  const {collision,add}=setup();
  const bench=add('bench',2.5,0),g=add('grandma-skirt-bun',0,0);
  const pois=[{kind:'bench',object:bench,x:2.5,z:0},{kind:'pile',x:-2,z:1.5},{kind:'bath',x:1,z:-2.5}];
  worlds.push({g,s:schedule(collision,777,pois)});
 }
 for(let n=0;n<1500;n++){
  for(const {g,s} of worlds)s.step(dt,[g]);
  if(n%100===99){
   const [a,b]=worlds;
   assert.equal(a.s.states.get(a.g).state,b.s.states.get(b.g).state,`state diverged at step ${n}`);
   assert.ok(a.g.mesh.position.distanceTo(b.g.mesh.position)<1e-9,`position diverged at step ${n}`);
   assert.ok(Math.abs((a.g.gaitPhase??0)-(b.g.gaitPhase??0))<1e-9,`gait diverged at step ${n}`);
  }
 }
});
test('production-scaled forms still seat her: default and matching-large sizes',()=>{
 for(const [gSize,bSize] of [[2,2],[3,3]]){
  const collision=new CollisionScene(R);
  const addScaled=(type,size,x,z,ry=0)=>{
   const f=makeSizedForm(type,R,size),mesh=new THREE.Mesh(f.meshGeometry??f.geometry);
   mesh.position.set(x,f.height/2,z);mesh.rotation.y=ry;
   const o={...f,mesh,type,id:collision.objects.length+1};mesh.userData.object=o;
   collision.objects.push(o);return o;
  };
  const bench=addScaled('bench',bSize,2.5,0),g=addScaled('grandma-skirt-bun',gSize,0,0);
  const s=schedule(collision,411,[{kind:'bench',object:bench,x:2.5,z:0}]);
  const state=()=>s.states.get(g);
  s.step(dt,[g]);
  assert.ok(drive(s,g,()=>state().state==='wander'),`never wandered (grandma ${gSize}, bench ${bSize})`);
  assert.ok(drive(s,g,()=>state().state==='sit'),`never sat (grandma ${gSize}, bench ${bSize})`);
  assert.ok(g.seated);assert.equal(g.support,bench);
  assert.ok(drive(s,g,()=>state().state!=='sit'),'never stood up');
 }
});
test('a seat too small for her is refused gracefully, without clipping the bench',()=>{
 const collision=new CollisionScene(R);
 const addScaled=(type,size,x,z,ry=0)=>{
  const f=makeSizedForm(type,R,size),mesh=new THREE.Mesh(f.meshGeometry??f.geometry);
  mesh.position.set(x,f.height/2,z);mesh.rotation.y=ry;
  const o={...f,mesh,type,id:collision.objects.length+1};mesh.userData.object=o;
  collision.objects.push(o);return o;
 };
 const bench=addScaled('bench',2,2.5,0),g=addScaled('grandma-skirt-bun',3,0,0);
 const s=schedule(collision,411,[{kind:'bench',object:bench,x:2.5,z:0}]);
 const state=()=>s.states.get(g);
 s.step(dt,[g]);
 assert.ok(drive(s,g,()=>state().state==='wander'),'never wandered');
 // Through many wander cycles she never ends up seated on the undersized bench.
 let n=0,clipped=false;
 while(n++<9000){
  s.step(dt,[g]);
  const p=g.mesh.position;
  if(g.seated)clipped=true;
  assert.ok(collision.canPlace(g,p,g.mesh.quaternion,new Set([g])),'clipped the bench');
 }
 assert.ok(!clipped,'sat a bench that cannot hold her');
 assert.ok(['idle','wander'].includes(state().state));
});
test('a barren anchor still stretches her legs instead of freezing',()=>{
 const collision=new CollisionScene(R);
 const addScaled=(type,size,x,z,ry=0)=>{
  const f=makeSizedForm(type,R,size),mesh=new THREE.Mesh(f.meshGeometry??f.geometry);
  mesh.position.set(x,f.height/2,z);mesh.rotation.y=ry;
  const o={...f,mesh,type,id:collision.objects.length+1};mesh.userData.object=o;
  collision.objects.push(o);return o;
 };
 const bench=addScaled('bench',2,30,30),g=addScaled('grandma-skirt-bun',2,0,0);
 const s=schedule(collision,411,[{kind:'bench',object:bench,x:30,z:30}]);
 const state=()=>s.states.get(g);
 s.step(dt,[g]);
 assert.ok(drive(s,g,()=>state().state==='wander'),'never wandered from the barren anchor');
 const target=state().target;
 assert.ok(Math.hypot(target.x-state().anchor.x,target.z-state().anchor.z)<=1.61,
  'stretch target left the anchor radius');
 assert.ok(drive(s,g,()=>state().state!=='wander'),'never arrived at the stretch stop');
 assert.ok(collision.canPlace(g,g.mesh.position,g.mesh.quaternion,new Set([g])),'clipped something on the stretch');
});
test('poseGrandmaGait swings pivots from the gait phase and hides them when seated',()=>{
 const pivot=()=>({rotation:{x:0,z:0},visible:true});
 const o={visualRoot:{position:{y:0}},hipPivots:[pivot(),pivot()],shoulderPivots:[pivot(),pivot()],walkBlend:1,gaitPhase:.25,swayPhase:0,seated:false};
 poseGrandmaGait(o);
 assert.ok(o.hipPivots[0].rotation.x>.3,'lead hip swung forward');
 assert.ok(o.hipPivots[1].rotation.x<-.3,'trail hip swung back');
 assert.ok(o.shoulderPivots[0].rotation.x<0,'arms counter-swing');
 assert.ok(o.visualRoot.position.y>0,'torso bobs at mid-stride');
 const seated={...o,seated:true};
 poseGrandmaGait(seated);
 for(const p of [...seated.hipPivots,...seated.shoulderPivots])assert.equal(p.visible,false);
 assert.equal(seated.visualRoot.position.y,0);
});
