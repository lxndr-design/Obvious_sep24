import './splash.css';
import {createBootSequence} from './splash/boot.js';
import {VARIANTS} from './splash/demo/variants.js';
import {mountDemoColumn} from './splash/demo/column.js';
import {createDotNav} from './splash/demo/nav.js';

// Demo-column entry (spec art_WSIRxV9E): /splash.html is a scrollable column
// of five banner variants — a Lusion-style hero plus fixed demos and one
// custom banner. The studio editor no longer mounts anywhere on this page;
// its code stays in the repository. Self-contained (mirrors catalog.js): owns
// its DOM, its CSS and its renderer; never imports main.js or style.css.
// Physics lives in the sim worker slice — the main thread never imports
// Rapier. Each section runs its own kit + sim worker, created lazily on
// scroll approach and fully parked when off-screen.
document.title='Splash Banner Studio';
document.body.innerHTML=`<header class="splash-top"><a class="brand" href="./" aria-label="Eternity home">Splash</a></header><main id="splash-column" aria-label="Splash banner demo gallery"></main>`;

const main=document.getElementById('splash-column');
// Boot preloader rides the first section only — later banners fade in on
// their own first frame (the mount adds .splash-ready per section).
const boot=createBootSequence([
 {id:'engine',label:'Renderer'},
 {id:'first-frame',label:'First frame'},
]);
const loading=document.createElement('div');
loading.id='splash-loading';
loading.setAttribute('role','status');
loading.setAttribute('aria-live','polite');
loading.innerHTML='<ul class="splash-milestones"></ul>';
const milestones=loading.querySelector('.splash-milestones');
function paintMilestones(){milestones.replaceChildren(...boot.items().map(({label,done})=>{const li=document.createElement('li');li.textContent=label;if(done)li.className='done';return li;}));}
paintMilestones();
try{
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const firstVariant=VARIANTS[0];
 const column=mountDemoColumn({
  variants:VARIANTS,
  root:main,
  reducedMotion:()=>reduced.matches,
  onKitCreated(variant){
   if(variant!==firstVariant)return;
   boot.mark('engine');
   paintMilestones();
  },
  onFirstFrame(variant,kit){
   if(variant!==firstVariant)return;
   boot.mark('first-frame');
   paintMilestones();
   loading.remove();
   window.splashkit=kit; // distinct global — window.whitewater belongs to the birdbath app
  },
  onError(variant,error){
   if(variant!==firstVariant)return;
   loading.classList.add('failed');
   loading.textContent=`Splash banner failed to start: ${error.message}. Try a current browser with WebGL 2 and graphics acceleration enabled.`;
  },
 });
 // Safe before any activation: observer callbacks are asynchronous.
 column.sections[0].append(loading);

 // The only other chrome: the five-dot jump rail.
 document.body.append(createDotNav({sections:column.sections}).root);
}catch(error){
 loading.classList.add('failed');
 loading.textContent=`Splash banner failed to start: ${error.message}. Try a current browser with WebGL 2 and graphics acceleration enabled.`;
 console.error(error);
 throw error;
}
