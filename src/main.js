import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {makeForm,LABELS} from './shapes.js';
import {CollisionScene,GRID,POOL} from './collision.js';
import {WaveField} from './waves.js';
import {DitherShader} from './dither.js';
import {PendulumScene,CEILING_HEIGHT} from './pendulums.js';
const $=id=>document.getElementById(id);
const canvas=$('scene');
const state={selected:null,drag:null,paused:false,debug:false,ready:false,objects:[],sequence:0};
let renderer,physics;
try{await RAPIER.init();renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});}catch(error){$('loading').textContent='This scene needs WebGL 2. Try opening it in a current browser with graphics acceleration enabled.';console.error(error);throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
const scene=new THREE.Scene();scene.background=new THREE.Color('#ffffff');
const camera=new THREE.OrthographicCamera(-11,11,8,-8,.1,100);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.1;controls.enablePan=true;controls.minZoom=.55;controls.maxZoom=2.2;controls.minPolarAngle=.3;controls.maxPolarAngle=Math.PI/2.2;controls.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:null,TWO:THREE.TOUCH.DOLLY_PAN};
function home(){camera.position.set(18,18.4,18);controls.target.set(0,.4,0);camera.zoom=1;camera.updateProjectionMatrix();controls.update();}
home();
scene.add(new THREE.HemisphereLight(0xffffff,0x798574,1.25));const sun=new THREE.DirectionalLight(0xffffff,3.8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:45});sun.shadow.bias=-.0002;sun.shadow.normalBias=.025;scene.add(sun);function setSun(v){renderer.shadowMap.needsUpdate=true;const a=v*Math.PI/180;sun.position.set(Math.cos(a)*12,17,Math.sin(a)*12);}$('sun').value=135;setSun(135);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const dither=new ShaderPass(DitherShader);composer.addPass(dither);
const white=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,metalness:0});
function block(w,h,d,x,y,z,material=white){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh;}
// Four contiguous slabs leave a real opening for the recessed basin.
block(7.5,.4,12,-3.25,-.2,0);block(1.5,.4,12,6.25,-.2,0);block(5,.4,2,3,-.2,-5);block(5,.4,5,3,-.2,3.5);
block(5,.18,5,3,-.54,-1.5,new THREE.MeshStandardMaterial({color:0x64786a,roughness:1}));
// Thin basin walls sit below the surrounding white floor.
for(const [w,d,x,z]of [[.06,5,.52,-1.5],[.06,5,5.48,-1.5],[5,.06,3,-3.98],[5,.06,3,.98]])block(w,.46,d,x,-.23,z);
const floorOutline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(14,.4,12)),new THREE.LineBasicMaterial({color:0x697463,transparent:true,opacity:.32}));floorOutline.position.y=-.2;scene.add(floorOutline);
const water=new WaveField(97,5);water.disturb(.35,.55,1.8,.3);water.disturb(.7,.3,1.1,.23);
const waterGeometry=new THREE.PlaneGeometry(5,5,96,96);waterGeometry.rotateX(-Math.PI/2);
const waterMaterial=new THREE.MeshPhongMaterial({color:0x354f43,specular:0xf4ffe8,shininess:115,side:THREE.DoubleSide});
waterMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 waterLocal; varying vec3 waveNormal;').replace('#include <begin_vertex>','#include <begin_vertex>\nwaterLocal=position; waveNormal=normal;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 waterLocal; varying vec3 waveNormal;').replace('#include <color_fragment>',`#include <color_fragment>
 float contour=pow(.5+.5*sin(waterLocal.y*180.+waterLocal.x*.7),18.);
 float reflection=smoothstep(.68,.92,dot(normalize(waveNormal),normalize(vec3(.7,1.,.4))));
 diffuseColor.rgb=mix(diffuseColor.rgb*.6,vec3(.57,.66,.55),reflection*reflection*.85);
 diffuseColor.rgb*=mix(.87,1.18,contour);`);};
const waterMesh=new THREE.Mesh(waterGeometry,waterMaterial);waterMesh.position.set(POOL.x,-.15,POOL.z);waterMesh.receiveShadow=true;scene.add(waterMesh);
physics=new CollisionScene(RAPIER);physics.objects=state.objects;
const pendulums=new PendulumScene(RAPIER);
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
 else {let found=false;for(let z=3.5;z>=-4.5&&!found;z-=GRID)for(let x=-5.5;x<=5.5&&!found;x+=GRID){mesh.position.set(x,y,z);if(physics.canPlace(o,mesh.position))found=true;}if(!found){form.geometry.dispose();mesh.material.dispose();notify('No clear floor space for this form.');return null;}}
 objectGroup.add(mesh);state.objects.push(o);pendulums.add(o);createCable(o);o.debug=new THREE.Mesh(form.geometry,new THREE.MeshBasicMaterial({color:0x597c46,wireframe:true,transparent:true,opacity:.6,depthTest:false}));o.debug.visible=state.debug;o.debug.renderOrder=8;mesh.add(o.debug);count();return o;}
function count(){$('object-count').textContent=`${state.objects.length} forms`;}
function notify(text){$('notice').textContent=text;}
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
 o.geometry.dispose();o.mesh.material.dispose();o.debug.material.dispose();state.objects.splice(state.objects.indexOf(o),1);select(null);count();notify('Form removed');
}
function reset(){cancelDrag();for(const o of [...state.objects])remove(o);state.sequence=0;addObject('box',[-3,2]);addObject('box',[-4.5,.5]);addObject('sphere',[-1,3.5]);addObject('cylinder',[-4,-3]);addObject('arch',[-1,-1]);addObject('pebble',[3.5,3.5]);addObject('sphere',[1,-2.5],true,4.65);addObject('box',[-3,-3],true,4.1);select(null);water.reset();water.disturb(.4,.55,1.8,.3);state.paused=false;$('pause').innerHTML='Pause <span>Ⅱ</span>';$('pause').setAttribute('aria-pressed','false');home();notify('Drag a form to arrange the scene');}
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3();
function ray(event){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
function hitWater(){const hits=raycaster.intersectObject(waterMesh);if(!hits.length)return null;return hits[0].point;}
function splash(p,amount=2){water.disturb((p.x-.5)/5,(p.z+4)/5,amount,.16);notify(state.paused?'Ripple queued — resume to see it travel':'A little disturbance goes a long way');}
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
 if(event.button!==0||activePointers.size>1)return;canvas.focus({preventScroll:true});ray(event);const picked=pick();
 if(picked?.object){
  const o=picked.object,mode=picked.mode;select(o);
  if(mode==='pull')plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),picked.hit);
  else plane.set(new THREE.Vector3(0,1,0),-(mode==='anchor'?CEILING_HEIGHT:o.mesh.position.y));
  if(!raycaster.ray.intersectPlane(plane,point))return;
  state.drag={object:o,mode,offset:(mode==='anchor'?o.anchor:o.mesh.position).clone().sub(point),snapshot:pendulums.snapshot(o),id:event.pointerId};
  if(mode==='anchor')pendulums.beginAnchor(o);if(mode==='pull')pendulums.beginPull(o);
  canvas.setPointerCapture(event.pointerId);controls.enabled=false;gridCursor.visible=mode!=='pull';canvas.style.cursor='grabbing';
  notify(mode==='pull'?'Pull freely · release to swing · Esc to cancel':mode==='anchor'?'Reposition the ceiling anchor · grid locked':'Grid locked · release to place · Esc to cancel');
 }else if(picked?.water){select(null);splash(picked.hit);state.drag={water:true,id:event.pointerId,last:performance.now()};canvas.setPointerCapture(event.pointerId);controls.enabled=false;}
 else{select(null);notify('Drag a form · top rings move anchors · pull hanging forms to swing');}
});
canvas.addEventListener('pointermove',event=>{
 ray(event);if(!state.drag){const hit=pick();canvas.style.cursor=hit?.object?'grab':hit?.water?'crosshair':'default';return;}
 if(state.drag.id!==event.pointerId)return;
 if(state.drag.water){const p=hitWater();if(p&&performance.now()-state.drag.last>65){splash(p,.65);state.drag.last=performance.now();}return;}
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
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',cancelDrag);canvas.addEventListener('lostpointercapture',cancelDrag);window.addEventListener('blur',()=>{cancelDrag();activePointers.clear();});canvas.addEventListener('contextmenu',e=>e.preventDefault());
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
for(const button of document.querySelectorAll('[data-add]'))button.addEventListener('click',()=>{const o=addObject(button.dataset.add);if(o){select(o);notify(`${LABELS[o.type]} added · drag it into place`);canvas.focus({preventScroll:true});}});
$('sun').addEventListener('input',e=>{setSun(+e.target.value);$('sun-value').textContent=e.target.value+'°';});$('dither').addEventListener('input',e=>{dither.uniforms.scale.value=+e.target.value;$('dither-value').textContent=e.target.value+' px';});$('ink').addEventListener('change',e=>dither.uniforms.ink.value=+e.target.checked);$('wind').addEventListener('input',e=>{water.energy=+e.target.value/100;$('wind-value').textContent=e.target.value+'%';});$('ripple').addEventListener('click',()=>splash(new THREE.Vector3(2+Math.random()*2,0,-2.5+Math.random()*2),2.8));$('pause').addEventListener('click',()=>{state.paused=!state.paused;$('pause').innerHTML=state.paused?'Resume <span>▷</span>':'Pause <span>Ⅱ</span>';$('pause').setAttribute('aria-pressed',String(state.paused));});$('home').addEventListener('click',home);$('reset').addEventListener('click',reset);$('rotate').addEventListener('click',rotateSelected);$('remove').addEventListener('click',()=>remove(state.selected));$('suspended').addEventListener('change',e=>state.selected&&setHang(state.selected,e.target.checked));$('cable').addEventListener('input',e=>state.selected&&setHang(state.selected,true,+e.target.value));$('colliders').addEventListener('change',e=>{state.debug=e.target.checked;for(const o of state.objects)o.debug.visible=state.debug;notify(state.debug?'Collision shapes visible · the arch opening is clear':'Collision shapes hidden');});$('settings-toggle').addEventListener('click',()=>{$('inspector').classList.toggle('open');$('settings-toggle').setAttribute('aria-expanded',String($('inspector').classList.contains('open')));});
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);composer.setSize(w,h);const aspect=w/h,available=w<760?w-26:w-305,vertical=Math.max(8.6,19.5*h/(2*available));camera.left=-vertical*aspect;camera.right=vertical*aspect;camera.top=vertical;camera.bottom=-vertical;camera.setViewOffset(w,h,w<760?0:130,0,w,h);camera.updateProjectionMatrix();dither.uniforms.resolution.value.set(w*renderer.getPixelRatio(),h*renderer.getPixelRatio());}
window.addEventListener('resize',resize);resize();reset();
let previous=performance.now(),fpsTime=previous,frames=0;
function tick(now){requestAnimationFrame(tick);const dt=Math.min((now-previous)/1000,.05);previous=now;if(document.hidden)return;controls.update();for(const o of pendulums.step(dt))updateCable(o);for(const o of state.objects)if(o.hanging)o.cable.handle.quaternion.copy(camera.quaternion);if(!state.paused){water.step(dt);const a=waterGeometry.attributes.position.array;for(let i=0;i<water.height.length;i++)a[i*3+1]=water.height[i];waterGeometry.attributes.position.needsUpdate=true;waterGeometry.computeVertexNormals();}if(state.selected)selectionBox.setFromObject(state.selected.mesh);composer.render();frames++;if(now-fpsTime>1500){$('runtime').textContent=`LIVE / ${Math.round(frames*1000/(now-fpsTime))} FPS`;frames=0;fpsTime=now;}}
requestAnimationFrame(tick);$('loading').hidden=true;state.ready=true;
// Read-only diagnostics and actions are shared with the UI for integration and verification.
const api={read:()=>({ready:state.ready,objects:state.objects.map(o=>({id:o.id,type:o.type,position:o.mesh.position.toArray(),hanging:o.hanging,cableLength:o.cableLength,anchor:o.anchor?.toArray()??null,velocity:o.body.linvel(),rotation:o.mesh.quaternion.toArray(),parts:o.parts.length})),paused:state.paused,waveMax:Math.max(...water.height),waveMin:Math.min(...water.height),renderCalls:renderer.info.render.calls}),add:type=>{if(!Object.hasOwn(LABELS,type))throw Error('Unknown shape');const o=addObject(type);if(o)select(o);return o?.id??null;},move:(id,x,z)=>{if(![x,z].every(Number.isFinite))throw Error('Coordinates must be finite');const o=state.objects.find(o=>o.id===id);if(!o)throw Error('Unknown object');return placeForm(o,x,z);},project:id=>{const o=state.objects.find(o=>o.id===id);const p=(o?o.mesh.position.clone():waterMesh.position.clone()).project(camera);return{x:(p.x+1)/2*canvas.clientWidth,y:(1-p.y)/2*canvas.clientHeight};},reset};
window.whitewater=api;
if(document.modelContext?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});for(const tool of [{name:'read_scene',description:'Read the shapes and their positions in the scene.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>api.read()},{name:'add_form',description:'Add a white geometric form to an available floor position.',inputSchema:{type:'object',properties:{shape:{type:'string',enum:Object.keys(LABELS)}},required:['shape'],additionalProperties:false},execute:input=>({id:api.add(input.shape)})},{name:'move_form',description:"Reposition a floor form or a hanging form’s ceiling anchor to a grid position if the path is clear.",inputSchema:{type:'object',properties:{id:{type:'number'},x:{type:'number'},z:{type:'number'}},required:['id','x','z'],additionalProperties:false},execute:input=>({moved:api.move(input.id,input.x,input.z)})}]){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(console.warn);}catch(error){console.warn(error);}}}
