import './splash.css';
import {createBootSequence} from './splash/boot.js';
import {createSplashKit} from './splash/splashkit.js';
import {createEditor} from './splash/editor/panel.js';

// Self-contained splash entry (mirrors catalog.js): owns its DOM, its CSS and
// its renderer. Never imports main.js or style.css. Physics lives in the sim
// worker slice — the main thread never imports Rapier.
document.title='Splash Banner Studio';
document.body.innerHTML=`<header><a class="brand" href="./">Splash</a><h1>Splash Banner Studio<small>Physics-driven banner · SplashKit core</small></h1><div class="header-right"><a class="text-button" href="./?edit" target="_blank" rel="noopener" style="text-decoration:none">Eternity app</a></div></header><main id="splash-stage" aria-label="Splash banner studio"><canvas id="splash-scene" tabindex="0" aria-label="Splash banner canvas. Physics objects now spawn through SplashKit; cursor forces arrive with the interaction slice."></canvas><div id="splash-loading" role="status" aria-live="polite"><ul class="splash-milestones"></ul></div></main>`;

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
 const kit=createSplashKit(document.getElementById('splash-scene'),{
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
 window.splashkit=kit; // distinct global — window.whitewater belongs to the birdbath app
}catch(error){
 loading.classList.add('failed');
 loading.textContent=`Splash banner failed to start: ${error.message}. Try a current browser with WebGL 2 and graphics acceleration enabled.`;
 console.error(error);
 throw error;
}
