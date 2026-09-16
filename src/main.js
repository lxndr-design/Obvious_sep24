import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {makeForm,LABELS} from './shapes.js';
import {PLANTS} from './furnishings.js';
import {CollisionScene,GRID,POOL} from './collision.js';
import {WaveField} from './waves.js';
import {DitherShader} from './dither.js';
import {PendulumScene,CEILING_HEIGHT} from './pendulums.js';
import {GROUND_PATCHES} from './terrain.js';
import {WindField} from './wind.js';
import {Ecology} from './ecology.js';
const $=id=>document.getElementById(id);
const canvas=$('scene');
const state={selected:null,drag:null,paused:false,debug:false,ready:false,objects:[],sequence:0};
let renderer,physics;
try{await RAPIER.init();renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});}catch(error){$('loading').textContent='This scene needs WebGL 2. Try opening it in a current browser with graphics acceleration enabled.';console.error(error);throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
const scene=new THREE.Scene();scene.background=new THREE.Color('#ffffff');
const camera=new THREE.OrthographicCamera(-11,11,8,-8,.1,1200);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.1;controls.enablePan=true;controls.minZoom=.55;controls.maxZoom=2.2;controls.minPolarAngle=.3;controls.maxPolarAngle=Math.PI/2.2;controls.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:null,TWO:THREE.TOUCH.DOLLY_PAN};
function home(){camera.position.set(18,18.4,18);controls.target.set(0,.4,0);camera.zoom=1;camera.updateProjectionMatrix();controls.update();}
home();
const ambient=new THREE.HemisphereLight(0xffffff,0x798574,1.25);scene.add(ambient);const sun=new THREE.DirectionalLight(0xffffff,3.8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:45});sun.shadow.bias=-.0002;sun.shadow.normalBias=.025;scene.add(sun,sun.target);let sunAngle=135,lastSunZoom=0;function followSun(){const x=controls.target.x,z=controls.target.z;if(sun.target.position.x===x&&sun.target.position.z===z&&lastSunZoom===camera.zoom)return;sun.target.position.set(x,0,z);const a=sunAngle*Math.PI/180;sun.position.set(x+Math.cos(a)*12,17,z+Math.sin(a)*12);const span=Math.max(12,16/camera.zoom);Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span});sun.shadow.camera.updateProjectionMatrix();lastSunZoom=camera.zoom;renderer.shadowMap.needsUpdate=true;}function setSun(v){sunAngle=v;lastSunZoom=0;followSun();}$('sun').value=135;setSun(135);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const dither=new ShaderPass(DitherShader);composer.addPass(dither);
const white=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,metalness:0});
function block(w,h,d,x,y,z,material=white){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh;}
// Expansive flush ground: the pool is an opening, not a freestanding platform.
for(const patch of GROUND_PATCHES){const floor=new THREE.Mesh(new THREE.PlaneGeometry(patch.w,patch.d),white);floor.rotation.x=-Math.PI/2;floor.position.set(patch.x,0,patch.z);floor.receiveShadow=true;scene.add(floor);}
block(5,.18,5,3,-.8,-1.5,new THREE.MeshStandardMaterial({color:0x64786a,roughness:1}));
for(const [w,d,x,z]of [[.06,5,.52,-1.5],[.06,5,5.48,-1.5],[5,.06,3,-3.98],[5,.06,3,.98]])block(w,.8,d,x,-.4,z);
const wind=new WindField();
const water=new WaveField(129,5);
const waterGeometry=new THREE.PlaneGeometry(5,5,128,128);waterGeometry.rotateX(-Math.PI/2);waterGeometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),3.75);
const waterMaterial=new THREE.MeshPhongMaterial({color:0x354f43,specular:0xf4ffe8,shininess:130,side:THREE.DoubleSide});
waterMaterial.onBeforeCompile=shader=>{
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 waveNormal; varying float surfaceHeight;').replace('#include <begin_vertex>','#include <begin_vertex>\nwaveNormal=normal; surfaceHeight=position.y;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 waveNormal; varying float surfaceHeight;').replace('#include <color_fragment>',`#include <color_fragment>
 float reflection=smoothstep(.65,.87,dot(normalize(waveNormal),normalize(vec3(.75,1.,.45))));
 float crest=smoothstep(.05,.22,surfaceHeight);
 diffuseColor.rgb=mix(diffuseColor.rgb*.55,vec3(.74,.79,.70),reflection*reflection*.8+crest*.16);`);
};
const waterMesh=new THREE.Mesh(waterGeometry,waterMaterial);waterMesh.position.set(POOL.x,-.19,POOL.z);waterMesh.receiveShadow=true;scene.add(waterMesh);
physics=new CollisionScene(RAPIER);physics.objects=state.objects;
const pendulums=new PendulumScene(RAPIER);
const ecology=new Ecology(scene,pendulums,physics,wind,RAPIER);ecology.water=water;pendulums.beforeStep=dt=>ecology.beforeStep(dt);
const objectGroup=new THREE.Group();scene.add(objectGroup);
const selectionBox=new THREE.BoxHelper(new THREE.Object3D(),0x57794a);selectionBox.material.depthTest=false;selectionBox.material.transparent=true;selectionBox.material.opacity=.55;selectionBox.visible=false;selectionBox.renderOrder=10;scene.add(selectionBox);
const cursorGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.24,.012,-.24),new THREE.Vector3(.24,.012,-.24),new THREE.Vector3(.24,.012,.24),new THREE.Vector3(-.24,.012,.24),new THREE.Vector3(-.24,.012,-.24)]);const gridCursor=new THREE.Line(cursorGeometry,new THREE.LineBasicMaterial({color:0x57794a,transparent:true,opacity:.7}));gridCursor.visible=false;scene.add(gridCursor);
const cableMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:`varying float height;void main(){vec4 p=modelMatrix*vec4(position,1.);height=p.y;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:`varying float height;void main(){float fade=1.-smoothstep(4.8,8.4,height);gl_FragColor=vec4(vec3(.23,.28,.22),fade*.8);}`});
function createCable(object){
 const cable=new THREE.Group();
 const line=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,1,5),cableMaterial);
 const clasp=new THREE.Mesh(new THREE.TorusGeometry(.06,.016,6,12),new THREE.MeshStandardMaterial({color:0x606f5a,roughness:.8}));
 const handle=new THREE.Mesh(new THREE.TorusGeometry(.13,.022,8,24),new THREE.MeshBasicMaterial({color:0x65745c,transparent:true,opacity:.7,depthTest:false}));
 handle.renderOrder=9;
 const hit=new THREE.Mesh(new THREE.SphereGeometry(.3,12,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
 hit.userData.object=object;hit.userData.anchor=true;
 cable.add(line,clasp,handle,hit);scene.add(cable);object.cable={group:cable,line,clasp,handle,hit};updateCable(object);
}
function updateCable(o){
 renderer.shadowMap.needsUpdate=true;if(!o.cable)return;o.cable.group.visible=o.hanging;if(!o.hanging)return;
 const start=pendulums.attachment(o),direction=o.anchor.clone().sub(start);
 o.cable.line.scale.y=direction.length();o.cable.line.position.copy(start).addScaledVector(direction,.5);
 o.cable.line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
 o.cable.clasp.position.copy(start);o.cable.clasp.quaternion.copy(o.mesh.quaternion);
 o.cable.handle.position.copy(o.anchor);o.cable.handle.quaternion.copy(camera.quaternion);o.cable.hit.position.copy(o.anchor);
}
function addObject(type,position=null,hanging=false,cableLength=5){if(state.objects.length>=40){notify('The scene is full — remove a form to add another.');return null;}const form=makeForm(type,RAPIER);const mesh=new THREE.Mesh(form.geometry,white.clone());mesh.castShadow=true;mesh.receiveShadow=true;const o={...form,type,mesh,id:++state.sequence,hanging,cableLength,cable:null,debug:null};mesh.userData.object=o;
 const y=hanging?8.5-cableLength-form.height/2:form.height/2;
 if(position){mesh.position.set(position[0],y,position[1]);if(!physics.canPlace(o,mesh.position)){form.geometry.dispose();mesh.material.dispose();return null;}}
 else {let found=false;const centerX=Math.round(controls.target.x/GRID)*GRID,centerZ=Math.round(controls.target.z/GRID)*GRID;for(let z=centerZ+3.5;z>=centerZ-4.5&&!found;z-=GRID)for(let x=centerX-5.5;x<=centerX+5.5&&!found;x+=GRID){mesh.position.set(x,y,z);if(physics.canPlace(o,mesh.position))found=true;}if(!found){form.geometry.dispose();mesh.material.dispose();notify('No clear floor space for this form.');return null;}}
 objectGroup.add(mesh);state.objects.push(o);pendulums.add(o);createCable(o);o.debug=new THREE.Mesh(form.geometry,new THREE.MeshBasicMaterial({color:0x597c46,wireframe:true,transparent:true,opacity:.6,depthTest:false}));o.debug.visible=state.debug;o.debug.renderOrder=8;mesh.add(o.debug);return o;}
let noticeTimer;
function notify(text){clearTimeout(noticeTimer);$('notice').textContent=text;$('notice').hidden=!text;if(text)noticeTimer=setTimeout(()=>{$('notice').hidden=true;},3500);}
function select(o){state.selected=o;selectionBox.visible=!!o;$('selection-empty').hidden=!!o;$('selection-controls').hidden=!o;if(!o)return;selectionBox.setFromObject(o.mesh);$('object-name').textContent=LABELS[o.type];const coordinates=o.hanging?o.anchor:o.mesh.position;$('object-coords').textContent=`${coordinates.x.toFixed(1)}, ${coordinates.z.toFixed(1)}`;$('object-coords').title=o.hanging?'Ceiling anchor X, Z':'Floor position X, Z';$('suspended').checked=o.hanging;$('cable-control').hidden=!o.hanging;$('hang-hint').hidden=!o.hanging;$('cable').value=o.cableLength;$('cable-value').textContent=`${o.cableLength.toFixed(2)} m`;}
function setHang(o,hanging,length=o.cableLength){
 const position=o.mesh.position.clone(),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),new THREE.Euler().setFromQuaternion(o.mesh.quaternion,'YXZ').y);
 const anchor=o.hanging?o.anchor.clone():new THREE.Vector3(Math.round(position.x/GRID)*GRID,CEILING_HEIGHT,Math.round(position.z/GRID)*GRID);
 position.x=hanging?anchor.x:Math.round(position.x/GRID)*GRID;position.z=hanging?anchor.z:Math.round(position.z/GRID)*GRID;
 position.y=hanging?CEILING_HEIGHT-length-o.height/2:o.height/2;
 if(!physics.canTravel(o,position)||!physics.canPlace(o,position,rotation)){notify('There is another form in the way. Move it clear first.');select(o);return false;}
 o.hanging=hanging;o.cableLength=length;o.anchor=hanging?anchor:null;o.mesh.position.copy(position);o.mesh.quaternion.copy(rotation);
 pendulums.rebuild(o);updateCable(o);select(o);notify(hanging?'Drag the top ring to place · pull the form to swing':'Placed on the floor · snapped to the grid');return true;
}
function remove(o){
 if(!o)return;if(state.drag?.object===o)endDrag();pendulums.remove(o);renderer.shadowMap.needsUpdate=true;objectGroup.remove(o.mesh);scene.remove(o.cable.group);
 for(const part of [o.cable.line,o.cable.clasp,o.cable.handle,o.cable.hit]){part.geometry.dispose();if(part.material!==cableMaterial)part.material.dispose();}
 o.geometry.dispose();o.mesh.material.dispose();o.debug.material.dispose();state.objects.splice(state.objects.indexOf(o),1);select(null);notify('Form removed');
}
function reset(){cancelDrag();for(const o of [...state.objects])remove(o);state.sequence=0;addObject('box',[-3,2]);addObject('box',[-4.5,.5]);addObject('sphere',[-1,3.5]);addObject('cylinder',[-4,-3]);addObject('arch',[-1,-1]);addObject('pebble',[3.5,3.5]);addObject('sphere',[1,-2.5],true,4.65);addObject('box',[-3,-3],true,4.1);addObject('plant-rubber-medium',[-5.5,2.5]);addObject('table-round-half',[-3,4.5]);addObject('bench',[-4,-5]);addObject('birdbath',[6.5,0]);select(null);water.reset();ecology.reset();state.paused=false;$('pause').innerHTML='Pause <span>Ⅱ</span>';$('pause').setAttribute('aria-pressed','false');home();notify('');}
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3();
function ray(event){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
function hitWater(){const hits=raycaster.intersectObject(waterMesh);if(!hits.length)return null;return hits[0].point;}
function splash(p,amount=4.5){water.disturb((p.x-.5)/5,(p.z+4)/5,amount,.19);notify(state.paused?'Ripple queued — resume to see it travel':'Drag through the water to leave a wake');}
function waterUV(point){return {u:(point.x-.5)/5,v:(point.z+4)/5};}
const groundRayPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function trackPointer(event){const groundPoint=raycaster.ray.intersectPlane(groundRayPlane,new THREE.Vector3());const rect=canvas.getBoundingClientRect();ecology.setPointer(groundPoint,{x:event.clientX-rect.left,y:event.clientY-rect.top});}
canvas.addEventListener('pointerleave',()=>ecology.setPointer(null,null));
const activePointers=new Set();
canvas.addEventListener('pointerdown',e=>{activePointers.add(e.pointerId);if(activePointers.size>1)cancelDrag();},true);
for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,e=>activePointers.delete(e.pointerId),true);
function pick(){
 const handles=raycaster.intersectObjects(state.objects.filter(o=>o.hanging).map(o=>o.cable.hit),false);
 if(handles.length)return {object:handles[0].object.userData.object,mode:'anchor',hit:handles[0].point};
 const hits=raycaster.intersectObjects(state.objects.map(o=>o.mesh),false),waterHit=hitWater();
 if(hits.length&&(!waterHit||hits[0].distance<raycaster.ray.origin.distanceTo(waterHit)))return {object:hits[0].object.userData.object,mode:hits[0].object.userData.object.hanging?'pull':'floor',hit:hits[0].point};
 return waterHit?{water:true,hit:waterHit}:null;
}
canvas.addEventListener('pointerdown',event=>{
 if(event.button!==0||activePointers.size>1)return;canvas.focus({preventScroll:true});ray(event);trackPointer(event);const picked=pick();
 if(picked?.object){
  const o=picked.object,mode=picked.mode;select(o);
  if(mode==='pull')plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),picked.hit);
  else plane.set(new THREE.Vector3(0,1,0),-(mode==='anchor'?CEILING_HEIGHT:o.mesh.position.y));
  if(!raycaster.ray.intersectPlane(plane,point))return;
  state.drag={object:o,mode,offset:(mode==='anchor'?o.anchor:o.mesh.position).clone().sub(point),snapshot:pendulums.snapshot(o),id:event.pointerId};
  if(mode==='anchor')pendulums.beginAnchor(o);if(mode==='pull')pendulums.beginPull(o);
  canvas.setPointerCapture(event.pointerId);controls.enabled=false;gridCursor.visible=mode!=='pull';canvas.style.cursor='grabbing';
  notify(mode==='pull'?'Pull freely · release to swing · Esc to cancel':mode==='anchor'?'Reposition the ceiling anchor · grid locked':'Grid locked · release to place · Esc to cancel');
 }else if(picked?.water){select(null);splash(picked.hit);state.drag={water:true,id:event.pointerId,last:performance.now(),previous:waterUV(picked.hit)};canvas.setPointerCapture(event.pointerId);controls.enabled=false;}
 else{select(null);notify('');}
});
canvas.addEventListener('pointermove',event=>{
 ray(event);trackPointer(event);if(!state.drag){const hit=pick();canvas.style.cursor=hit?.object?'grab':hit?.water?'crosshair':'default';return;}
 if(state.drag.id!==event.pointerId)return;
 if(state.drag.water){const p=hitWater(),now=performance.now();if(p){const uv=waterUV(p);if(state.drag.previous)water.stroke(state.drag.previous,uv,(now-state.drag.last)/1000);state.drag.previous=uv;}else state.drag.previous=null;state.drag.last=now;return;}
 if(!raycaster.ray.intersectPlane(plane,point))return;
 const {object:o,mode}=state.drag,target=point.clone().add(state.drag.offset);
 if(mode==='pull'){pendulums.setPullTarget(target);return;}
 target.x=Math.round(target.x/GRID)*GRID;target.z=Math.round(target.z/GRID)*GRID;target.y=mode==='anchor'?CEILING_HEIGHT:o.mesh.position.y;
 gridCursor.position.set(target.x,0,target.z);
 const moved=mode==='anchor'?pendulums.moveAnchor(o,target,physics):physics.move(o,target);
 if(moved&&mode==='floor')pendulums.syncPose(o);
 gridCursor.material.color.set(moved?0x57794a:0x995548);notify(moved?'Grid locked · release to place · Esc to cancel':'Occupied — choose a clear path');updateCable(o);select(o);
});
function endDrag(e){
 if(!state.drag||e&&e.pointerId!==state.drag.id)return;const {id,object,mode}=state.drag;
 if(mode==='pull'){pendulums.releasePull();notify('Released · gravity takes over');}
 if(mode==='anchor'){pendulums.endAnchor(object);notify('Anchor placed · pull the hanging form to swing');}
 state.drag=null;gridCursor.visible=false;controls.enabled=true;canvas.style.cursor='default';if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
}
function cancelDrag(){const drag=state.drag;endDrag();if(drag?.object){pendulums.restore(drag.object,drag.snapshot);updateCable(drag.object);select(drag.object);notify('Drag cancelled');}}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',cancelDrag);canvas.addEventListener('lostpointercapture',cancelDrag);window.addEventListener('blur',()=>{cancelDrag();activePointers.clear();ecology.setPointer(null,null);});canvas.addEventListener('contextmenu',e=>e.preventDefault());
function placeForm(o,x,z){
 const target=new THREE.Vector3(Math.round(x/GRID)*GRID,o.hanging?CEILING_HEIGHT:o.mesh.position.y,Math.round(z/GRID)*GRID);
 const result=o.hanging?pendulums.moveAnchor(o,target,physics):physics.move(o,target);
 if(result&&!o.hanging)pendulums.syncPose(o);updateCable(o);select(o);return result;
}
canvas.addEventListener('keydown',e=>{
 const o=state.selected;if(e.key==='Escape'){cancelDrag();select(null);return;}if(!o)return;
 const dirs={ArrowLeft:[-GRID,0],ArrowRight:[GRID,0],ArrowUp:[0,-GRID],ArrowDown:[0,GRID]};
 if(dirs[e.key]){e.preventDefault();const [x,z]=dirs[e.key],p=o.hanging?o.anchor:o.mesh.position;if(!placeForm(o,p.x+x,p.z+z))notify('Occupied — choose a clear path');}
 if(e.key.toLowerCase()==='r')rotateSelected();if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove(o);}
});
function rotateSelected(){const o=state.selected;if(!o)return;if(!physics.rotate(o))notify('Not enough clearance to rotate');else{pendulums.syncPose(o);notify('Rotated 90°');}updateCable(o);select(o);}
for(const button of document.querySelectorAll('[data-add]'))button.addEventListener('click',()=>{const o=addObject(button.dataset.add);if(o){select(o);notify(o.type==='birdbath'?'Bird bath added · leave it quiet for visitors':`${LABELS[o.type]} added · drag it into place`);canvas.focus({preventScroll:true});}});
let pickerFamily='plant';
function openPicker(family){
 pickerFamily=family;const plant=family==='plant';
 $('picker-title').textContent=plant?'Potted plant':'Table';$('variant-label').textContent=plant?'Plant':'Shape';
 const variants=plant?Object.entries(PLANTS):[['round','Round'],['square','Square']];
 const sizes=plant?[['small','Small'],['medium','Medium'],['large','Large']]:[['half','½ size'],['full','1/1 size']];
 $('object-variant').replaceChildren(...variants.map(([value,label])=>new Option(label,value)));
 $('object-size').replaceChildren(...sizes.map(([value,label])=>new Option(label,value)));
 $('object-size').value=plant?'medium':'full';
 $('picker-hint').textContent=plant?'Three plants, each in three sizes. Drag, rotate or hang them just like other forms.':'Full size: 2 m wide × 1.3 m tall. Half size scales every dimension by ½.';
 $('object-picker').showModal();
}
$('add-plant').addEventListener('click',()=>openPicker('plant'));
$('add-table').addEventListener('click',()=>openPicker('table'));
$('picker-close').addEventListener('click',()=>$('object-picker').close());
$('picker-form').addEventListener('submit',event=>{
 event.preventDefault();const type=`${pickerFamily}-${$('object-variant').value}-${$('object-size').value}`;
 const o=addObject(type);if(o){$('object-picker').close();select(o);notify(`${LABELS[type]} added · drag it into place`);canvas.focus({preventScroll:true});}
 else $('picker-hint').textContent='No clear space here. Close this picker, pan to an open area, or remove a form and try again.';
});
for(const [id,uniform] of [['ink-color','inkColor'],['paper-color','paperColor']]){
 const updateColor=()=>{const hex=parseInt($(id).value.slice(1),16);dither.uniforms[uniform].value.set(((hex>>16)&255)/255,((hex>>8)&255)/255,(hex&255)/255);};
 $(id).addEventListener('input',updateColor);updateColor();
}
$('sun').addEventListener('input',e=>{setSun(+e.target.value);$('sun-value').textContent=e.target.value+'°';});$('light-strength').addEventListener('input',e=>{const strength=+e.target.value/100;sun.intensity=3.8*strength;ambient.intensity=1.25*strength;$('light-strength-value').textContent=e.target.value+'%';});
$('dither').addEventListener('input',e=>{const scale=+e.target.value;dither.uniforms.scale.value=scale;$('dither-value').textContent=scale===0?'0 · Off':scale+' px';$('ink').disabled=scale===0;$('tone-colors').disabled=scale===0;$('tone-hint').textContent=scale===0?'Turn dithering on to use ink and paper colors.':'Two-tone uses just these two colors. Turn it off for shades between them.';$('ink').closest('.switch-row').classList.toggle('is-disabled',scale===0);});$('ink').addEventListener('change',e=>dither.uniforms.ink.value=+e.target.checked);$('wind').addEventListener('input',e=>{wind.strength=+e.target.value/100;$('wind-value').textContent=+e.target.value===0?'Calm':e.target.value+'%';});$('wind-direction').addEventListener('input',e=>{wind.direction=+e.target.value;water.windDirection=wind.direction;$('wind-direction-value').textContent=e.target.value+'°';});$('ripple').addEventListener('click',()=>splash(new THREE.Vector3(2+Math.random()*2,0,-2.5+Math.random()*2),6.5));$('pause').addEventListener('click',()=>{state.paused=!state.paused;$('pause').innerHTML=state.paused?'Resume <span>▷</span>':'Pause <span>Ⅱ</span>';$('pause').setAttribute('aria-pressed',String(state.paused));});$('home').addEventListener('click',home);$('reset').addEventListener('click',reset);$('rotate').addEventListener('click',rotateSelected);$('remove').addEventListener('click',()=>remove(state.selected));$('suspended').addEventListener('change',e=>state.selected&&setHang(state.selected,e.target.checked));$('cable').addEventListener('input',e=>state.selected&&setHang(state.selected,true,+e.target.value));$('colliders').addEventListener('change',e=>{state.debug=e.target.checked;for(const o of state.objects)o.debug.visible=state.debug;notify(state.debug?'Collision shapes visible · the arch opening is clear':'Collision shapes hidden');});$('settings-toggle').addEventListener('click',()=>{$('inspector').classList.toggle('open');$('settings-toggle').setAttribute('aria-expanded',String($('inspector').classList.contains('open')));});
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);composer.setSize(w,h);const aspect=w/h,available=w<760?w-26:w-305,vertical=Math.max(8.6,19.5*h/(2*available));camera.left=-vertical*aspect;camera.right=vertical*aspect;camera.top=vertical;camera.bottom=-vertical;camera.setViewOffset(w,h,w<760?0:130,0,w,h);camera.updateProjectionMatrix();dither.uniforms.resolution.value.set(w,h);}
window.addEventListener('resize',resize);resize();reset();
let previous=performance.now();
let shadowClock=0;
function tick(now){
 requestAnimationFrame(tick);const dt=Math.min((now-previous)/1000,.05);previous=now;if(document.hidden)return;
 controls.update();followSun();
 for(const o of pendulums.step(dt))updateCable(o);
 ecology.update(dt,camera,canvas.clientWidth,canvas.clientHeight);
 for(const o of state.objects)if(o.hanging)o.cable.handle.quaternion.copy(camera.quaternion);
 water.windVector=wind.sample(POOL.x,POOL.z);
 if(!state.paused){
  water.step(dt);const a=waterGeometry.attributes.position.array;
  for(let i=0;i<water.height.length;i++)a[i*3+1]=water.height[i];
  waterGeometry.attributes.position.needsUpdate=true;waterGeometry.computeVertexNormals();
 }
 // Meadow shadows update at 30 Hz; water shading and physical motion remain smooth.
 shadowClock+=dt;if(shadowClock>=1/30){renderer.shadowMap.needsUpdate=true;shadowClock=0;}
 if(state.selected)selectionBox.setFromObject(state.selected.mesh);
 composer.render();
}
requestAnimationFrame(tick);$('loading').hidden=true;state.ready=true;
// Read-only diagnostics and actions are shared with the UI for integration and verification.
const api={read:()=>({ready:state.ready,objects:state.objects.map(o=>({id:o.id,type:o.type,position:o.mesh.position.toArray(),hanging:o.hanging,cableLength:o.cableLength,anchor:o.anchor?.toArray()??null,velocity:o.body.linvel(),rotation:o.mesh.quaternion.toArray(),parts:o.parts.length})),paused:state.paused,rendering:{lightStrength:sun.intensity/3.8,ditherScale:dither.uniforms.scale.value,inkColor:$('ink-color').value,paperColor:$('paper-color').value,twoTone:!!dither.uniforms.ink.value&&dither.uniforms.scale.value>0},wind:{strength:wind.strength,direction:wind.direction},nature:ecology.read(),waveMax:Math.max(...water.height),waveMin:Math.min(...water.height),renderCalls:renderer.info.render.calls}),add:type=>{if(!Object.hasOwn(LABELS,type))throw Error('Unknown shape');const o=addObject(type);if(o)select(o);return o?.id??null;},move:(id,x,z)=>{if(![x,z].every(Number.isFinite))throw Error('Coordinates must be finite');const o=state.objects.find(o=>o.id===id);if(!o)throw Error('Unknown object');return placeForm(o,x,z);},project:id=>{const o=state.objects.find(o=>o.id===id);const p=(o?o.mesh.position.clone():waterMesh.position.clone()).project(camera);return{x:(p.x+1)/2*canvas.clientWidth,y:(1-p.y)/2*canvas.clientHeight};},reset};
window.whitewater=api;
if(document.modelContext?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});for(const tool of [{name:'read_scene',description:'Read the shapes and their positions in the scene.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>api.read()},{name:'add_form',description:'Add a white geometric form to an available floor position.',inputSchema:{type:'object',properties:{shape:{type:'string',enum:Object.keys(LABELS)}},required:['shape'],additionalProperties:false},execute:input=>({id:api.add(input.shape)})},{name:'move_form',description:"Reposition a floor form or a hanging form’s ceiling anchor to a grid position if the path is clear.",inputSchema:{type:'object',properties:{id:{type:'number'},x:{type:'number'},z:{type:'number'}},required:['id','x','z'],additionalProperties:false},execute:input=>({moved:api.move(input.id,input.x,input.z)})}]){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(console.warn);}catch(error){console.warn(error);}}}
