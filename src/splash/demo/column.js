import {createSplashKit} from '../splashkit.js';
import {applySceneVariant} from '../scene.js';
import {createSeriesTool} from '../editor/series-tool.js';
import {createPointerController} from '../interaction/pointer-controller.js';
import {FEEL_PRESETS,LIGHT_RIGS,FILTER_PRESETS,VARIANTS} from './variants.js';
import {createCustomPanel} from './custom-panel.js';

// Demo-column runtime (spec art_WSIRxV9E): a scrollable column of banner
// sections, each an independent kit + activation state machine. A kit (with
// its sim and noise workers) is created lazily when its section first
// approaches the viewport and fully parked — zero rAF ticks, zero sim steps —
// the moment it leaves. At most one (rarely two) banners animate at a time.
//
// The state machine, the observer adapter and the per-section runtime are
// DOM-free and unit-tested; only mountDemoColumn touches the document.

export const ACTIVATION_THRESHOLD=.35;

// Per-section activation machine: idle → arming → active ⇄ paused.
//  - enter() while active or arming is a no-op — repeated observer events
//    must never re-create a kit.
//  - exit() while idle or paused is a no-op — a paused section exiting again
//    must not re-pause.
//  - An exit landing during the synchronous arming window queues the pause
//    until activation completes (unreachable on a single thread, guarded
//    anyway so the machine stays total).
export function createSectionActivation({onActivate,onPause}={}){
 let state='idle';
 let pauseQueued=false;
 return{
  get state(){return state;},
  enter(){
   if(state==='active'||state==='arming')return state;
   state='arming';
   pauseQueued=false;
   let ok=true;
   try{ok=onActivate?.()!==false;}
   catch(error){state='idle';throw error;}
   if(!ok){state='idle';return state;} // activation failed; owner already surfaced it
   if(pauseQueued){pauseQueued=false;state='paused';onPause?.();}
   else state='active';
   return state;
  },
  exit(){
   if(state==='arming'){pauseQueued=true;return state;}
   if(state!=='active')return state;
   state='paused';
   onPause?.();
   return state;
  },
 };
}

// Observer adapter: maps IntersectionObserver entries onto enter/exit calls.
// The implementation is injectable so node --test can drive the wiring with a
// fake observer. A section counts as entered only when it is intersecting AND
// at/over the activation threshold; anything below the threshold keeps its
// previous state (that band is the approach zone).
export function observeSections({sections,onEnter,onExit,threshold=ACTIVATION_THRESHOLD,IO}={}){
 const Observer=IO??globalThis.IntersectionObserver;
 if(typeof Observer!=='function')throw new Error('column: IntersectionObserver unavailable');
 // Firing exactly AT the threshold can report a ratio a hair under it.
 const reached=e=>e.isIntersecting&&e.intersectionRatio>=threshold-1e-3;
 const observer=new Observer(entries=>{
  for(const entry of entries){
   if(reached(entry))onEnter(entry.target);
   else if(!entry.isIntersecting)onExit(entry.target);
  }
 },{threshold});
 for(const section of sections)observer.observe(section);
 return observer;
}

// Interaction emphasis per variant: the controller always speaks the same
// protocol; forces scale the strength it sends. The wrapper resolves the kit
// lazily — sections wire their canvas before the kit exists.
export function scaledKit(getKit,forces={}){
 const s={
  attract:forces.attract??1,repel:forces.repel??1,
  shockwave:forces.shockwave??1,throw:forces.throw??1,
 };
 return{
  setPointer:(mode,strength=1,radius,p)=>getKit()?.setPointer(mode,(mode==='repel'?s.repel:s.attract)*strength,radius,p),
  shockwave:(p,strength=1,radius)=>getKit()?.shockwave(p,strength*s.shockwave,radius),
  drag:(id,p)=>getKit()?.drag(id,p),
  dragRelease:(id,v)=>getKit()?.dragRelease(id,v?v.map(c=>c*s.throw):undefined),
  screenToPlane:(...a)=>getKit()?.screenToPlane(...a),
  pickBody:(...a)=>getKit()?.pickBody(...a),
 };
}

