import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {SplashWorld,SIM_DT,MAX_FRAME_DT,WORLD_DEFAULTS} from '../src/splash/sim/splash-world.js';
import {POSITION_STRIDE,QUATERNION_STRIDE} from '../src/splash/sim/protocol.js';

await RAPIER.init();
const R=RAPIER;

let nextId=1;
const body=(preset,p,behavior='none',r=1,seed=1)=>({id:nextId++,preset,r,p,behavior,seed});

function scratch(capacity=100){
 return{
  positions:new Float32Array(capacity*POSITION_STRIDE),
  quaternions:new Float32Array(capacity*QUATERNION_STRIDE),
  sleep:new Uint8Array(capacity),
  ids:new Uint32Array(capacity),
 };
}

// Spawns a world of mixed presets across a cloud and drives N fixed steps,
// sampling the center body's pose every `sampleEvery` steps.
function drive(world,steps,sampleEvery=1){
 const samples=[];
 const poses=scratch(world.capacity>64?64:world.capacity);
 for(let i=0;i<steps;i++){
  world.advance(SIM_DT);
  if(i%sampleEvery===0){
   const count=world.writePoses(poses);
   samples.push({
    count,
    positions:Float32Array.from(poses.positions.slice(0,count*POSITION_STRIDE)),
    sleep:Uint8Array.from(poses.sleep.slice(0,count)),
   });
  }
 }
 return samples;
}

const yOf=(world,id)=>world.byId.get(id).body.translation().y;

test('constructor follows the repo pattern: fixed 1/120 step, solver params, floor',()=>{
 const world=new SplashWorld(R);
 // Rapier 0.19 stores the timestep as f32 — compare with tolerance.
 assert.ok(Math.abs(world.world.timestep-SIM_DT)<1e-6,`timestep ${world.world.timestep}`);
 assert.equal(world.world.integrationParameters.numSolverIterations,4);
 assert.equal(world.world.integrationParameters.maxCcdSubsteps,0);
 assert.deepEqual([...world.config.gravity],WORLD_DEFAULTS.gravity);
 world.dispose();
});

test('none bodies fall, land on the floor, and sleep — writePoses flags them',()=>{
 const world=new SplashWorld(R);
 const a=body('blob',[0,0,0]);
 const b=body('box',[3,5,0]);
 world.spawn([a,b]);
 // 5.5 s: the box falls from higher and sleeps later (probed: blob asleep by
 // step 420, box by 540) — the last sample must land after both.
 const samples=drive(world,660,60);
 const last=samples.at(-1);
 assert.equal(last.count,2);
 const extentA=world.byId.get(a.id).extent;
 assert.ok(Math.abs(last.positions[1]-(WORLD_DEFAULTS.floorY+extentA))<.05,'blob rests on the floor');
 assert.equal(last.sleep[0],1,'settled body must be flagged asleep');
 assert.equal(last.sleep[1],1,'settled box must be flagged asleep');
 // Quaternion arrives intact (identity here).
 assert.equal(last.positions.length,6);
 world.dispose();
});

test('float bodies hover in the altitude band instead of falling',()=>{
 const world=new SplashWorld(R);
 const a=body('blob',[0,0,0],'float',1,3);
 world.spawn([a]);
 const samples=drive(world,300,30); // 2.5 s
 const y=yOf(world,a.id);
 assert.ok(y>WORLD_DEFAULTS.floatHeight-1&&y<WORLD_DEFAULTS.floatHeight+1,`float body must hover near ${WORLD_DEFAULTS.floatHeight}, got ${y}`);
 assert.ok(samples.at(-1).sleep[0]===0,'a forced behavior body never sleeps');
 world.dispose();
});

