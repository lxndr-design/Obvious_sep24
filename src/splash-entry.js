import './splash.css';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {createBootSequence} from './splash/boot.js';
import {createSplashScene} from './splash/scene.js';

// Self-contained splash entry (mirrors catalog.js): owns its DOM, its CSS and
// its renderer. Never imports main.js or style.css.
document.title='Splash Banner Studio';
document.body.innerHTML=`<header><a class="brand" href="./">Splash</a><h1>Splash Banner Studio<small>Physics-driven banner · dark canvas shell</small></h1><div class="header-right"><a class="text-button" href="./?edit" target="_blank" rel="noopener" style="text-decoration:none">Eternity app</a></div></header><main id="splash-stage" aria-label="Splash banner studio"><canvas id="splash-scene" tabindex="0" aria-label="Splash banner canvas. Physics objects and cursor forces arrive with the next slices."></canvas><div id="splash-loading" role="status" aria-live="polite"><ul class="splash-milestones"></ul></div></main>`;

const loading=document.getElementById('splash-loading');
const milestones=loading.querySelector('.splash-milestones');
const boot=createBootSequence([
 {id:'physics',label:'Physics engine (Rapier)'},
 {id:'engine',label:'Renderer'},
 {id:'first-frame',label:'First frame'},
]);
function paintMilestones(){milestones.replaceChildren(...boot.items().map(({label,done})=>{const li=document.createElement('li');li.textContent=label;if(done)li.className='done';return li;}));}
paintMilestones();
try{
 await R.init();boot.mark('physics');paintMilestones();
 const canvas=document.getElementById('splash-scene');
 const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
 boot.mark('engine');paintMilestones();
 const {scene,camera}=createSplashScene();
 const stage=document.getElementById('splash-stage');
 function resize(){renderer.setSize(stage.clientWidth,stage.clientHeight,false);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();}
 new ResizeObserver(resize).observe(stage);resize();
 let firstFrame=true;
 renderer.setAnimationLoop(()=>{
  renderer.render(scene,camera);
  if(firstFrame){firstFrame=false;boot.mark('first-frame');paintMilestones();loading.remove();}
 });
}catch(error){
 loading.classList.add('failed');
 loading.textContent=`Splash banner failed to start: ${error.message}. Try a current browser with WebGL 2 and graphics acceleration enabled.`;
 console.error(error);
 throw error;
}
