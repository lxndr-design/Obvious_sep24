import test from 'node:test';
import assert from 'node:assert/strict';
import {createSectionActivation,observeSections,createSectionRuntime,scaledKit,backgroundInk,ACTIVATION_THRESHOLD} from '../src/splash/demo/column.js';
import {VARIANTS,FEEL_PRESETS} from '../src/splash/demo/variants.js';

// Activation state machine + observer adapter + per-section runtime
// (spec art_WSIRxV9E): kits materialize on scroll approach, exactly once, and
// fully pause off-screen. The IntersectionObserver is faked; the runtime is
// driven with fake kits, so no DOM or WebGL is involved.

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function fakeKit(options={}){
 const kit={
  calls:[],
  options,
  stats(){return{active:options.active??0,sleeping:options.sleeping??0,simHz:120,tier:0};},
  setActive(active){
   kit.calls.push(['setActive',active]);
   // The real facade fires onReseed on every activation of a fresh world;
   // the fake reproduces that contract for the runtime's reseed path.
   if(active&&options.onReseed)options.onReseed();
  },
  sim:{send(msg){kit.calls.push(['sim',msg.type,{...msg.patch}]);}},
  dispose(){kit.calls.push(['dispose']);},
 };
 return kit;
}

function fakeRuntime(variant,options={}){
 const kits=[];
 const created=[];
 const runtime=createSectionRuntime({
  variant,
  reducedMotion:()=>options.reduced??false,
  parkDelay:options.parkDelay??20,
  pollEveryMs:options.pollEveryMs??5,
  onKitCreated:(v,kit)=>created.push(v.id),
  kitFactory:({onReseed})=>{
   const kit=fakeKit({...options,onReseed});
   kits.push(kit);
   return{kit,tool:{requestRegen(){kit.calls.push(['regen']);}}};
  },
 });
 return{runtime,kits,created};
}

test('activation machine: idle→active, no-op re-entry, exit pauses, re-enter resumes',()=>{
 const events=[];
 const machine=createSectionActivation({onActivate:()=>events.push('activate'),onPause:()=>events.push('pause')});
 assert.equal(machine.state,'idle');
 assert.equal(machine.enter(),'active');
 assert.equal(machine.state,'active');
 assert.deepEqual(events,['activate']);
 machine.enter(); // repeated observer events must not re-activate
 assert.deepEqual(events,['activate']);
 machine.exit();
 assert.equal(machine.state,'paused');
 assert.deepEqual(events,['activate','pause']);
 machine.exit(); // exiting twice must not re-pause
 assert.deepEqual(events,['activate','pause']);
 machine.enter();
 assert.equal(machine.state,'active');
 assert.deepEqual(events,['activate','pause','activate']);
});

test('an onActivate throwing leaves the machine idle for retry',()=>{
 const machine=createSectionActivation({onActivate:()=>{throw new Error('boom');}});
 assert.throws(()=>machine.enter(),/boom/);
 assert.equal(machine.state,'idle');
});

test('an exit landing during arming queues the pause',()=>{
 let machine=null;
 const paused=[];
 machine=createSectionActivation({
  onActivate:()=>machine.exit(),
  onPause:()=>paused.push(true),
 });
 machine.enter();
 assert.equal(machine.state,'paused');
 assert.deepEqual(paused,[true]);
});

test('observer adapter: threshold gating, enter and exit wiring, all sections observed',()=>{
 class FakeIO{
  constructor(cb,opts){this.cb=cb;this.opts=opts;this.observed=[];}
  observe(el){this.observed.push(el);}
  disconnect(){}
 }
 const entered=[],exited=[];
 const a={id:'a'},b={id:'b'};
 const io=observeSections({sections:[a,b],onEnter:s=>entered.push(s.id),onExit:s=>exited.push(s.id),IO:FakeIO});
 assert.equal(io.opts.threshold,ACTIVATION_THRESHOLD);
 assert.deepEqual(io.observed,[a,b]);
 fire([{target:a,isIntersecting:true,intersectionRatio:.9}]);
 assert.deepEqual(entered,['a']);
 fire([{target:a,isIntersecting:true,intersectionRatio:.2}]); // approach band: no event
 assert.deepEqual(entered,['a']);
 assert.deepEqual(exited,[]);
 fire([{target:a,isIntersecting:false,intersectionRatio:0}]);
 assert.deepEqual(exited,['a']);
 fire([{target:a,isIntersecting:true,intersectionRatio:ACTIVATION_THRESHOLD}]); // exactly at threshold
 assert.deepEqual(entered,['a','a']);
 function fire(entries){io.cb(entries);}
});

test('runtime: kit is created lazily and exactly once',()=>{
 const{runtime,kits,created}=fakeRuntime(VARIANTS[0]);
 assert.equal(kits.length,0,'no kit before the section approaches');
 runtime.enter();
 assert.equal(kits.length,1);
 assert.deepEqual(created,['chrome']);
 runtime.enter(); // repeated intersect events
 runtime.enter();
 assert.equal(kits.length,1,'repeated observer events must never re-create the kit');
});

test('runtime: activation and pause drive the kit facade; re-entry never re-creates',()=>{
 const{runtime,kits}=fakeRuntime(VARIANTS[0]);
 runtime.enter();
 runtime.exit();
 runtime.enter();
 runtime.exit();
 const kit=kits[0];
 const calls=kit.calls.filter(([type])=>type==='setActive').map(([,active])=>active);
 assert.deepEqual(calls,[true,false,true,false]);
 assert.equal(kits.length,1);
 assert.equal(runtime.state,'paused');
});