test('orbit bodies circle the Y axis and settle near the orbit ring',()=>{
 const world=new SplashWorld(R);
 const a=body('ico',[8,1,0],'orbit',1,5);
 world.spawn([a]);
 drive(world,300);
 const p=world.byId.get(a.id).body.translation(),v=world.byId.get(a.id).body.linvel();
 const r=Math.hypot(p.x,p.z);
 assert.ok(Math.abs(r-WORLD_DEFAULTS.orbitRadius)<2,`orbit radius must converge, got ${r}`);
 const tangential=(-p.z*v.x+p.x*v.z)/r; // v . tangent̂
 assert.ok(tangential>1,`orbit must gain tangential speed, got ${tangential}`);
 assert.ok(Math.abs(yOf(world,a.id)-WORLD_DEFAULTS.floatHeight)<1.5,'orbit rides the float band');
 world.dispose();
});

test('wave bodies hold station and oscillate vertically',()=>{
 const world=new SplashWorld(R);
 const a=body('capsule',[5,0,3],'wave',1,7);
 world.spawn([a]);
 // Drive two full wave periods (2π/1.2 ≈ 5.2s) and measure the steady-state
 // second half — the initial transient can overshoot the band.
 let yMin=Infinity,yMax=-Infinity;
 for(let i=0;i<720;i++){
  world.advance(SIM_DT);
  if(i>=360){
   const y=yOf(world,a.id);
   yMin=Math.min(yMin,y);yMax=Math.max(yMax,y);
  }
 }
 const p=world.byId.get(a.id).body.translation();
 assert.ok(Math.abs(p.x-5)<1.5&&Math.abs(p.z-3)<1.5,'wave body must hold its station');
 assert.ok(yMin>-3.5&&yMax<3.5,`wave oscillation must stay bounded, range ${yMin.toFixed(2)}..${yMax.toFixed(2)}`);
 assert.ok(yMax-yMin>.5,`wave body must visibly oscillate, range ${(yMax-yMin).toFixed(2)}`);
 world.dispose();
});

test('bounce bodies rebound off the trampoline plane and never reach the floor',()=>{
 const world=new SplashWorld(R);
 const a=body('box',[0,2,0],'bounce',1,9);
 world.spawn([a]);
 let maxY=-Infinity,minY=Infinity;
 for(let i=0;i<300;i++){
  world.advance(SIM_DT);
  const y=yOf(world,a.id);
  maxY=Math.max(maxY,y);minY=Math.min(minY,y);
 }
 assert.ok(maxY>WORLD_DEFAULTS.bouncePlane+3,'bounce must rebound well above the plane');
 assert.ok(minY>=WORLD_DEFAULTS.floorY,'bounce must never sink through the floor');
 world.dispose();
});

test('pointer attract pulls bodies toward the point, repel pushes away',()=>{
 const target=[5,2,0];
 const attract=new SplashWorld(R);
 const a=body('blob',[0,2,0],'none');
 attract.spawn([a]);
 // Gravity off: the magnet alone must carry the body to the point. (With
 // gravity on, pull ≈ g balance holds the body in a sag equilibrium short of
 // the cursor — realistic, but not what this test isolates.)
 attract.patch({gravity:[0,0,0]});
 attract.setPointer('attract',target,1,6);
 let minD=Infinity;
 for(let i=0;i<180;i++){
  attract.advance(SIM_DT);
  const p=attract.byId.get(a.id).body.translation();
  minD=Math.min(minD,Math.hypot(p.x-target[0],p.y-target[1],p.z-target[2]));
 }
 assert.ok(minD<.5,`attract must carry the body to the point, closest approach ${minD}`);
 attract.dispose();

 const repel=new SplashWorld(R);
 const b=body('blob',[4.9,2,0],'none');
 repel.spawn([b]);
 repel.setPointer('repel',target,1,6);
 drive(repel,60);
 const pr=repel.byId.get(b.id).body.translation();
 assert.ok(Math.hypot(pr.x-target[0],pr.y-target[1])>1,'repel must push the body away');
 repel.dispose();
});

