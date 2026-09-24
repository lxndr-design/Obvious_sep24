import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {landingEase,poseDuckGait,updateBirdGait} from '../src/bird-gait.js';
import {DuckFlock,duckMesh} from '../src/ducks.js';
import {BirdColony} from '../src/birds.js';
import {birdMesh,setBirdFatness} from '../src/nature-shapes.js';
import {groundHopHeight} from '../src/bird-traits.js';
import {HoleTerrain} from '../src/hole-terrain.js';
import {HoleLayout} from '../src/terrain.js';
const advance=(step,seconds)=>{for(let i=0;i<seconds*60;i++)step(1/60);};
test('duck legs connect the body to the feet, alternate steps and roll sideways only on land',()=>{
 const view=duckMesh(),duck={state:'walking',swimming:false,velocity:new THREE.Vector3(.3,0,0),yaw:.7,stepPhase:Math.PI/2};
 poseDuckGait(view,duck,1);assert.equal(view.legs.length,2);assert.ok(view.group.rotation.x>.1);assert.equal(view.group.rotation.y,duck.yaw);
 assert.ok(view.legPivots[0].rotation.z>.3&&view.legPivots[1].rotation.z<-.3);
 for(let i=0;i<2;i++){
  const leg=view.legs[i],foot=view.feet[i];assert.equal(leg.parent,foot.parent);
  leg.geometry.computeBoundingBox();foot.geometry.computeBoundingBox();
  const legBottom=leg.position.y+leg.geometry.boundingBox.min.y,footTop=foot.position.y+foot.geometry.boundingBox.max.y;
  assert.ok(Math.abs(legBottom-footTop)<.005,'ankle reaches the webbed foot');assert.ok(leg.position.y+leg.geometry.boundingBox.max.y>-.001,'upper leg reaches the hip');
 }
 duck.stepPhase+=Math.PI;poseDuckGait(view,duck,1/60);assert.ok(view.group.rotation.x<-.1,'opposite side of the waddle');
 duck.velocity.set(0,0,0);advance(dt=>poseDuckGait(view,duck,dt),1);assert.ok(Math.abs(view.group.rotation.x)<.00001,'settles at rest');
 duck.state='dabbling';duck.swimming=true;duck.dabbleAngle=-Math.PI/2;poseDuckGait(view,duck,1/60);
 assert.equal(Math.abs(view.group.rotation.x),0);assert.equal(view.group.rotation.z,-Math.PI/2);assert.ok([...view.legs,...view.feet].every(o=>!o.visible));
});
test('pigeons bob their heads while walking, keep eyes attached, and settle when stopped or airborne',()=>{
 const b={id:4,scale:1,state:'foraging',position:new THREE.Vector3(),headBob:0},view=birdMesh();let min=0,max=0;
 advance(dt=>{const previous=b.position.clone();b.position.x+=dt*.4;updateBirdGait(b,previous,dt);min=Math.min(min,b.headBob);max=Math.max(max,b.headBob);assert.equal(groundHopHeight(b,dt),0);},2);
 assert.ok(min<-.009&&max>.009,'head thrust and hold both visible');
 setBirdFatness(view,.4,.02);const a=view.torso.geometry.attributes.position;let moved=0,still=0;
 for(let i=0;i<a.count;i++){const dx=a.getX(i)-view.torsoRest[i*3];if(dx>.015)moved++;if(Math.abs(dx)<1e-6)still++;}assert.ok(moved>0&&still>0,'head moves separately from torso');
 for(const eye of view.eyes)assert.ok(Math.abs(eye.mesh.position.x-eye.rest.x-.02)<1e-7);
 advance(dt=>updateBirdGait(b,b.position,dt),.5);assert.ok(Math.abs(b.headBob)<1e-6);
 b.state='arriving';advance(dt=>{const previous=b.position.clone();b.position.x+=dt;updateBirdGait(b,previous,dt);},.5);assert.ok(Math.abs(b.headBob)<1e-6);
 const songbird={...b,id:1,state:'foraging',headBob:0};let lift=0;advance(dt=>{const previous=songbird.position.clone();songbird.position.x+=dt;updateBirdGait(songbird,previous,dt);lift=Math.max(lift,groundHopHeight(songbird,dt));},1);assert.ok(lift>.01);assert.equal(songbird.headBob,0);
});
test('duck followers settle near a stopped leader instead of orbiting its heading',()=>{
 const terrain=new HoleTerrain(new THREE.Scene(),new THREE.MeshStandardMaterial());terrain.rebuild(new HoleLayout([{id:1,x:0,z:0,size:4}]));
 const flock=new DuckFlock();flock.nextArrival=0;flock.step(1/60,terrain);flock.nextArrival=flock.nextMove=Infinity;flock.target=new THREE.Vector3(.6,0,0);
 flock.ducks.forEach((d,i)=>{d.position.set(i?-.8:.6,-.09,0);d.state='swimming';d.medium='water';d.swimming=true;d.dabbleAt=Infinity;d.opacity=1;});
 advance(dt=>flock.step(dt,terrain),12);const positions=flock.ducks.map(d=>d.position.clone());let travel=0;
 advance(dt=>{const before=flock.ducks.map(d=>d.position.clone());flock.step(dt,terrain);travel+=flock.ducks.reduce((sum,d,i)=>sum+Math.hypot(d.position.x-before[i].x,d.position.z-before[i].z),0);},10);
 assert.ok(travel<.001,`settled flock travel ${travel}`);assert.ok(positions[0].distanceTo(positions[1])>.5&&positions[0].distanceTo(positions[1])<1);
});
test('foraging follows a straight waypoint, pauses, and abandons a newly blocked route',()=>{
 const site={id:'leaves',position:new THREE.Vector3(),count:5},c=new BirdColony(()=>.5),position=new THREE.Vector3(0,.08,0);
 const b={id:4,scale:1,state:'foraging',pileId:site.id,habitat:'leaves',sitePosition:site.position.clone(),target:position.clone(),position,walkTarget:position.clone(),nextWalk:0,age:0,visitAge:0,yaw:0,opacity:1};c.birds=[b];c.nextArrival=Infinity;
 advance(dt=>c.step(dt,[site]),1);assert.ok(b.position.x>.35);assert.equal(b.position.z,0);const rest=b.position.clone();advance(dt=>c.step(dt,[site]),.5);assert.ok(b.position.distanceTo(rest)<1e-8,'pause between walks');
 b.walkTarget.set(2,.08,0);c.step(1/60,[site],null,p=>p.x<=rest.x+.001);assert.ok(b.walkTarget.distanceTo(b.position)<1e-8,'blocked waypoint abandoned');
 advance(dt=>c.step(dt,[site]),4);assert.ok(b.position.distanceTo(rest)>.1,'can choose a new route after stopping');
});

