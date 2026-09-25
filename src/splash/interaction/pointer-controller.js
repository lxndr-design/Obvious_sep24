import {HOLD_MS,CLICK_SLOP_NDC,POINTER_RADIUS,SHOCKWAVE_STRENGTH,SHOCKWAVE_RADIUS,pointerVelocity} from './pointer-plane.js';

// DOM-free input state machine for the banner's cursor physics. The entry's
// event adapter feeds this NDC coordinates and timestamps; the kit carries the
// scene mapping (screenToPlane), picking (pickBody) and the protocol sends.
//
// Grammar (spec: attract, repel, shockwave, drag-throw):
//  - move                          -> attract magnet follows the cursor
//  - press + quick release (click) -> radial shockwave at the plane point
//  - press held past HOLD_MS       -> repel until release
//  - right press/drag              -> repel for the duration
//  - press on a body               -> drag it (spring pull); release throws
//                                    with the pointer's recent plane velocity
//
// A left press on empty space stays undecided until movement beyond the slop
// or the hold timeout resolves the intent: a quick settled click must
// shockwave without repel scatter contaminating it, and a hold must become a
// repel even when the pointer never fires another move event (tick() covers
// the silent hold).

export function createPointerController({kit,holdMs=HOLD_MS,slop=CLICK_SLOP_NDC}={}){
 let mode='idle';  // idle | hover | press | repel | drag
 let lastP=null;   // most recent plane point — the attract/repel anchor
 let press=null;   // {t,ndc} while a left press is undecided
 let drag=null;    // {id,through} while a body is dragged
 let samples=[];   // timestamped plane samples for the release throw

 function setPointer(modeName,p){kit.setPointer(modeName,1,POINTER_RADIUS,p);}

 function move(x,y,now){
  if(mode==='drag'){
   const p=kit.screenToPlane(x,y,drag.through);
   if(p){
    samples.push({t:now,p});
    if(samples.length>32)samples.shift();
    kit.drag(drag.id,p);
    lastP=p;
   }
   return mode;
  }
  const p=kit.screenToPlane(x,y);
  if(p)lastP=p;
  if(mode==='press'){
   // Undecided press: the first real movement commits to repel; until then
   // the hover magnet keeps following the pointer so a click stays clean.
   if(Math.hypot(x-press.ndc[0],y-press.ndc[1])>slop){
    press=null;
    mode='repel';
    if(p)setPointer('repel',p);
   }else if(p){
    setPointer('attract',p);
   }
  }else if(mode==='repel'){
   if(p)setPointer('repel',p);
  }else if(p){
   setPointer('attract',p);
   mode='hover';
  }
  return mode;
 }

 function down(x,y,now,button){
  if(mode==='drag')return mode; // one interaction at a time
  if(button===2){
   // Right button repels for its whole press, over bodies and space alike.
   mode='repel';
   press=null;
   const p=kit.screenToPlane(x,y);
   if(p){lastP=p;setPointer('repel',p);}
   return mode;
  }
  if(button!==0)return mode;
  const picked=kit.pickBody(x,y);
  if(picked){
   mode='drag';
   drag={id:picked.id,through:[...picked.position]};
   lastP=[...picked.position];
   samples=[{t:now,p:lastP}];
   kit.drag(picked.id,lastP); // target starts at the body: no initial yank
  }else{
   mode='press';
   press={t:now,ndc:[x,y]};
  }
  return mode;
 }

 function up(x,y,now,button){
  if(button===2){
   if(mode==='repel'){mode='hover';if(lastP)setPointer('attract',lastP);}
   return mode;
  }
  if(button!==0)return mode;
  if(mode==='drag'){
   const id=drag.id;
   const v=pointerVelocity(samples,now);
   kit.dragRelease(id,v??undefined);
   drag=null;samples=[];
   mode='hover';
   if(lastP)setPointer('attract',lastP); // the magnet resumes where the throw left off
   return mode;
  }
  if(mode==='press'){
   const clicked=now-press.t<=holdMs
    &&Math.hypot(x-press.ndc[0],y-press.ndc[1])<=slop;
   press=null;
   mode='hover';
   if(clicked){
    const p=kit.screenToPlane(x,y);
    if(p)kit.shockwave(p,SHOCKWAVE_STRENGTH,SHOCKWAVE_RADIUS);
   }
   if(lastP)setPointer('attract',lastP);
   return mode;
  }
  if(mode==='repel'){ // left up without a matching down (capture edge)
   mode='hover';
   if(lastP)setPointer('attract',lastP);
  }
  return mode;
 }

 // Silent-hold resolution: the entry calls this from a low-frequency timer so
 // a still press becomes a repel even with no further move events.
 function tick(now){
  if(mode==='press'&&now-press.t>holdMs){
   press=null;
   mode='repel';
   if(lastP)setPointer('repel',lastP);
  }
  return mode;
 }

 function leave(){
  if(mode==='drag'&&drag)kit.dragRelease(drag.id); // cancel without a throw
  drag=null;samples=[];press=null;
  mode='idle';
  kit.setPointer('off',0,POINTER_RADIUS,[0,0,0]);
  return mode;
 }

 return{
  move,down,up,tick,leave,
  get mode(){return mode;},
 };
}
