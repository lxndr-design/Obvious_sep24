// PerfGovernor — closes the loop between frame cost and scene cost (spec:
// "the governor trades quality for frame budget"). DOM-free: it observes the
// engine's fps estimate and publishes a tier; the kit applies the tier plan
// (pixel ratio, instance cap, sim rate, bump detail) so node --test can drive
// the ladder with synthetic fps sequences.
//
// Ladder (spec): frame ms > budget for `degradeFrames` consecutive frames
// steps one tier down the quality ladder; `recoverFrames` stable frames steps
// one tier back up. One lever per tier, applied cumulatively:
//   tier 1  pixelRatio down a step (floor 1.0)
//   tier 2  instance cap -25% (despawn oldest, pooled)
//   tier 3  physics 120 -> 60 Hz with pose interpolation
//   tier 4  bump fragment detail off
// Tier 0 is everything at full quality. A NaN/unwarmed fps sample is neither
// over-budget nor stable — a cold first second must not spend the ladder.

export const GOVERNOR_TIERS=4;

export const GOVERNOR_DEFAULTS={
 frameBudgetMs:18,
 degradeFrames:60,
 recoverFrames:300,
 pixelRatioStep:.25,
 pixelRatioFloor:1,
 capShrink:.75,
};

// What must hold while the governor sits at `tier` — a pure function of tier
// and the kit's base capacities, so every (de/re)escalation applies the whole
// plan idempotently instead of accumulating deltas.
export function tierPlan(tier,{
 basePixelRatioCap=1.75,baseCapacity=24000,baseSimHz=120,
 pixelRatioStep=GOVERNOR_DEFAULTS.pixelRatioStep,pixelRatioFloor=GOVERNOR_DEFAULTS.pixelRatioFloor,
 capShrink=GOVERNOR_DEFAULTS.capShrink,
}={}){
 const t=Math.max(0,Math.min(GOVERNOR_TIERS,tier|0));
 return{
  tier:t,
  pixelRatioCap:t>=1?Math.max(pixelRatioFloor,basePixelRatioCap-pixelRatioStep):basePixelRatioCap,
  capacity:t>=2?Math.floor(baseCapacity*capShrink):baseCapacity,
  simHz:t>=3?baseSimHz/2:baseSimHz,
  bumpDetail:t<4,
 };
}

export class PerfGovernor{
 constructor({getFps,onTier,config}={}){
  this.getFps=getFps??(()=>NaN);
  this.onTier=onTier??(()=>{});
  this.config={...GOVERNOR_DEFAULTS,...config};
  this.tier=0;
  this.overStreak=0;
  this.stableStreak=0;
 }

 // One rendered frame. Returns the current tier; tier changes fire onTier so
 // the wiring applies the new plan (never called for the initial tier 0 —
 // the kit applies that plan at construction).
 tick(fps=this.getFps()){
  const{frameBudgetMs,degradeFrames,recoverFrames}=this.config;
  const stable=Number.isFinite(fps)&&fps>=1000/frameBudgetMs;
  if(stable){
   this.overStreak=0;
   if(this.tier>0&&++this.stableStreak>=recoverFrames){
    this.stableStreak=0;
    this.tier--;
    this.onTier(this.tier);
   }
  }else if(Number.isFinite(fps)){
   this.stableStreak=0;
   if(++this.overStreak>=degradeFrames&&this.tier<GOVERNOR_TIERS){
    this.overStreak=0;
    this.tier++;
    this.onTier(this.tier);
   }
  }
  return this.tier;
 }
}
