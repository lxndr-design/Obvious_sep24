import {birdSpecies} from './bird-gait.js';
// Slightly favor smaller birds without making large visitors rare.
export const sampleBirdScale=random=>.75+.5*Math.pow(random(),1.3);
export const birdScale=bird=>bird?.scale??1;
export const birdFootHeight=bird=>.08*birdScale(bird);
export const birdHopTempo=bird=>Math.pow(birdScale(bird),1.5);
export const birdSpacing=(a,b)=>.22*(birdScale(a)+birdScale(b));
export const smallBird=bird=>birdScale(bird)<1;
export const canNoticeSeed=bird=>!(bird.seedSearchWait>0)&&!bird.carriedStick&&bird.fullness<bird.capacity&&(
 ['foraging','perching','bathing','hopping'].includes(bird.state)||bird.state==='lingering'&&bird.age>1);
export function groundHopHeight(bird,dt){
 if(birdSpecies(bird)==='pigeon')return 0;
 bird.groundHopPhase=((bird.groundHopPhase??0)+dt*17/birdHopTempo(bird))%(Math.PI*2);
 return Math.max(0,Math.sin(bird.groundHopPhase))*.024*birdScale(bird);
}