test('arrival legs decelerate into the landing and face the path tangent on touch-down',()=>{
 const c=new BirdColony(()=>.5),site={id:'leaves',position:new THREE.Vector3(3,0,0),count:5};
 const b={id:2,scale:1,caution:.5,habitat:'leaves',sitePosition:site.position.clone(),state:'arriving',age:0,visitAge:0,position:new THREE.Vector3(0,.08,0),from:new THREE.Vector3(0,.08,0),target:new THREE.Vector3(3,.08,0),opacity:1,fullness:0,capacity:10,fatness:0,wing:0,wingSpread:1,wingFlap:1.12,wingPhase:0,wingState:'gliding',peck:0,yaw:0,residentArrival:false,pileId:'leaves'};
 c.birds=[b];c.nextArrival=Infinity;
 // Ease curve: cruise speed until the final stretch, then a smoothstep down to .3.
 assert.equal(landingEase(0),1);assert.equal(landingEase(.5),1);
 assert.ok(landingEase(.9)>landingEase(.95)&&landingEase(.95)>.3,'monotonically slowing');
 assert.ok(Math.abs(landingEase(1)-.3)<1e-12,'thirty percent of cruise at touch-down');
 let landYaw=null,tangentYaw=null,easedTick=false;
 advance(dt=>{
  const flying=!!(b.flight&&!b.flight.done),uBefore=flying?b.flight.u:0,before=b.position.clone();
  c.step(dt,[site]);
  if(b.flight){ // leg constants are stable; capture before the landing consumes the flight
   landYaw=b.flight.landYaw;
   tangentYaw=Math.atan2(-(b.flight.p2.z-b.flight.p1.z),b.flight.p2.x-b.flight.p1.x);
  }
  if(!flying||!b.flight||b.flight.done)return;
  const moved=b.position.distanceTo(before),budget=b.flight.speed*dt;
  assert.ok(moved<=budget+1e-9,'velocity bound holds');
  if(uBefore>.72){
   assert.ok(moved<=budget*landingEase(uBefore)+1e-9,'final stretch is eased');
   if(moved<budget-1e-12)easedTick=true;
  }
 },3);
 assert.ok(easedTick,'the approach visibly decelerates');
 assert.ok(Math.abs(b.yaw-landYaw)<1e-9,'touch-down faces the landing tangent');
 assert.ok(Math.abs(landYaw-tangentYaw)<1e-9,'landing tangent matches the path');
 assert.equal(b.state,'foraging','landed into the foraging state');
});

test('flying ducks unfold and flap marked wings, tuck feet, and fold wings again on landing',()=>{
 const view=duckMesh('mallard'),duck={id:1,state:'arriving',swimming:false,velocity:new THREE.Vector3(1,-1,0),yaw:0,flightPitch:-.12};
 let low=Infinity,high=-Infinity;
 advance(dt=>{poseDuckGait(view,duck,dt);view.group.updateMatrixWorld(true);const tip=new THREE.Vector3(-.35,-.05,0).applyMatrix4(view.wings[1].matrixWorld);low=Math.min(low,tip.y);high=Math.max(high,tip.y);},1);
 assert.ok(high-low>.25,'wing tips travel vertically through the flap stroke');assert.ok(view.wings.every(w=>w.children.length===2),'colored patches stay on wing pivots');assert.ok(view.feet.every(f=>!f.visible));
 duck.state='swimming';duck.swimming=true;advance(dt=>poseDuckGait(view,duck,dt),1);assert.ok(view.wings.every(w=>Math.abs(w.rotation.x)+Math.abs(w.rotation.y)<.0001));
});