// Per-section runtime: lazy kit creation, the activation machine, the feel
// (world-config) choice, and the reduced-motion park. DOM-free — the mount
// wires real elements; node --test drives it with fake kits.
export function createSectionRuntime({
 variant,kitFactory,reducedMotion=()=>false,
 onKitCreated,onFirstFrame,onError,
 parkDelay=600,pollEveryMs=120,pollGiveUpMs=8000,
}={}){
 let kit=null,tool=null,lost=false;
 let pollTimer=null,parkTimer=null,pollStarted=0;
 let currentFeel=variant.profile.motion;
 const clearTimers=()=>{clearInterval(pollTimer);clearTimeout(parkTimer);pollTimer=parkTimer=null;};
 // A fresh sim world (first activation, or revival after a pause terminated
 // the worker): re-apply the chosen feel — and the governor's current sim
 // rate, which a fresh world resets — then respawn the deterministic series.
 // Config rides before the spawn so bodies are created under the feel.
 function reseed(){
  if(!kit||!tool)return;
  kit.sim.send({type:'config',patch:{...FEEL_PRESETS[currentFeel],simHz:kit.stats().simHz}});
  tool.requestRegen();
 }
 const firstFrame=k=>onFirstFrame?.(variant,k);
 const machine=createSectionActivation({
  onActivate(){
   if(lost)return false; // surfaced via onError — the machine returns to idle
   if(!kit){
    try{
     ({kit,tool}=kitFactory({variant,onReseed:reseed,onFirstFrame:firstFrame}));
    }catch(error){
     lost=true; // surfaced by the caller's onError — never a silent black canvas
     onError?.(variant,error);
     return false;
    }
    onKitCreated?.(variant,kit);
   }
   kit.setActive(true);
   if(reducedMotion())schedulePark();
   return true;
  },
  onPause(){
   clearTimers();
   kit?.setActive(false);
  },
 });
 // Reduced motion: the spawn arrangement itself is the settled pose. Hold it
 // only — once poses have arrived and a short settle has passed, park the
 // section; an interaction re-enters on demand. If poses never arrive (dead
 // worker, already surfaced as an error) the poll gives up rather than spin.
 function schedulePark(){
  clearTimers();
  pollStarted=Date.now();
  pollTimer=setInterval(()=>{
   const s=kit?.stats();
   if(!s)return;
   if(s.active+s.sleeping>0){
    clearInterval(pollTimer);pollTimer=null;
    parkTimer=setTimeout(()=>{parkTimer=null;machine.exit();},parkDelay);
   }else if(Date.now()-pollStarted>pollGiveUpMs){
    clearInterval(pollTimer);pollTimer=null;
   }
  },pollEveryMs);
 }
 return{
  variant,
  get state(){return machine.state;},
  get kit(){return kit;},
  get tool(){return tool;},
  get lost(){return lost;},
  enter(){return lost?machine.state:machine.enter();},
  exit(){return machine.exit();},
  setFeel(name){
   if(!(name in FEEL_PRESETS))throw new TypeError(`Unknown physics feel: ${name}`);
   currentFeel=name;
   if(kit)kit.sim.send({type:'config',patch:FEEL_PRESETS[name]});
   return name;
  },
  get feel(){return currentFeel;},
  noteInteraction(){
   if(lost||!reducedMotion())return;
   if(machine.state==='active')schedulePark(); // keep the pose while it's used
   else machine.enter(); // wake on demand
  },
  dispose(){clearTimers();kit?.dispose();kit=null;},
 };
}

// Overlay ink derives from the banner background — light stages get dark ink —
// so copy contrast is data-driven, never hand-picked per banner.
export function backgroundInk(background){
 const n=parseInt(background.slice(1),16);
 const lum=(.2126*(n>>16&255)+.7152*(n>>8&255)+.0722*(n&255))/255;
 return lum>.5?'#16181d':'#f2f4f8';
}

