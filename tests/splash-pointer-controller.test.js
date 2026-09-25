import test from 'node:test';
import assert from 'node:assert/strict';
import {createPointerController} from '../src/splash/interaction/pointer-controller.js';
import {THROW_SCALE,HOLD_MS,CLICK_SLOP_NDC} from '../src/splash/interaction/pointer-plane.js';

// Headless drive of the input state machine against a fake kit. The fake
// records every protocol send; screenToPlane is a linear map so drag targets
// visibly track the pointer and release velocities are computable by hand.
function fakeKit(){
 const kit={
  sent:[],picked:null,
  setPointer(mode,strength,radius,p){kit.sent.push({kind:'pointer',mode,strength,radius,p});},
  shockwave(p,strength,radius){kit.sent.push({kind:'impulse',p,strength,radius});},
  drag(id,p){kit.sent.push({kind:'drag',id,p});},
  dragRelease(id,v){kit.sent.push({kind:'dragRelease',id,v});},
  pickBody(){return kit.picked;},
  screenToPlane(x,y,through){
   return through?[through[0]+x*4,through[1],through[2]]:[x*4,y*4,0];
  },
 };
 return kit;
}
const kinds=(kit,name)=>kit.sent.filter(m=>m.kind===name);
const make=kit=>createPointerController({kit});

test('hover move sends attract with the mapped plane point',()=>{
 const kit=fakeKit(),c=make(kit);
 c.move(.25,0,10);
 const ptr=kinds(kit,'pointer');
 assert.equal(ptr.length,1);
 assert.equal(ptr[0].mode,'attract');
 assert.deepEqual(ptr[0].p,[1,0,0]);
});

test('quick settled click shockwaves the press point without ever repelling',()=>{
 const kit=fakeKit(),c=make(kit);
 c.move(.25,0,90);        // hover establishes the magnet
 c.down(.25,0,100,0);     // press on empty space
 c.up(.25,0,140,0);       // release fast, no movement
 const impulse=kinds(kit,'impulse');
 assert.equal(impulse.length,1,'the click must shockwave exactly once');
 assert.deepEqual(impulse[0].p,[1,0,0]);
 assert.ok(kinds(kit,'pointer').every(m=>m.mode!=='repel'),'a click must not scatter');
 assert.equal(kinds(kit,'pointer').at(-1).mode,'attract','the magnet resumes after the click');
});

test('hold past the timeout becomes repel exactly once; ticks never resend',()=>{
 const kit=fakeKit(),c=make(kit);
 c.move(.25,0,90);
 c.down(.25,0,100,0);
 c.tick(100+HOLD_MS+1);
 assert.equal(kinds(kit,'pointer').filter(m=>m.mode==='repel').length,1,'the hold must switch to repel');
 c.tick(100+HOLD_MS+500);
 assert.equal(kinds(kit,'pointer').filter(m=>m.mode==='repel').length,1,'ticks must not resend repel');
 c.up(.25,0,100+HOLD_MS+500,0);
 assert.equal(kinds(kit,'pointer').at(-1).mode,'attract','release restores the magnet');
});

test('movement beyond the slop during a press becomes repel and never shockwaves',()=>{
 const kit=fakeKit(),c=make(kit);
 c.move(.25,0,90);
 c.down(.25,0,100,0);
 c.move(.25+CLICK_SLOP_NDC*2,0,110,0);
 assert.equal(kinds(kit,'pointer').filter(m=>m.mode==='repel').length,1,'dragging a press repels');
 c.up(.25+CLICK_SLOP_NDC*2,0,120,0);
 assert.equal(kinds(kit,'impulse').length,0,'a moved press is a repel, not a click');
 assert.equal(kinds(kit,'pointer').at(-1).mode,'attract');
});

test('right press repels for the duration; right release restores the magnet',()=>{
 const kit=fakeKit(),c=make(kit);
 c.move(.25,0,90);
 c.down(.25,0,100,2);
 assert.equal(kinds(kit,'pointer').filter(m=>m.mode==='repel').length,1,'right-down repels immediately');
 c.move(.5,0,140,2);
 assert.equal(kinds(kit,'pointer').filter(m=>m.mode==='repel').length,2,'repel follows the pointer');
 c.up(.5,0,180,2);
 assert.equal(kinds(kit,'impulse').length,0,'right release never shockwaves');
 assert.equal(kinds(kit,'pointer').at(-1).mode,'attract');
});

test('body press drags with a spring target; release throws pointer velocity',()=>{
 const kit=fakeKit(),c=make(kit);
 kit.picked={id:7,position:[2,0,0]};
 c.down(0,0,100,0);
 assert.deepEqual(kinds(kit,'drag')[0],{kind:'drag',id:7,p:[2,0,0]},'the grab targets the body where it is');
 c.move(.25,0,140);
 c.move(.5,0,180);
 const drags=kinds(kit,'drag');
 assert.equal(drags.length,3);
 assert.deepEqual(drags.at(-1).p,[4,0,0],'the target tracks the cursor');
 assert.equal(kinds(kit,'pointer').length,0,'no pointer force is sent while dragging');
 c.up(.5,0,220,0);
 const release=kinds(kit,'dragRelease')[0];
 assert.equal(release.id,7);
 assert.ok(Math.abs(release.v[0]-1/.04*THROW_SCALE)<1e-9,`throw must be the differenced pointer velocity, got ${release.v[0]}`);
 assert.equal(release.v[1],0);
 assert.equal(release.v[2],0);
 assert.equal(kinds(kit,'pointer').at(-1).mode,'attract','the magnet resumes where the throw left off');
});

test('instant grab-release throws nothing',()=>{
 const kit=fakeKit(),c=make(kit);
 kit.picked={id:3,position:[0,0,0]};
 c.down(0,0,100,0);
 c.up(0,0,110,0);
 const release=kinds(kit,'dragRelease')[0];
 assert.equal(release.id,3);
 assert.equal(release.v,undefined,'one sample is not a velocity');
});

test('leave during a drag cancels without a throw and turns the pointer off',()=>{
 const kit=fakeKit(),c=make(kit);
 kit.picked={id:5,position:[1,1,1]};
 c.down(0,0,100,0);
 c.leave();
 const release=kinds(kit,'dragRelease')[0];
 assert.equal(release.id,5);
 assert.equal(release.v,undefined,'a cancelled drag never throws');
 assert.deepEqual(kinds(kit,'pointer').at(-1),{kind:'pointer',mode:'off',strength:0,radius:6,p:[0,0,0]});
});

test('leave while hovering turns the pointer off',()=>{
 const kit=fakeKit(),c=make(kit);
 c.move(.25,0,10);
 c.leave();
 assert.equal(kinds(kit,'pointer').at(-1).mode,'off');
 assert.equal(c.mode,'idle');
});
