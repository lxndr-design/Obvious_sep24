import * as THREE from 'three';
import {dropPoint} from '../editor/dnd.js';
import {PRESET_DRAG_TYPE,readDragPayload} from '../editor/bindings.js';
import {PRESETS,presetGeometry} from '../presets.js';

// Ghost preview for editor drag-out placement: while a gallery tile is dragged
// over the canvas, a translucent copy of the preset hovers at the drop point.
// This is the visual half of dnd.js's drop target — dnd spawns, we show.

// dataTransfer.getData() is blocked during dragover, so the dragged preset is
// learned at dragstart (data is readable there) as the event bubbles from the
// tile through the stage. dragover only needs the MIME type to recognize our
// drag — types stay readable through the whole gesture.
export function installGhostPreview({stage,camera,scene,canvas}={}){
 if(!stage||!camera||!scene)return()=>{};
 let preset=null; // armed preset name while a tile drag is live
 let ghost=null;

 function arm(name){
  if(!PRESETS[name])return; // contract change upstream: unknown preset, no ghost
  preset=name;
  if(!ghost){
   ghost=new THREE.Mesh(
    presetGeometry(name), // shared cache — the ghost must not dispose it
    new THREE.MeshStandardMaterial({transparent:true,opacity:.4,depthWrite:false}),
   );
   scene.add(ghost); // dropPoint returns world coordinates — world-space parent
  }else{
   ghost.geometry=presetGeometry(name);
  }
  ghost.material.color=new THREE.Color(PRESETS[name].color);
  ghost.visible=false; // stays hidden until the drag re-enters the canvas
 }
 function disarm(){
  preset=null;
  if(ghost)ghost.visible=false;
 }
 function over(e){
  if(!preset||!e.dataTransfer?.types?.includes(PRESET_DRAG_TYPE))return;
  const point=dropPoint({
   clientX:e.clientX,clientY:e.clientY,camera,
   rect:canvas?.getBoundingClientRect?.()??{left:0,top:0,width:1,height:1},
  });
  if(!point){ghost.visible=false;return;}
  ghost.position.set(...point);
  ghost.visible=true;
 }

 const onDragStart=e=>{
  if(!e.dataTransfer?.types?.includes(PRESET_DRAG_TYPE))return;
  const name=readDragPayload(e.dataTransfer); // readable at dragstart only
  if(name)arm(name);
 };
 const disarmIfArmed=()=>disarm();
 const onDragLeave=()=>{if(ghost)ghost.visible=false;};
 stage.addEventListener('dragstart',onDragStart);
 stage.addEventListener('dragend',disarmIfArmed);
 stage.addEventListener('drop',disarmIfArmed);
 canvas?.addEventListener?.('dragover',over);
 canvas?.addEventListener?.('dragleave',onDragLeave);

 return()=>{
  stage.removeEventListener('dragstart',onDragStart);
  stage.removeEventListener('dragend',disarmIfArmed);
  stage.removeEventListener('drop',disarmIfArmed);
  canvas?.removeEventListener?.('dragover',over);
  canvas?.removeEventListener?.('dragleave',onDragLeave);
  if(ghost){scene.remove(ghost);ghost.material.dispose();ghost=null;}
  preset=null;
 };
}