// Default kit factory: one SplashKit per section + the scene-variant layer.
// The reseed and first-frame callbacks come from the runtime (it owns the feel
// choice; the first frame reveals the section).
export function defaultKitFactory({variant,section,canvas,onReseed,onFirstFrame}){
 const kit=createSplashKit(canvas,{
  stage:section,
  banner:variant.banner,
  onReseed,
  onFirstFrame(){onFirstFrame?.(kit);},
 });
 const scene=kit.engine.scene;
 applySceneVariant(
  scene,
  {
   key:scene.children.find(o=>o.isDirectionalLight),
   rim:scene.children.find(o=>o.isHemisphereLight),
  },
  variant.scene,
  kit.camera,
 );
 // The runtime's reseed path (kit activation, worker revival) owns the feel
 // config; the tool owns the deterministic respawn. spawnSeries() defaults
 // every parameter from the kit's banner state — the variant's config.
 const tool={requestRegen(){kit.despawn();kit.spawnSeries();}};
 return{kit,tool};
}

// Per-section pointer wiring — the entry-level NDC adapter from the studio,
// moved per canvas and scaled by the variant's force profile.
function wirePointer({canvas,runtime,controllers}){
 const controller=createPointerController({kit:scaledKit(()=>runtime.kit,runtime.variant.profile.forces)});
 const ndcOf=e=>{
  const r=canvas.getBoundingClientRect();
  return[(e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1)];
 };
 canvas.addEventListener('pointermove',e=>{
  if(!runtime.kit)return;
  runtime.noteInteraction();
  const[x,y]=ndcOf(e);
  controller.move(x,y,e.timeStamp);
 });
 canvas.addEventListener('pointerdown',e=>{
  if(!runtime.kit)return;
  runtime.noteInteraction();
  try{if(!canvas.hasPointerCapture(e.pointerId))canvas.setPointerCapture(e.pointerId);}catch{/* synthetic events may refuse capture; up/cancel still complete the state machine */}
  const[x,y]=ndcOf(e);
  controller.down(x,y,e.timeStamp,e.button);
 });
 canvas.addEventListener('pointerup',e=>{
  if(!runtime.kit)return;
  const[x,y]=ndcOf(e);
  controller.up(x,y,e.timeStamp,e.button);
 });
 canvas.addEventListener('pointercancel',()=>controller.leave());
 canvas.addEventListener('pointerleave',()=>controller.leave());
 canvas.addEventListener('contextmenu',e=>e.preventDefault()); // right-drag is repel, not a menu
 // Silent-hold resolution: a still press becomes a repel even with no further
 // move events. One shared low-frequency tick across all sections.
 controllers.push(now=>controller.tick(now));
}

