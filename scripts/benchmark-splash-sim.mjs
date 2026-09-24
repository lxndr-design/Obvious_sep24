// Headless step benchmark for the Splash sim world — 20k rigid bodies, the
// splash spec's scale target. Run: node scripts/benchmark-splash-sim.mjs
import RAPIER from '@dimforge/rapier3d-compat';
import {SplashWorld,SIM_DT} from '../src/splash/sim/splash-world.js';

await RAPIER.init();
const R=RAPIER;

const COUNT=20000,STEPS=120,WARMUP=20;
const presets=['blob','ico','capsule','torus','box'];
const behaviors=['float','orbit','wave','bounce','none'];

const world=new SplashWorld(R,{capacity:COUNT});
const bodies=[];
for(let i=0;i<COUNT;i++){
 const gx=(i%100)*1.2-59.4,gz=Math.floor(i/100)*1.2-119.4;
 bodies.push({id:i+1,preset:presets[i%5],r:1,p:[gx,1+((i/100|0)%4)*1.5,gz],behavior:behaviors[i%5],seed:i+1});
}

const t0=performance.now();
const{added,rejected}=world.spawn(bodies);
const spawnMs=performance.now()-t0;

// Warm up JIT + Rapier's internal state before measuring.
for(let i=0;i<WARMUP;i++)world.advance(SIM_DT);

const stepMs=[];
const poses={positions:new Float32Array(COUNT*3),quaternions:new Float32Array(COUNT*4),sleep:new Uint8Array(COUNT),ids:new Uint32Array(COUNT)};
let poseMs=0;
for(let i=0;i<STEPS;i++){
 const t=performance.now();
 world.advance(SIM_DT);
 stepMs.push(performance.now()-t);
 const tp=performance.now();
 world.writePoses(poses);
 poseMs+=performance.now()-tp;
}

const sorted=[...stepMs].sort((a,b)=>a-b);
const pct=q=>sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))];
const avg=stepMs.reduce((a,b)=>a+b,0)/stepMs.length;
const report={
 bodies:added.length,rejected:rejected.length,
 spawnMs:+spawnMs.toFixed(1),
 steps:STEPS,
 avgStepMs:+avg.toFixed(3),
 p50StepMs:+pct(.5).toFixed(3),
 p95StepMs:+pct(.95).toFixed(3),
 maxStepMs:+sorted.at(-1).toFixed(3),
 avgPoseWriteMs:+(poseMs/STEPS).toFixed(3),
 stepsPerSecondEquivalent:+(1000/avg).toFixed(0),
 stepBudgetMsPerFrameAt60Hz:16.7,
 worldFrame:world.frame,
};
console.log(JSON.stringify(report,null,2));
world.dispose();
