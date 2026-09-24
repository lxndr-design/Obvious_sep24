import * as THREE from 'three';
import {createSplashScene} from '../scene.js';

// Renderer + camera + frame loop in one owner. The WebGL renderer and DOM
// observers are injectable/guarded so node --test can drive the loop headless
// with a fake renderer.

export function createEngine({canvas,stage,rendererFactory,pixelRatioCap=1.75}={}){
 const renderer=rendererFactory
  ?rendererFactory({canvas})
  :new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio??1,pixelRatioCap));
 const{scene,camera}=createSplashScene();
 let tick=null,onFirstFrame=null,running=false,frames=0,fps=NaN,last=NaN;

 function resize(){
  const w=stage?.clientWidth||canvas?.clientWidth||640;
  const h=stage?.clientHeight||canvas?.clientHeight||360;
  if(w<=0||h<=0)return;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
 }
 if(typeof ResizeObserver!=='undefined'&&stage)new ResizeObserver(resize).observe(stage);
 resize();

 // Order per frame: tick writes matrices BEFORE render draws them; first frame
 // is reported after the first successful render, never before.
 function frame(){
  const now=performance.now();
  if(Number.isFinite(last)){
   const dt=now-last;
   if(dt>0)fps=Number.isFinite(fps)?fps*.9+(1000/dt)*.1:1000/dt;
  }
  last=now;
  if(tick)tick();
  renderer.render(scene,camera);
  frames++;
  if(frames===1&&onFirstFrame)onFirstFrame();
 }

 return{
  renderer,scene,camera,
  get fps(){return fps;},
  get frames(){return frames;},
  start(nextTick,onFirst){
   tick=nextTick??null;
   onFirstFrame=onFirst??null;
   if(!running){
    running=true;
    renderer.setAnimationLoop(frame);
   }
  },
  stop(){
   running=false;
   renderer.setAnimationLoop(null);
  },
  resize,
  dispose(){
   this.stop();
   renderer.dispose();
  },
 };
}
