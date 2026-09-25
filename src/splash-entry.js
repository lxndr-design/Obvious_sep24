import './splash.css';
import {createBootSequence} from './splash/boot.js';
import {createSplashKit} from './splash/splashkit.js';
import {createEditor} from './splash/editor/panel.js';
import {installGhostPreview} from './splash/interaction/ghost-preview.js';
import {createPointerController} from './splash/interaction/pointer-controller.js';

// Self-contained splash entry (mirrors catalog.js): owns its DOM, its CSS and
// its renderer. Never imports main.js or style.css. Physics lives in the sim
// worker slice — the main thread never imports Rapier. This entry only
// translates DOM pointer events into the controller's NDC/timestamp calls.
document.title='Splash Banner Studio';
document.body.innerHTML=`<header><a class="brand" href="./">Splash</a><h1>Splash Banner Studio<small>Physics-driven banner · hover to attract · hold or right-drag to repel · click to shockwave · drag bodies to throw</small></h1><div class="header-right"><a class="text-button" href="./?edit" target="_blank" rel="noopener" style="text-decoration:none">Eternity app</a></div></header><main id="splash-stage" aria-label="Splash banner studio"><canvas id="splash-scene" tabindex="0" aria-label="Splash banner canvas. Physics objects spawn through SplashKit; cursor forces, shockwaves and drag-to-throw are live."></canvas><div id="splash-loading" role="status" aria-live="polite"><ul class="splash-milestones"></ul></div></main>`;

const loading=document.getElementById('splash-loading');
const milestones=loading.querySelector('.splash-milestones');
// The physics milestone returns with the sim-worker slice (worker-ready mark).
const boot=createBootSequence([
 {id:'engine',label:'Renderer'},
 {id:'first-frame',label:'First frame'},
]);
function paintMilestones(){milestones.replaceChildren(...boot.items().map(({label,done})=>{const li=document.createElement('li');li.textContent=label;if(done)li.className='done';return li;}));}
paintMilestones();
try{
 const canvas=document.getElementById('splash-scene');
 const kit=createSplashKit(canvas,{
  stage:document.getElementById('splash-stage'),
  onFirstFrame(){
   boot.mark('first-frame');
   paintMilestones();
   loading.remove();
  },
 });
 boot.mark('engine');paintMilestones();
 kit.banner.patch({volatility:.2,seed:11}); // default banner: arced sine series, banner defaults
 // Editor surface (rail, gallery, HUD, drops); its first regen spawns the
 // arrangement above.
 createEditor({kit,stage:document.getElementById('splash-stage')});
 // Ghost preview during drag-out placement — the visual half of the editor's
 // drop target (dnd.js spawns on drop, ghost-preview shows during the drag).
 installGhostPreview({
  stage:document.getElementById('splash-stage'),
  camera:kit.camera,
  scene:kit.engine.scene,
  canvas,
 });
 window.splashkit=kit; // distinct global — window.whitewater belongs to the birdbath app

 // --- Cursor physics: DOM events in, controller calls out. ---
 const controller=createPointerController({kit});
 const ndcOf=e=>{
  const r=canvas.getBoundingClientRect();
  return[(e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1)];
 };
 canvas.addEventListener('pointermove',e=>{const[x,y]=ndcOf(e);controller.move(x,y,e.timeStamp);});
 canvas.addEventListener('pointerdown',e=>{
  try{if(!canvas.hasPointerCapture(e.pointerId))canvas.setPointerCapture(e.pointerId);}catch{/* synthetic events may refuse capture; up/cancel still complete the state machine */}
  const[x,y]=ndcOf(e);
  controller.down(x,y,e.timeStamp,e.button);
 });
 canvas.addEventListener('pointerup',e=>{const[x,y]=ndcOf(e);controller.up(x,y,e.timeStamp,e.button);});
 canvas.addEventListener('pointercancel',()=>controller.leave());
 canvas.addEventListener('pointerleave',()=>controller.leave());
 canvas.addEventListener('contextmenu',e=>e.preventDefault()); // right-drag is repel, not a menu
 // Silent-hold resolution: a still press becomes a repel even with no further
 // move events. Cheap state check between events.
 setInterval(()=>controller.tick(performance.now()),60);
}catch(error){
 loading.classList.add('failed');
 loading.textContent=`Splash banner failed to start: ${error.message}. Try a current browser with WebGL 2 and graphics acceleration enabled.`;
 console.error(error);
 throw error;
}
