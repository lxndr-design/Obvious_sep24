import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BirdColony,seededRandom} from '../src/birds.js';
import {CLEARANCE,pathObstruction} from '../src/bird-flight.js';
const advance=(step,seconds)=>{for(let i=0;i<seconds*60;i++)step(1/60);};
const arrivingBird=(from,target,habitat='leaves')=>({id:2,scale:1,caution:.5,habitat,sitePosition:target.clone(),state:'arriving',age:0,visitAge:0,position:from.clone(),from:from.clone(),target:target.clone(),opacity:1,fullness:0,capacity:10,fatness:0,wing:0,wingSpread:1,wingFlap:1.12,wingPhase:0,wingState:'gliding',peck:0,yaw:Math.atan2(-(target.z-from.z),target.x-from.x),residentArrival:false,pileId:habitat});

test('seeded colony flights are velocity-bounded: no tick moves a flying bird more than speed x dt',()=>{
 const c=new BirdColony(seededRandom(419)),site={id:'leaves',position:new THREE.Vector3(1,0,2),count:5};
 let flightTicks=0,worst=-Infinity;
 advance(dt=>{
  const before=new Map(c.birds.map(b=>[b.id,b.position.clone()]));
  c.step(dt,[site]);
  for(const b of c.birds){
   const prev=before.get(b.id);
   if(!prev||!b.flight||b.flight.done)continue;
   flightTicks++;
   const budget=b.flight.speed*dt,over=b.position.distanceTo(prev)-budget;
   worst=Math.max(worst,over);
   assert.ok(over<=1e-9,`tick moved a flying bird ${b.position.distanceTo(prev)} > speed*dt ${budget}`);
  }
 },10);
 assert.ok(flightTicks>60,'observed a full steered flight, not a teleport');
 assert.ok(worst<=1e-9,'every flight tick respected the velocity bound');
});

test('flight paths bend around solid-form bounds supplied by the broad phase',()=>{
 const c=new BirdColony(()=>.5),site={id:'leaves',position:new THREE.Vector3(3,0,0),count:5};
 const obstacle={minX:1.2,minZ:-.6,maxX:2.4,maxZ:.6,minY:0,maxY:1.1};
 c.avoidance=(minX,minZ,maxX,maxZ)=>[obstacle].filter(o=>o.minX<=maxX&&o.maxX>=minX&&o.minZ<=maxZ&&o.maxZ>=minZ);
 const b=arrivingBird(new THREE.Vector3(0,.08,0),new THREE.Vector3(3,.08,0));
 c.birds=[b];c.nextArrival=Infinity;
 c.step(1/60,[site]);
 assert.ok(b.flight,'arrival leg planned on the first arriving tick');
 assert.equal(pathObstruction(b.flight,c.avoidance,null),null,'planned corridor clears the obstacle');
 let flightTicks=0;
 advance(dt=>{
  const before=b.position.clone();
  c.step(1/60,[site]);
  if(b.flight&&!b.flight.done){
   flightTicks++;
   const p=b.position;
   const insideSolid=p.x>obstacle.minX&&p.x<obstacle.maxX&&p.z>obstacle.minZ&&p.z<obstacle.maxZ&&p.y<obstacle.maxY&&p.y>obstacle.minY;
   assert.ok(!insideSolid,`flew through the solid at ${p.toArray()}`);
  }
 },8);
 assert.ok(flightTicks>30,'flew the leg instead of teleporting past the obstacle');
 assert.equal(b.state,'foraging','landed beyond the obstacle');
});

test('steered flights stay deterministic under a seed',()=>{
 const run=()=>{
  const c=new BirdColony(seededRandom(97)),site={id:'leaves',position:new THREE.Vector3(1,0,2),count:5},trace=[];
  advance(dt=>{c.step(dt,[site]);for(const b of c.birds)if(b.flight&&!b.flight.done)trace.push(b.position.x.toFixed(6),b.position.y.toFixed(6),b.position.z.toFixed(6));},10);
  return trace.join(',');
 };
 assert.equal(run(),run(),'identical seeds produce identical flight traces');
});

test('the destination object is excluded from avoidance, so rim landings stay direct',()=>{
 const c=new BirdColony(()=>.5);
 const rim={minX:2.7,minZ:-.5,maxX:3.3,maxZ:.5,minY:0,maxY:.9};
 c.avoidance=(minX,minZ,maxX,maxZ,exclude)=>exclude?[].filter(()=>false):[rim].filter(o=>o.minX<=maxX&&o.maxX>=minX&&o.minZ<=maxZ&&o.maxZ>=minZ);
 const b=arrivingBird(new THREE.Vector3(0,.08,0),new THREE.Vector3(3,.08,0));
 c.birds=[b];c.nextArrival=Infinity;b.siteObject=rim;
 c.step(1/60,[{id:'leaves',position:new THREE.Vector3(3,0,0),count:5}]);
 assert.ok(b.flight,'flight planned');
 assert.equal(b.flight.p1.x,1.35,'control point rides the take-off heading, unrepaired');
 assert.ok(Math.abs(b.flight.p1.z)<1e-9);
 assert.ok(CLEARANCE>0);
});