test('radial impulse kicks bodies away from the origin point',()=>{
 const world=new SplashWorld(R);
 const a=body('blob',[0,2,0]),b=body('blob',[0,-1,2]);
 world.spawn([a,b]);
 drive(world,10);
 const center=[0,2,0];
 const before=new Map([[a.id,world.byId.get(a.id).body.translation()],[b.id,world.byId.get(b.id).body.translation()]]);
 world.impulse({p:center,strength:3,radius:8});
 drive(world,20);
 for(const[id,beforePos]of before){
  const p=world.byId.get(id).body.translation();
  const dx=p.x-beforePos.x,dy=p.y-beforePos.y,dz=p.z-beforePos.z;
  const dir=(p.x-center[0])*dx+(p.y-center[1])*dy+(p.z-center[2])*dz;
  assert.ok(dir>0,`impulse must move body ${id} away from the origin`);
 }
 world.dispose();
});

test('config patch applies live: heavier gravity falls faster, floor can move',()=>{
 const drop=new SplashWorld(R);
 const a=body('blob',[0,10,0]);
 drop.spawn([a]);
 const heavy=new SplashWorld(R);
 const b=body('blob',[0,10,0]);
 heavy.spawn([b]);
 heavy.patch({gravity:[0,-20,0]});
 drive(drop,60);drive(heavy,60);
 assert.ok(yOf(heavy,b.id)<yOf(drop,a.id),'stronger gravity must fall further in the same steps');
 drop.dispose();heavy.dispose();

 const moved=new SplashWorld(R);
 const c=body('blob',[0,0,0]);
 moved.spawn([c]);
 moved.patch({floorY:-12});
 drive(moved,420);
 const extent=moved.byId.get(c.id).extent;
 assert.ok(Math.abs(yOf(moved,c.id)-(-12+extent))<.05,'floorY patch must rebuild the floor');
 moved.dispose();
});

test('despawn removes bodies and writePoses ids stay id-mapped',()=>{
 const world=new SplashWorld(R);
 const a=body('blob',[0,0,0]),b=body('ico',[2,0,0]),c=body('box',[4,0,0]);
 world.spawn([a,b,c]);
 assert.equal(world.despawn([b.id,b.id+999]).length,1,'unknown ids are skipped');
 const poses=scratch(3);
 const count=world.writePoses(poses);
 assert.equal(count,2);
 assert.deepEqual(Array.from(poses.ids).slice(0,2),[a.id,c.id].sort((x,y)=>x-y),'compacted order keeps remaining ids');
 world.dispose();
});

test('spawn over capacity rejects the overflow',()=>{
 const world=new SplashWorld(R,{capacity:3});
 const bodies=Array.from({length:5},()=>body('blob',[0,0,0]));
 const{added,rejected}=world.spawn(bodies);
 assert.equal(added.length,3);
 assert.equal(rejected.length,2);
 world.dispose();
});

test('deterministic N-step runs: identical worlds produce identical poses',()=>{
 const build=()=>{
  const world=new SplashWorld(R,{capacity:64});
  const bodies=[];
  const behaviors=['float','orbit','wave','bounce','none'];
  for(let i=0;i<24;i++){
   const gx=(i%6)*1.5-3.75,gz=Math.floor(i/6)*1.5-1.5;
   bodies.push(body(i%2?'blob':'ico',[gx,1+Math.floor(i/6)*.6,gz],behaviors[i%5],1,i+1));
  }
  world.spawn(bodies);
  return world;
 };
 const read=world=>{
  const poses=scratch(64);
  const count=world.writePoses(poses);
  return{count,positions:Float32Array.from(poses.positions.slice(0,count*3)),quaternions:Float32Array.from(poses.quaternions.slice(0,count*4)),sleep:Uint8Array.from(poses.sleep.slice(0,count))};
 };
 const a=build(),b=build();
 drive(a,240);drive(b,240); // 2 sim seconds
 const pa=read(a),pb=read(b);
 assert.equal(pa.count,pb.count);
 for(let i=0;i<pa.positions.length;i++)assert.ok(pa.positions[i]===pb.positions[i],`position ${i} diverged: ${pa.positions[i]} vs ${pb.positions[i]}`);
 for(let i=0;i<pa.quaternions.length;i++)assert.ok(pa.quaternions[i]===pb.quaternions[i],`quaternion ${i} diverged`);
 assert.deepEqual(Array.from(pa.sleep),Array.from(pb.sleep));
 a.dispose();b.dispose();
});