// Column mount: builds the five sections, wires kits, activation, pointers,
// context-loss fallbacks and — for the custom variant — the option panel.
export function mountDemoColumn({
 variants=VARIANTS,
 root=document.body,
 doc=document,
 IO,
 kitFactory=defaultKitFactory,
 reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches??false,
 onKitCreated,onFirstFrame,onError,
}={}){
 const sections=[];
 const runtimes=new Map();
 const controllers=[];
 for(const[index,variant]of variants.entries()){
  const section=doc.createElement('section');
  section.className='banner-sec';
  section.id=`banner-${variant.id}`;
  section.dataset.variant=variant.id;
  section.style.setProperty('--banner-ink',backgroundInk(variant.scene.background));
  section.innerHTML=
   `<div class="banner-canvas-wrap"><canvas tabindex="0" aria-label="${variant.name} banner canvas. Cursor forces, shockwaves and drag-to-throw are live."></canvas></div>`+
   `<div class="banner-copy">`+
   (index===0?'<p class="banner-eyebrow">Splash Banner Studio</p>':'')+
   `<${index===0?'h1':'h2'} class="banner-name">${variant.name}</${index===0?'h1':'h2'}>`+
   `<p class="banner-tagline">${variant.tagline}</p>`+
   `</div>`+
   `<p class="banner-lost" role="status">This banner could not start its 3D renderer. Try a current browser with WebGL 2 and graphics acceleration enabled.</p>`;
  const canvas=section.querySelector('canvas');
  const wrap=section.querySelector('.banner-canvas-wrap');
  if(variant.profile.vignette){
   const v=doc.createElement('div');
   v.className='splash-vignette';
   wrap.append(v);
  }
  root.append(section);
  sections.push(section);

  const runtime=createSectionRuntime({
   variant,
   reducedMotion,
   kitFactory:({variant:v,onReseed,onFirstFrame})=>kitFactory({variant:v,section,canvas,onReseed,onFirstFrame}),
   onKitCreated:(v,kit)=>onKitCreated?.(v,kit),
   onFirstFrame:(v,kit)=>{
    section.classList.add('splash-ready'); // later banners fade in on their own first frame
    onFirstFrame?.(v,kit);
   },
   onError:(v,error)=>{
    section.classList.add('splash-lost');
    console.error(`banner ${v.id} failed to start:`,error); // surfaced, never swallowed
    onError?.(v,error,section);
   },
  });
  runtimes.set(variant.id,runtime);
  wirePointer({canvas,runtime,controllers});

  // WebGL context loss: a per-section fallback message, not a silent black
  // canvas. Restore hides it again.
  canvas.addEventListener('webglcontextlost',event=>{
   event.preventDefault();
   section.classList.add('splash-lost');
  });
  canvas.addEventListener('webglcontextrestored',()=>section.classList.remove('splash-lost'));
 }

 // One shared controller tick — silent-hold resolution per section.
 const controllerTick=setInterval(()=>{for(const tick of controllers)tick(performance.now());},60);

 // The only navigation chrome: the dot rail (created by the entry, which
 // passes its own active-dot observer wiring — see nav.js).
 observeSections({
  sections,IO,
  onEnter:section=>runtimes.get(section.dataset.variant)?.enter(),
  onExit:section=>runtimes.get(section.dataset.variant)?.exit(),
 });

 // Exactly one banner carries the custom option set — built here so the
 // rig/filter closures stay section-scoped.
 const customIndex=variants.findIndex(v=>v.id==='custom');
 if(customIndex>=0){
  const customRuntime=runtimes.get('custom');
  const customSection=sections[customIndex];
  const customWrap=customSection.querySelector('.banner-canvas-wrap');
  const panel=createCustomPanel({
   runtime:customRuntime,doc,
   applyRig:rig=>applyRigToKit(customRuntime.kit,rig),
   applyFilter:name=>applyFilterToWrap(customWrap,name),
  });
  customSection.append(panel.root);
 }

 return{
  sections,
  runtimes,
  dispose(){
   clearInterval(controllerTick);
   for(const runtime of runtimes.values())runtime.dispose();
  },
 };
}

// Applies a named lighting rig to a section's live scene (the custom panel's
// lighting-rig control rides this).
export function applyRigToKit(kit,rigName){
 if(!kit)return;
 const rig=LIGHT_RIGS[rigName];
 if(!rig)throw new TypeError(`Unknown lighting rig: ${rigName}`);
 const scene=kit.engine.scene;
 applySceneVariant(
  scene,
  {
   key:scene.children.find(o=>o.isDirectionalLight),
   rim:scene.children.find(o=>o.isHemisphereLight),
  },
  rig,
  kit.camera,
 );
}

// Applies a named canvas-filter preset to a section's canvas wrapper.
export function applyFilterToWrap(wrap,filterName){
 if(!(filterName in FILTER_PRESETS))throw new TypeError(`Unknown filter preset: ${filterName}`);
 wrap.style.filter=FILTER_PRESETS[filterName];
}
