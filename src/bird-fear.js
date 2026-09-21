// Caution already controls food reactions; its inverse is bravery.
export const fleeDelay=bird=>.12+(1-Math.max(0,Math.min(1,bird.caution??.5)))*1.8;
export function scheduleFlee(bird,time,threat,random){
 if(bird.state==='departing'||bird.fleeAt!=null)return false;
 bird.caution??=random();bird.fleeAt=time+fleeDelay(bird);bird.fleeThreat=threat?.clone()??null;
 // Stop feeding/collecting while alert, without holding food hostage.
 bird.seedField?.release(bird.id);bird.stickCollection?.release(bird.id);
 return true;
}
