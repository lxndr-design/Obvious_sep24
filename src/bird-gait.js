export const birdSpecies=bird=>bird.species??((bird.id-1)%5===3?'pigeon':'songbird');
// Landing alignment for a steered arrival leg: across the final stretch the
// approach eases down (returns a speed multiplier in [.3,1]) so touch-down is
// planted rather than skidded. Pure math; the flight stepper applies it as a
// multiplier on speed x dt, so the velocity bound still holds and the leg
// still completes at u=1.
export function landingEase(u,reach=.28){
 if(reach<=0)return 1;
 const t=Math.min(1,Math.max(0,(u-(1-reach))/reach));
 return 1-.7*t*t*(3-2*t);
}
export function updateBirdGait(bird,previous,dt){
 const distance=Math.hypot(bird.position.x-previous.x,bird.position.z-previous.z);
 const walking=birdSpecies(bird)==='pigeon'&&['foraging','feeding'].includes(bird.state)&&distance>1e-5;
 if(walking)bird.stridePhase=((bird.stridePhase??0)+distance/(.16*(bird.scale??1)))%1;
 // A long hold followed by a quick forward thrust, driven by distance travelled.
 const phase=bird.stridePhase??0,hold=phase<.72?1-phase/.72:(phase-.72)/.28;
 const target=walking?(hold-.5)*.042:0;
 bird.headBob=(bird.headBob??0)+(target-(bird.headBob??0))*(1-Math.exp(-25*dt));
}
export function poseDuckGait(view,duck,dt){
 const speed=Math.hypot(duck.velocity.x,duck.velocity.z),walking=duck.state==='walking'&&!duck.swimming;
 const flying=duck.state==='arriving'||duck.state==='departing';
 const desired=walking?Math.min(1,speed/.25):0;
 view.walkBlend=(view.walkBlend??0)+(desired-(view.walkBlend??0))*(1-Math.exp(-12*dt));
 view.flightBlend=(view.flightBlend??0)+((flying?1:0)-(view.flightBlend??0))*(1-Math.exp(-12*dt));
 view.flapPhase=(view.flapPhase??duck.id??0)+dt*22;
 view.wings.forEach((wing,i)=>{const sign=i===0?-1:1;wing.rotation.set(sign*Math.sin(view.flapPhase)*.7*view.flightBlend,sign*1.25*view.flightBlend,0,'XYZ');});
 const phase=duck.stepPhase??0,blend=walking?view.walkBlend:0;
 view.group.rotation.set(Math.sin(phase)*.12*blend,duck.yaw,flying?(duck.flightPitch??0):(duck.dabbleAngle??0)+(duck.tilt??0),'YXZ');
 view.legPivots.forEach((pivot,i)=>{
  const step=Math.sin(phase+i*Math.PI);pivot.rotation.z=step*.32*blend;pivot.position.y=-.035+Math.max(0,step)*.025*blend;
  view.feet[i].visible=view.legs[i].visible=!duck.swimming&&!flying;
 });
}