test('drag spring carries the held body to the target; release throws with velocity',()=>{
 const world=new SplashWorld(R);
 const a=body('blob',[0,2,0],'none');
 world.spawn([a]);
 world.drag(a.id,[0,6,0]);
 drive(world,180,180); // 1.5 s
 const p=world.byId.get(a.id).body.translation();
 // Spring sag against gravity is ~g/dragK ≈ 0.12 — well inside the tolerance.
 assert.ok(Math.hypot(p.x,p.y-6,p.z)<.6,`drag must carry the body to the target, hung at y=${p.y.toFixed(2)}`);
 world.releaseDrag(a.id,[0,0,20]);
 const v=world.byId.get(a.id).body.linvel();
 assert.ok(Math.abs(v.z-20)<1e-6,`release must set the throw velocity, got vz=${v.z}`);
 world.dispose();
});

test('drag replaces behavior and pointer forces for the held body',()=>{
 const world=new SplashWorld(R);
 const a=body('blob',[0,2,0],'orbit'); // the orbit layer would fling it around the ring
 world.spawn([a]);
 world.setPointer('repel',[0,6,0],3,10); // hostile magnet right at the drag target
 world.drag(a.id,[0,6,0]);
 drive(world,180,180);
 const p=world.byId.get(a.id).body.translation();
 assert.ok(Math.hypot(p.x,p.y-6,p.z)<.8,'held body must track the target, not the ring or the magnet');
 assert.equal(world.releaseDrag(a.id),true,'release without a velocity keeps the spring velocity');
 assert.equal(world.releaseDrag(a.id),false,'release is one-shot');
 world.dispose();
});

test('drag wakes a sleeping held body',()=>{
 const world=new SplashWorld(R);
 const a=body('blob',[0,0,0],'none');
 world.spawn([a]);
 drive(world,600); // settle and sleep (probed: asleep by step ~420)
 assert.ok(world.byId.get(a.id).body.isSleeping(),'body must be asleep before the grab');
 world.drag(a.id,[0,3,0]);
 drive(world,30);
 assert.ok(!world.byId.get(a.id).body.isSleeping(),'the grab must wake the held body');
 world.dispose();
});

test('despawning the dragged body clears the drag; stale releases never fling',()=>{
 const world=new SplashWorld(R);
 const a=body('blob',[0,2,0]),b=body('ico',[3,2,0]);
 world.spawn([a,b]);
 world.drag(a.id,[0,6,0]);
 world.despawn([a.id]);
 assert.equal(world._drag,null,'a removed body must not stay dragged');
 assert.equal(world.releaseDrag(a.id,[0,0,99]),false,'a stale release must not resurrect the drag');
 world.drag(b.id,[1,1,1]);
 world.releaseDrag(b.id+999); // mismatched id: no-op, drag persists
 assert.ok(world._drag&&world._drag.id===b.id,'mismatched release must leave the drag active');
 world.dispose();
});

test('advance clamps long stalls to MAX_FRAME_DT',()=>{
 const world=new SplashWorld(R);
 const a=body('blob',[0,0,0]);
 world.spawn([a]);
 const steps=world.advance(10); // a 10s stall in one call
 assert.ok(steps<=MAX_FRAME_DT/SIM_DT+1,`stall must be clamped, stepped ${steps} times`);
 world.dispose();
});

