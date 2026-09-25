import test from 'node:test';
import assert from 'node:assert/strict';
import {PerfGovernor,tierPlan,GOVERNOR_TIERS,GOVERNOR_DEFAULTS} from '../src/splash/core/governor.js';

// The governor ladder is pure decision logic — node --test drives it with
// synthetic fps sequences; the kit wiring applies the published plan.

const OVER=10;  // clearly over budget (frameBudgetMs 18 -> stable needs >= 55.6 fps)
const OK=60;    // clearly stable

test('tierPlan: each tier pulls exactly one lever, cumulatively',()=>{
 const base={basePixelRatioCap:1.75,baseCapacity:24000,baseSimHz:120};
 const plan0=tierPlan(0,base);
 assert.equal(plan0.pixelRatioCap,1.75);
 assert.equal(plan0.capacity,24000);
 assert.equal(plan0.simHz,120);
 assert.equal(plan0.bumpDetail,true);

 const plan1=tierPlan(1,base); // tier 1: pixel ratio steps down, floor 1.0
 assert.equal(plan1.pixelRatioCap,1.5);
 assert.equal(plan1.capacity,24000);
 assert.equal(plan1.simHz,120);
 assert.equal(plan1.bumpDetail,true);

 const plan2=tierPlan(2,base); // tier 2: instance cap -25%
 assert.equal(plan2.pixelRatioCap,1.5);
 assert.equal(plan2.capacity,18000);
 assert.equal(plan2.simHz,120);

 const plan3=tierPlan(3,base); // tier 3: physics 120 -> 60 Hz
 assert.equal(plan3.simHz,60);
 assert.equal(plan3.bumpDetail,true);

 const plan4=tierPlan(4,base); // tier 4: bump fragment detail off
 assert.equal(plan4.bumpDetail,false);
 assert.equal(plan4.simHz,60,'earlier tiers hold while degrading further');
});

test('tierPlan clamps out-of-range tiers and honors the pixel-ratio floor',()=>{
 assert.equal(tierPlan(-3).tier,0);
 assert.equal(tierPlan(9).tier,GOVERNOR_TIERS);
 const floored=tierPlan(1,{basePixelRatioCap:1.1});
 assert.equal(floored.pixelRatioCap,GOVERNOR_DEFAULTS.pixelRatioFloor);
});

test('degrades one tier after 60 consecutive over-budget frames',()=>{
 const g=new PerfGovernor({});
 let fired=[];
 g.onTier=t=>fired.push(t);
 for(let i=0;i<59;i++)g.tick(OVER);
 assert.equal(g.tier,0,'streak below the threshold must not degrade');
 g.tick(OVER);
 assert.equal(g.tier,1);
 assert.deepEqual(fired,[1]);
});

test('keeps degrading to the top tier and clamps there',()=>{
 const g=new PerfGovernor({});
 for(let i=0;i<GOVERNOR_TIERS*60;i++)g.tick(OVER);
 assert.equal(g.tier,GOVERNOR_TIERS);
 for(let i=0;i<600;i++)g.tick(OVER);
 assert.equal(g.tier,GOVERNOR_TIERS,'the ladder has a floor of quality, not a pit');
});

test('recovers one tier after 300 stable frames',()=>{
 const g=new PerfGovernor({});
 g.tier=1; // placed by the plan wiring in real runs; the ladder only climbs from here
 let fired=[];
 g.onTier=t=>fired.push(t);
 for(let i=0;i<299;i++)g.tick(OK);
 assert.equal(g.tier,1,'recovery streak below the threshold must not climb');
 g.tick(OK);
 assert.equal(g.tier,0);
 assert.deepEqual(fired,[0]);
});

test('stable frames reset the over-budget streak (and vice versa)',()=>{
 const g=new PerfGovernor({});
 for(let i=0;i<59;i++)g.tick(OVER);
 for(let i=0;i<10;i++)g.tick(OK);
 for(let i=0;i<59;i++)g.tick(OVER);
 assert.equal(g.tier,0,'the over-budget streak was interrupted');
 g.tick(OVER); // 60th consecutive over-budget frame
 assert.equal(g.tier,1);
});

test('a NaN fps sample is neither stable nor over-budget',()=>{
 const g=new PerfGovernor({});
 for(let i=0;i<59;i++)g.tick(OVER);
 for(let i=0;i<100;i++)g.tick(NaN);
 assert.equal(g.tier,0,'cold-start frames must not spend the ladder');
 const warm=new PerfGovernor({});
 warm.tick(OK);
 warm.tier=1; warm.overStreak=0;
 for(let i=0;i<400;i++)warm.tick(NaN);
 assert.equal(warm.tier,1,'NaN neither recovers nor degrades');
});