test('runtime: the first activation reseeds — world config before the spawn',()=>{
 const{runtime,kits}=fakeRuntime(VARIANTS[0]);
 runtime.enter();
 const kit=kits[0];
 assert.ok(kit.calls.some(([t,kind,patch])=>t==='sim'&&kind==='config'&&patch.gravity!==undefined),'feel config sent on reseed');
 assert.ok(kit.calls.some(([t])=>t==='regen'),'series respawned on reseed');
 const configIdx=kit.calls.findIndex(([t])=>t==='sim');
 const regenIdx=kit.calls.findIndex(([t])=>t==='regen');
 assert.ok(configIdx>=0&&regenIdx>configIdx,'config must ride before the spawn');
});

test('runtime: a chosen feel survives pause/resume reseeds',()=>{
 const{runtime,kits}=fakeRuntime(VARIANTS[0]);
 runtime.enter();
 runtime.setFeel('chaotic');
 runtime.exit();
 runtime.enter();
 const kit=kits[0];
 const configs=kit.calls.filter(([t])=>t==='sim').map(([,kind,patch])=>patch);
 assert.ok(configs.length>=2);
 assert.deepEqual(configs.at(-1),{...FEEL_PRESETS.chaotic,simHz:120},'reseed re-applies the panel-chosen feel, not the variant default');
});

test('runtime: setFeel validates against the whitelist',()=>{
 const{runtime}=fakeRuntime(VARIANTS[0]);
 assert.throws(()=>runtime.setFeel('violent'),/Unknown physics feel/);
 assert.equal(runtime.setFeel('grounded'),'grounded');
});

test('runtime: a failing kit factory is surfaced, never swallowed',()=>{
 let error=null;
 const runtime=createSectionRuntime({
  variant:VARIANTS[0],
  kitFactory:()=>{throw new Error('no WebGL');},
  onError:(v,e)=>{error=e;},
 });
 assert.equal(runtime.enter(),'idle');
 assert.equal(runtime.state,'idle');
 assert.match(String(error),/no WebGL/);
 assert.equal(runtime.lost,true);
 runtime.enter(); // stays idle, does not retry into a broken factory loop
 assert.equal(runtime.state,'idle');
});

test('reduced motion parks the section once poses settle, and wakes on interaction',async()=>{
 const{runtime,kits}=fakeRuntime(VARIANTS[0],{reduced:true,active:2,sleeping:1,parkDelay:20,pollEveryMs:5});
 runtime.enter();
 assert.equal(runtime.state,'active');
 await sleep(60); // poll sees bodies → park timer fires
 assert.equal(runtime.state,'paused');
 assert.deepEqual(kits[0].calls.filter(([t])=>t==='setActive').map(([,a])=>a),[true,false]);
 runtime.noteInteraction();
 assert.equal(runtime.state,'active','interaction re-enters a parked section');
});

test('reduced motion with a settled world parks via the same path',async()=>{
 const{runtime}=fakeRuntime(VARIANTS[0],{reduced:true,active:0,sleeping:3,parkDelay:20,pollEveryMs:5});
 runtime.enter();
 await sleep(60);
 assert.equal(runtime.state,'paused');
});

test('runtime dispose tears the kit down',()=>{
 const{runtime,kits}=fakeRuntime(VARIANTS[0]);
 runtime.enter();
 runtime.dispose();
 assert.ok(kits[0].calls.some(([t])=>t==='dispose'));
});

test('scaledKit resolves lazily and scales every force channel',()=>{
 const calls=[];
 const kit={
  setPointer:(mode,strength,radius,p)=>calls.push(['pointer',mode,strength]),
  shockwave:(p,strength,radius)=>calls.push(['shock',strength]),
  drag:id=>calls.push(['drag',id]),
  dragRelease:(id,v)=>calls.push(['throw',v]),
  screenToPlane:()=>[0,0,0],
  pickBody:()=>null,
 };
 const scaled=scaledKit(()=>kit,{attract:.6,repel:2.5,shockwave:1.4,throw:1.8});
 scaled.setPointer('attract',1,[0,0,0],{});
 scaled.setPointer('repel',1,[0,0,0],{});
 scaled.shockwave([0,0,0],1,5);
 scaled.dragRelease(3,[1,2,3]);
 assert.deepEqual(calls,[
  ['pointer','attract',.6],
  ['pointer','repel',2.5],
  ['shock',1.4],
  ['throw',[1.8,3.6,5.4]],
 ]);
});

test('scaledKit is safe before the kit exists (no throw, no call)',()=>{
 const scaled=scaledKit(()=>null,{attract:.6});
 assert.doesNotThrow(()=>scaled.setPointer('attract',1,[0,0,0],{}));
 assert.doesNotThrow(()=>scaled.shockwave([0,0,0],1,5));
});

test('overlay ink derives from the banner background',()=>{
 assert.equal(backgroundInk('#f1f2ed'),'#16181d','porcelain gets dark ink');
 assert.equal(backgroundInk('#0c0e12'),'#f2f4f8','dark stages get light ink');
});

test('two sections may be active only while both are entered',()=>{
 const runtimes=new Map();
 const fake=variant=>{const made=fakeRuntime(variant);runtimes.set(variant.id,made.runtime);return made;};
 fake(VARIANTS[0]);
 fake(VARIANTS[1]);
 const first=VARIANTS[0].id,second=VARIANTS[1].id;
 const enter=id=>runtimes.get(id).enter();
 const exit=id=>runtimes.get(id).exit();
 enter(first);
 assert.equal(runtimes.get(first).state,'active');
 enter(second); // both intersecting beyond threshold: both may animate
 assert.equal(runtimes.get(second).state,'active');
 exit(first);
 assert.equal(runtimes.get(first).state,'paused');
 assert.equal(runtimes.get(second).state,'active');
});