test('pointer forces wake sleeping bodies',()=>{
 const world=new SplashWorld(R);
 const a=body('blob',[0,0,0],'none');
 world.spawn([a]);
 drive(world,600); // settle and sleep (probed: asleep by step ~420)
 assert.ok(world.byId.get(a.id).body.isSleeping(),'body must be asleep before the pointer arrives');
 world.setPointer('attract',[0,-5,0],1,6); // aimed at the resting body
 drive(world,30);
 assert.ok(!world.byId.get(a.id).body.isSleeping(),'pointer force must wake the body');
 const p=world.byId.get(a.id).body.translation(),v=world.byId.get(a.id).body.linvel();
 assert.ok(v.y>0.1||p.y>-5.22,'woken body must move under the magnet');
 world.dispose();
});

test('20k bodies: world holds, steps, and writes a full pose frame',()=>{
 const world=new SplashWorld(R,{capacity:20000});
 const bodies=[];
 const presets=['blob','ico','capsule','torus','box'];
 const behaviors=['float','orbit','wave','bounce','none'];
 for(let i=0;i<20000;i++){
  const gx=(i%100)*1.2-59.4,gz=Math.floor(i/100)*1.2-119.4;
  bodies.push({id:i+1,preset:presets[i%5],r:1,p:[gx,1,gz],behavior:behaviors[i%5],seed:i+1});
 }
 const t0=performance.now();
 const{added,rejected}=world.spawn(bodies);
 const spawnMs=performance.now()-t0;
 assert.equal(added.length,20000);
 assert.equal(rejected.length,0);
 const poses=scratch(20000);
 const t1=performance.now();
 world.advance(SIM_DT);
 world.advance(SIM_DT);
 const stepMs=(performance.now()-t1)/2;
 const count=world.writePoses(poses);
 assert.equal(count,20000);
 assert.ok(Array.from(poses.ids).every((v,i)=>v===i+1),'ids must be dense after a full spawn');
 console.log(`[20k sanity] spawn ${spawnMs.toFixed(0)}ms, avg step ${stepMs.toFixed(1)}ms (${(1000/stepMs).toFixed(0)} steps/s equivalent)`);
 world.dispose();
});

test('simHz 60 halves the step rate: a coarser fixed step, not slow motion',()=>{
 const world=new SplashWorld(R,{config:{simHz:60}});
 assert.ok(Math.abs(world.world.timestep-1/60)<1e-6,`timestep ${world.world.timestep}`);
 // Two 1/120 advances accumulate to one 1/60 step.
 const a=world.advance(SIM_DT);
 const b=world.advance(SIM_DT);
 assert.deepEqual([a,b],[0,1]);
 assert.equal(world.frame,1);
 // 120 x 1/120 s of wall time = exactly 60 sim steps.
 world.accumulator=0;
 let steps=0;
 for(let i=0;i<120;i++)steps+=world.advance(SIM_DT);
 assert.equal(steps,60);
 world.dispose();
});

test('patch({simHz}) re-times the world live; out-of-range rates are ignored',()=>{
 const world=new SplashWorld(R);
 world.patch({simHz:60});
 assert.ok(Math.abs(world.world.timestep-1/60)<1e-6);
 assert.equal(world.config.simHz,60);
 const before=world.world.timestep;
 world.patch({simHz:10});   // below the 30 Hz floor
 world.patch({simHz:1000}); // above the 240 Hz ceiling
 world.patch({simHz:'fast' });
 assert.equal(world.world.timestep,before,'an invalid rate must not touch the solver');
 world.dispose();
});

test('behavior time advances by the configured step dt',()=>{
 const world=new SplashWorld(R,{config:{simHz:60}});
 const desc=body('blob',[0,0,0],'float');
 world.spawn([desc]);
 world.advance(1/60);
 assert.ok(Math.abs(world.byId.get(desc.id).time-1/60)<1e-9);
 world.dispose();
});

