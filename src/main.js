import {BoardView,decorateBoard,disposeBoard} from './boards.js';
import {ElementInspector} from './element-inspector.js';
import {replaceForm} from './replace-form.js';
import {actionURL,remapActions} from './message-actions.js';
import {DragGrid} from './drag-grid.js';
import {makeSizedForm,installSizeMenu,objectSizeLabel} from './object-size.js';
import {objectRecord,validateSpace,installSpaces} from './spaces.js';
import {handlePhotoFile,decoratePhoto,disposePhoto} from './photo-upload.js';
import {setGrandmaPose} from './grandma.js';
import {bindDragPointer} from './drag-pointer.js';
import {installTrackpadPan} from './camera-pan.js';
import {DEFAULT_PARK} from './default-scene.js';
import {isSign,applySignPlacement,decorateSign,disposeSign,stepSign,SIGN_VARIANTS} from './signs.js';
import {SignFocus,PoleEye} from './sign-focus.js';
import {SignInspector} from './sign-inspector.js';
import {applyGrandmaPlacement,disposeGrandma,GRANDMA_OUTFITS,GRANDMA_HAIR,attachGrandmaRig} from './grandma.js';
import './style.css';
import {properties,applyMaterialProperties,canManipulate} from './object-properties.js';
import {ObjectInspector,ObjectMessages} from './object-inspector.js';
import {HopPuffs} from './hop-puffs.js';
import {MessageHops,hopClearance} from './message-hops.js';
import {applySceneTheme} from './theme.js';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {LABELS} from './shapes.js';
import {HOUSEHOLD_MODELS} from './household.js';
import {PLANTS} from './furnishings.js';
import {RoomClient,loadIdentity,saveIdentity,STATUS} from './net/client.js';
import {BoardReplicator,localKey,keyPrefix} from './net/board-replicator.js';
import {LIMITS} from './net/protocol.js';
import {avatarForm,avatarPlacement,createPlayerEntity,nameTagLabel,pickSpawnSpot,PLAYER_HEIGHT,spawnCandidates} from './player-entity.js';
import {ChatBubbles,ChatLog,clampBubbleAnchor,composeChatText,MAX_LOG_ENTRIES} from './chat.js';
import {CollisionScene,GRID,POOL} from './collision.js';
import {HoleTerrain} from './hole-terrain.js';
import {DitherShader} from './dither.js';
import {makeGroundMaterial} from './ground-shadows.js';
import {PendulumScene,CEILING_HEIGHT} from './pendulums.js';
import {HoleLayout,TERRAIN_EXTENT} from './terrain.js';
import {WindField} from './wind.js';
import {WindTrails} from './wind-trails.js';
import {Ecology} from './ecology.js';
import {hitBathWater} from './birdbath.js';
import {dragFloor,dragAnchor,DragPresentation,DragGhost,placementAt} from './dragging.js';
import {WaterRefraction} from './water-refraction.js';
import {ViewCull} from './view-cull.js';
import {HangingFocus} from './hanging-focus.js';
import {HedgeScene} from './hedges.js';
import {applyHedgeSurface} from './hedge-surface.js';
import {StackScene} from './stacking.js';
import {SeedSlingshot,SlingGuide} from './slingshot.js';
import {SettleSolver,releaseVelocity,trackSample} from './settle.js';
const $=id=>document.getElementById(id);
const canvas=$('scene');
const presentationOnly=new URLSearchParams(location.search).has('view')||(import.meta.env.PROD&&!new URLSearchParams(location.search).has('edit'));
document.body.classList.toggle('presentation-only',presentationOnly);
if(presentationOnly)document.getElementById('scene').setAttribute('aria-label','Eternity space. Hover over objects to read their messages.');
let hydrating=false;
const state={mouseMode:'drag',selected:null,drag:null,paused:false,debug:false,ready:false,objects:[],holes:[],sequence:0};
let renderer,physics;
try{await RAPIER.init();renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});}catch(error){$('loading').textContent='This scene needs WebGL 2. Try opening it in a current browser with graphics acceleration enabled.';console.error(error);throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
const scene=new THREE.Scene();scene.background=new THREE.Color('#ffffff');
const camera=new THREE.OrthographicCamera(-11,11,8,-8,.1,1200);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.1;controls.enablePan=true;controls.minZoom=.55;controls.maxZoom=2.2;controls.minPolarAngle=.3;controls.maxPolarAngle=Math.PI/2.2;controls.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:null,TWO:THREE.TOUCH.DOLLY_PAN};
function home(){controls.target.set(0,.4,0);camera.position.setFromSphericalCoords(31.18,THREE.MathUtils.degToRad(59),THREE.MathUtils.degToRad(54)).add(controls.target);camera.zoom=1.7;camera.updateProjectionMatrix();controls.update();}
home();
const ambient=new THREE.HemisphereLight(0xffffff,0x969696,1.25*(+$('light-strength').value/100));scene.add(ambient);const sun=new THREE.DirectionalLight(0xffffff,3.8*(+$('light-strength').value/100));sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:45});sun.shadow.bias=-.0002;sun.shadow.normalBias=.025;scene.add(sun,sun.target);let sunAngle=80,lastSunZoom=0;function followSun(){const x=controls.target.x,z=controls.target.z;if(sun.target.position.x===x&&sun.target.position.z===z&&lastSunZoom===camera.zoom)return;sun.target.position.set(x,0,z);const a=sunAngle*Math.PI/180;sun.position.set(x+Math.cos(a)*12,17,z+Math.sin(a)*12);const span=Math.max(12,16/camera.zoom);Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span});sun.shadow.camera.updateProjectionMatrix();lastSunZoom=camera.zoom;renderer.shadowMap.needsUpdate=true;}function setSun(v){sunAngle=v;lastSunZoom=0;followSun();}setSun(+$('sun').value);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const dither=new ShaderPass(DitherShader);composer.addPass(dither);const hangingFocus=new HangingFocus();const refraction=new WaterRefraction();dither.uniforms.hangingMask.value=hangingFocus.target.texture;
const viewCull=new ViewCull();viewCull.enabled=!new URLSearchParams(location.search).has('nocull');
const white=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,metalness:0});
const windTrails=new WindTrails(scene);
const wind=new WindField(),layout=new HoleLayout(),terrain=new HoleTerrain(scene,makeGroundMaterial(white,sun));terrain.materialForHole=id=>state.holes.find(o=>o.id===id)?.primaryMaterial??white;
physics=new CollisionScene(RAPIER);physics.objects=state.objects;const stacks=new StackScene(physics);const settleSolver=new SettleSolver(physics);
const pendulums=new PendulumScene(RAPIER);
const hedges=new HedgeScene(RAPIER,physics,pendulums,()=>{renderer.shadowMap.needsUpdate=true;});
const baths=new HedgeScene(RAPIER,physics,pendulums,()=>{renderer.shadowMap.needsUpdate=true;},'birdbath');
const joining=o=>o?.type==='hedge'?hedges:o?.type==='birdbath'?baths:null;
function refreshJoins(){return hydrating||hedges.refresh()&&baths.refresh();}
const ecology=new Ecology(scene,pendulums,physics,wind,RAPIER);ecology.terrain=terrain;pendulums.beforeStep=dt=>ecology.beforeStep(dt);
ecology.grandmas.busy=o=>state.paused||presentation.motion.has(o)||!!state.drag?.object&&stacks.members(state.drag.object).includes(o);
ecology.sticks.canTake=o=>!presentationOnly&&state.drag?.object!==o&&!state.objects.some(child=>child.support===o);
ecology.sticks.onTake=o=>{const selected=state.selected;remove(o);if(selected&&selected!==o)select(selected);return !state.objects.includes(o);};
const sling=new SeedSlingshot(RAPIER),slingGuide=new SlingGuide(scene);
const objectGroup=new THREE.Group();scene.add(objectGroup);const presentation=new DragPresentation(),dragGhost=new DragGhost(scene);
// ---- players (Feature 7, U2): presence, self-drag, disconnect grace -----
const playerGroup=new THREE.Group();scene.add(playerGroup);
const spawnProbe=avatarForm(RAPIER);
const entities=new Map(); // playerId → {entity, tag, bubble, material}
let selfEntity=null,playerName='',playerRole='guest';
const chatBubbles=new ChatBubbles(),chatLog=new ChatLog();
const room=new RoomClient({
 url:(location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/ws',
 identity:loadIdentity(typeof localStorage!=='undefined'?localStorage:null),
 connect:url=>new WebSocket(url),storage:typeof localStorage!=='undefined'?localStorage:null,
 onEvent:onRoomEvent,
});
// ---- shared board (Feature 7, U5): op relay, snapshot adoption, LWW ------
// Editor edits apply locally at once (the optimistic application) and relay as
// ordered boardOp events; arriving ops re-enter the same creation/placement
// paths, so every client resolves the board through identical code.
const boardSync=new BoardReplicator(room.identity.id);
let syncingRemote=false; // true while applying remote state — never re-announce it
let messageSyncTimer; // coalesces inspector text keystrokes into one board op
// Free spot hugging the back edge of the park, clear of solids and other players.
function findSpawnSpot(minSeparation=1.5){
 const taken=[...entities.values()].map(entry=>entry.entity.group.position);
 return pickSpawnSpot(spawnCandidates({grid:GRID}),(x,z)=>!taken.some(p=>Math.hypot(p.x-x,p.z-z)<minSeparation)&&avatarPlacement(physics,spawnProbe,x,z));
}
function spawnEntity(player,self=false){
 const material=white.clone();
 const entity=createPlayerEntity({name:player.name,material,self});
 const placement=player.pose?new THREE.Vector3(player.pose.x,player.pose.y,player.pose.z):findSpawnSpot();
 if(placement)entity.setPose({x:placement.x,y:placement.y,z:placement.z,yaw:player.pose?.yaw??0});
 else entity.setPose({x:0,y:0,z:0,yaw:0}); // ring exhausted — still joins, at the park center
 entity.group.userData.playerId=player.id;
 playerGroup.add(entity.group);
 const tag=document.createElement('div');tag.className='player-tag';tag.textContent=nameTagLabel(entity.name,self);tag.dataset.playerId=player.id;$('stage').append(tag);
 entities.set(player.id,{entity,tag,material});
 if(self){selfEntity=entity;room.setPose(entity.pose());}
 return entity;
}
function despawnEntity(id){
 const entry=entities.get(id);if(!entry)return;
 entry.entity.dispose();entry.material.dispose();playerGroup.remove(entry.entity.group);entry.tag.remove();entry.bubble?.remove();
 entities.delete(id);
 if(id===room.identity.id)selfEntity=null;
}
function despawnSelf(){if(selfEntity)despawnEntity(room.identity.id);}
function onRoomEvent(event){
 switch(event.type){
  case 'welcome':
   // The server may have assigned Player-####; adopt and persist it so the
   // name survives reloads and reconnects.
   playerName=event.name;playerRole=event.role;
   if(room.identity.name!==event.name){room.identity.name=event.name;saveIdentity(room.storage,room.identity);}
   syncBoardOnJoin(event.board);
   despawnSelf();spawnEntity({id:event.id,name:event.name},true);
   updatePlayerBadge();notify(`Joined as ${event.name}`);
   break;
  case 'player-join': if(!entities.has(event.player.id))spawnEntity(event.player);break;
  case 'player-leave': entities.get(event.player.id)?.entity.setLeaving(true);break;
  case 'player-remove': despawnEntity(event.id);break;
  case 'player-move': {const entry=entities.get(event.id);if(entry){entry.entity.setLeaving(false);entry.entity.setPose(event.pose);}}break;
  case 'player-update': {const entry=entities.get(event.player.id);if(entry){entry.entity.name=event.player.name;entry.tag.textContent=nameTagLabel(event.player.name,entry.entity.self);updatePlayerBadge();}}break;
  case 'boardOp': if(boardSync.receive(event.op,event.by,event.revision)==='apply')applyRemoteOp(event.op);break;
  case 'roleChange': if(event.playerId===room.identity.id){playerRole=event.role;updatePlayerBadge();}break;
  case 'chat': showChat(event);break;
  case 'status': case 'lost': updatePlayerBadge();break;
  case 'error': if(event.code==='INVALID'||event.code==='FORBIDDEN')boardSync.rejected();notify(event.code==='REPLACED'?'Your identity joined from another tab.':event.code==='BANNED'?'You are banned from this room.':event.code==='KICKED'?'You were removed from the room by the admin.':null);break;
  case 'left': despawnSelf();updatePlayerBadge();notify('You left the board');break;
 }
}
// ---- shared board plumbing -------------------------------------------------
function netObjects(){return [...state.objects,...state.holes];}
function byNetKey(key){return netObjects().find(o=>o.netKey===key)??null;}
// Announce a local edit to the room. 'add' registers the object's network key
// (per-identity prefix + local sequence id); 'update'/'remove' only apply to
// already-registered board members, so simulation-owned scene litter (loose
// sticks, seed piles) stays local until an editor genuinely touches it.
function announce(o,type){
 if(!o||syncingRemote||presentationOnly)return;
 if(!netObjects().includes(o))return; // deleted between edit and announce
 if(room.status!==STATUS.ONLINE||playerRole==='guest')return;
 if(type==='add')o.netKey=o.netKey??localKey(room.identity.id,o.id);
 else if(!o.netKey)return;
 const op={type,objectId:o.netKey,...(type==='remove'?{}:{data:{...objectRecord(o),supportKey:o.support?.netKey??null}})};
 boardSync.local(op);room.sendBoardOp(op);
}
// Joining a room: adopt the delivered board, or — on a fresh, empty room —
// publish the local meadow as the starting board (editors only; guests keep
// theirs private and read-only).
function syncBoardOnJoin(snapshotBoard){
 if(!snapshotBoard)return;
 const entries=Object.entries(snapshotBoard.objects??{});
 if(!entries.length){
  if(playerRole!=='guest'&&!presentationOnly)for(const o of netObjects())if(LABELS[o.type]||o.type==='pool')announce(o,'add');
  return;
 }
 syncingRemote=true;
 try{
  boardSync.adoptSnapshot();
  const keys=new Set(entries.map(([key])=>key));
  for(const o of netObjects())if(o.netKey&&!keys.has(o.netKey))remove(o,true);
  const created=[];
  for(const [key,record] of entries){let o=byNetKey(key);if(!o){o=buildFromRecord(key,record);if(o)created.push([o,record]);}}
  for(const [o,record] of created)applyRecord(o,record);
  refreshJoins();
 }finally{syncingRemote=false;}
}
// Create a scene object from a record delivered under network key `key` — the
// same record-driven hydration path spaces use, so remote results match a
// loaded space exactly. Support links resolve afterwards in applyRecord.
function buildFromRecord(key,record){
 const o=record.type==='pool'?addHole([record.position[0],record.position[2]],record.size??record.gridSize??2):addObject(record.type,null,!!record.hanging,record.cableLength??5,null,0,record.gridSize,record);
 if(o){o.netKey=key;o.support=null;}
 return o;
}
// Bring an existing scene object to the state a delivered record describes.
// The record's numeric ids are the creator's local ids; they remap through the
// creator's network-key prefix. Uncreatable records degrade to a notice.
function applyRecord(o,record){
 const prefix=keyPrefix(o.netKey),map=new Map();
 for(const t of netObjects())if(typeof t.netKey==='string'&&t.netKey.startsWith(prefix+'-'))map.set(Number(t.netKey.slice(prefix.length+1)),t.id);
 map.set(record.id,o.id);
 o.hanging=!!record.hanging;o.cableLength=record.cableLength??5;o.signSlot=record.signSlot??null;
 o.anchor=record.anchor?new THREE.Vector3().fromArray(record.anchor):null;
 o.mesh.position.fromArray(record.position);o.mesh.quaternion.fromArray(record.rotation).normalize();
 o.support=record.supportKey?byNetKey(record.supportKey):null;
 o.properties={...properties(),...structuredClone(record.properties??{})};
 remapActions(o.properties,map);
 applyMaterialProperties(o);
 if(o.grandmaForms)setGrandmaPose(o,!!record.seated,physics);
 decorateSign(o);decorateBoard(o);
 pendulums.syncPose(o);updateCable(o);renderer.shadowMap.needsUpdate=true;
 if(o.type==='pool')refreshHoles();
 if(state.selected===o)select(o);
}
// A delivered op enters the scene through the same paths local edits use.
function applyRemoteOp(op){
 syncingRemote=true;
 try{
  if(op.type==='remove'){const o=byNetKey(op.objectId);if(o)remove(o,true);}
  else{
   let o=byNetKey(op.objectId);
   if(o&&o.type!==(op.data?.type??o.type)){remove(o,true);o=null;} // form changed → rebuild
   if(!o)o=buildFromRecord(op.objectId,op.data);
   if(o)applyRecord(o,op.data);else notify('A shared change could not be applied here.');
  }
  refreshJoins();
 }finally{syncingRemote=false;}
}
function updatePlayerBadge(){
 const name=$('player-name'),toggle=$('leave-board'),edit=$('rename-player');
 $('player-badge').hidden=false;
 if(room.status===STATUS.ONLINE){name.textContent=playerName;edit.hidden=false;toggle.textContent='Leave the board';}
 else if(room.status===STATUS.CLOSED){name.textContent='Left the room';edit.hidden=true;toggle.textContent='Join the board';}
 else if(room.left){name.textContent='Not on the board';edit.hidden=true;toggle.textContent='Join the board';}
 else{name.textContent=room.status===STATUS.CONNECTING?'Joining the meadow…':'Connection lost — retrying…';edit.hidden=true;toggle.textContent='Leave the board';}
}
function beginRename(){
 const input=document.createElement('input');input.maxLength=32;input.value=playerName;input.setAttribute('aria-label','Display name');
 const span=$('player-name');span.replaceChildren(input);input.focus();input.select();let committed=false;
 const commit=()=>{if(committed)return;committed=true;const value=input.value.trim();if(value&&room.rename(value))playerName=room.identity.name;updatePlayerBadge();};
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){e.preventDefault();committed=true;updatePlayerBadge();}});
 input.addEventListener('blur',commit);
}
// ---- chat (Feature 7, U3): bottom-bar input, entity bubbles, session log ----
// Bubbles reuse the name tags' popup path: an HTML overlay projected above the
// author's entity each frame, crisp under the dither. Content is built with
// textContent only — chat is untrusted input.
function showChat(event){
 chatLog.add({id:event.from,name:event.name,text:event.text,at:Date.now()});
 appendChatLog(event.name,event.text);
 const entry=entities.get(event.from);
 if(!entry)return; // a line from a player whose entity is already gone — log keeps it
 chatBubbles.show(event.from,{name:event.name,text:event.text},performance.now());
 if(!entry.bubble){entry.bubble=document.createElement('div');entry.bubble.className='chat-bubble';entry.bubble.setAttribute('role','status');$('stage').append(entry.bubble);}
 entry.bubble.replaceChildren(Object.assign(document.createElement('strong'),{textContent:entry.entity.name}),document.createTextNode(event.text));
 entry.bubble.hidden=false;
}
function stepChatBubbles(now){
 for(const id of chatBubbles.step(now)){
  const entry=entities.get(id);
  if(entry?.bubble){entry.bubble.remove();entry.bubble=null;}
 }
}
function appendChatLog(name,text){
 const list=$('chat-log');if(!list)return;
 const item=document.createElement('li'),who=document.createElement('strong');
 who.textContent=name;item.append(who,document.createTextNode(` ${text}`));
 list.append(item);
 while(list.children.length>MAX_LOG_ENTRIES)list.firstChild.remove();
 if(list.closest('details')?.open)list.scrollTop=list.scrollHeight;
}
function sendChatLine(){
 const composed=composeChatText($('chat-input').value);
 if(!composed.ok){notify(composed.error);return;}
 if(room.left||room.status===STATUS.CLOSED){notify('Join the board to chat');return;}
 // While connecting the room client queues the line and flushes it on welcome.
 room.sendChat(composed.text);
 $('chat-input').value='';
}
$('chat-form').addEventListener('submit',event=>{event.preventDefault();sendChatLine();});
$('chat-input').maxLength=LIMITS.MAX_CHAT_CHARS;
function updateTags(now){
 // Name tags are HTML overlays projected from each entity's head, like the
 // popup messages — crisp under the dither, and easy to hit-test.
 for(const [id,entry] of entities.entries()){
  const point=entry.entity.group.position.clone();point.y+=PLAYER_HEIGHT+.18;point.project(camera);
  const x=(point.x+1)/2*canvas.clientWidth,y=(1-point.y)/2*canvas.clientHeight;
  const visible=point.z<1&&x>=-60&&y>=-60&&x<=canvas.clientWidth+60&&y<=canvas.clientHeight+60;
  entry.tag.hidden=!visible;
  if(visible){entry.tag.style.left=`${x}px`;entry.tag.style.top=`${y}px`;}
  // A chat bubble rides the same projected point, stacked above the name tag;
  // its anchor is clamped so the box never rides up under the page header.
  if(entry.bubble){
   const size=entry.bubble.getBoundingClientRect();
   const anchor=clampBubbleAnchor({x,y,width:size.width||180,height:size.height||30,stageWidth:canvas.clientWidth,stageHeight:canvas.clientHeight});
   entry.bubble.hidden=!visible||!chatBubbles.active(id,now);
   if(visible){entry.bubble.style.left=`${anchor.x}px`;entry.bubble.style.top=`${anchor.y}px`;}}
 }
}
$('rename-player').addEventListener('click',beginRename);
$('leave-board').addEventListener('click',()=>{
 if(room.status===STATUS.ONLINE)room.leave();
 else if(room.status===STATUS.CLOSED||room.left)room.rejoin();
 else notify('Still connecting — try again in a moment');
});
room.connect(); // auto-join on load
const signFocus=new SignFocus(camera,controls);
installTrackpadPan(canvas,camera,controls,()=>presentationOnly||signFocus.active||!!state.drag||!!toolbarDrag);
const poleEye=new PoleEye($('stage'),pole=>{cancelDrag();cancelToolbarDrag();messages.clear();select(null);signFocus.enter(pole,state.objects,canvas.clientWidth,canvas.clientHeight);poleEye.over=false;poleEye.hover=false;poleEye.pole=null;notify('Click empty space to return');});
let hoveredSign=null;
const hopPuffs=new HopPuffs(scene),messageHops=new MessageHops(),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const selectionBox=new THREE.BoxHelper(new THREE.Object3D(),0x57794a);selectionBox.material.depthTest=false;selectionBox.material.transparent=true;selectionBox.material.opacity=.55;selectionBox.visible=false;selectionBox.renderOrder=10;scene.add(selectionBox);
const gridCursor=new DragGrid();scene.add(gridCursor);
const cableMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,transparent:true,depthWrite:false});
cableMaterial.onBeforeCompile=shader=>{
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float cableHeight;').replace('#include <begin_vertex>','#include <begin_vertex>\ncableHeight=(modelMatrix*vec4(transformed,1.)).y;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float cableHeight;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=(1.-smoothstep(4.8,8.4,cableHeight))*.8;');
};
function createCable(object){
 const cable=new THREE.Group();
 const line=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,1,5),cableMaterial);
 const clasp=new THREE.Mesh(new THREE.TorusGeometry(.06,.016,6,12),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8}));
 const handle=new THREE.Mesh(new THREE.TorusGeometry(.13,.022,8,24),new THREE.MeshBasicMaterial({color:0x65745c,transparent:true,opacity:.7,depthTest:false}));
 handle.renderOrder=9;
 const hit=new THREE.Mesh(new THREE.SphereGeometry(.3,12,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
 hit.userData.object=object;hit.userData.anchor=true;
 cable.add(line,clasp,handle,hit);scene.add(cable);object.cable={group:cable,line,clasp,handle,hit};updateCable(object);
}
function updateCable(o){
 renderer.shadowMap.needsUpdate=true;if(!o.cable)return;o.cable.group.visible=o.hanging;o.cable.handle.visible=o.hanging&&state.selected===o&&!o.properties.locked;o.cable.hit.visible=o.cable.handle.visible;if(!o.hanging)return;
 const start=pendulums.attachment(o),direction=o.anchor.clone().sub(start);
 o.cable.line.scale.y=direction.length();o.cable.line.position.copy(start).addScaledVector(direction,.5);
 o.cable.line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
 o.cable.clasp.position.copy(start);o.cable.clasp.quaternion.copy(o.mesh.quaternion);
 o.cable.handle.position.copy(o.anchor);o.cable.handle.quaternion.copy(camera.quaternion);o.cable.hit.position.copy(o.anchor);
}
function refreshHoles(){
 layout.set(state.holes.map(h=>({id:h.id,x:h.mesh.position.x,z:h.mesh.position.z,size:h.size})));
 terrain.rebuild(layout);physics.setTerrain(layout);pendulums.setTerrain(layout);renderer.shadowMap.needsUpdate=true;
 for(const o of state.objects)if(!o.hanging&&!o.support){const delta=new THREE.Vector3(0,physics.supportY(o,o.mesh.position.x,o.mesh.position.z)-o.mesh.position.y,0);const members=stacks.members(o);stacks.translate(members,delta);for(const member of members)pendulums.syncPose(member);}
 refreshJoins();
 for(const item of ecology.strands){const visible=!layout.contains(item.strand.root.x,item.strand.root.z);item.mesh.visible=visible;if(item.head)item.head.visible=visible;}
 for(const o of ecology.loose){const p=o.body.translation();if(p.y<0&&!layout.contains(p.x,p.z)){o.body.setTranslation({x:p.x,y:.06,z:p.z},true);o.body.setLinvel({x:0,y:0,z:0},true);}}
}
function canPlaceHole(size,x,z){
 if(![x,z,size].every(Number.isFinite)||Math.max(Math.abs(x),Math.abs(z))+size/2>=TERRAIN_EXTENT)return false;
 const shape=new RAPIER.Cuboid(size/2,.3,size/2),q={x:0,y:0,z:0,w:1};
 for(const o of state.objects)for(const part of o.parts){const c=shape.contactShape({x,y:-.28,z},q,part.shape,physics.position(part,o.mesh.position,o.mesh.quaternion),o.mesh.quaternion,0);if(c&&c.distance<-.001)return false;}
 return true;
}
function addHole(position=null,size=2){
 if(state.objects.length+state.holes.length>=40){notify('The scene is full.');return null;}
 if(!position){const cx=Math.round(controls.target.x/GRID)*GRID,cz=Math.round(controls.target.z/GRID)*GRID;
  search:for(let z=cz+3.5;z>=cz-6;z-=GRID)for(let x=cx-6;x<=cx+7;x+=GRID)if(canPlaceHole(size,x,z)&&!state.holes.some(h=>Math.abs(x-h.mesh.position.x)<(size+h.size)/2&&Math.abs(z-h.mesh.position.z)<(size+h.size)/2)){position=[x,z];break search;}
 }
 if(!position||!canPlaceHole(size,...position)){notify('No clear ground for this pool.');return null;}
 const geometry=new THREE.BoxGeometry(size,.012,size),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));geometry.computeBoundingBox();mesh.position.set(position[0],.006,position[1]);
 const o={id:++state.sequence,type:'pool',gridSize:size,size,height:.012,geometry,mesh,hanging:false,cableLength:5,parts:[]};o.properties=properties();o.primaryMaterial=white.clone();mesh.userData.object=o;objectGroup.add(mesh);state.holes.push(o);refreshHoles();announce(o,'add');return o;
}
function moveGround(o,target,dragging=false){if(!canManipulate(o,stacks.members(o)))return false;const joinedSnapshot=joining(o)?stacks.snapshot(o):null;if(joinedSnapshot)joining(o)?.refresh(o);const old=o.mesh.position.clone(),members=stacks.members(o),visual=presentation.capture(members),result=(dragging||joining(o))?dragFloor(stacks,o,target):{moved:stacks.move(o,target),relocated:false};if(!result.moved){if(joinedSnapshot)refreshJoins();return false;}if(joinedSnapshot&&!refreshJoins()){stacks.restore(joinedSnapshot);refreshJoins();for(const member of members)pendulums.syncPose(member);return false;}presentation.animate(visual,result.relocated);for(const member of members)pendulums.syncPose(member);if(old.distanceToSquared(o.mesh.position)>1e-8){for(const p of [old,o.mesh.position])if(terrain.at(p.x,p.z))terrain.disturb(p.x,p.z,1.4,.22);}return true;}
function moveHole(o,target){if(o.properties?.locked)return false;if(!canPlaceHole(o.size,target.x,target.z))return false;if(o.mesh.position.distanceToSquared(target)<1e-12)return true;o.mesh.position.copy(target);refreshHoles();return true;}
function addObject(type,position=null,hanging=false,cableLength=5,placement=null,rotation=0,gridSize=2,record=null,photo=null){if(type==='pool')return addHole(position,gridSize??2);if(state.objects.length+state.holes.length>=40){notify('The scene is full — remove a form to add another.');return null;}const form=makeSizedForm(type,RAPIER,gridSize,photo?{photo}:(record??{}));const mesh=new THREE.Mesh(form.meshGeometry??form.geometry,type==='hedge'?applyHedgeSurface(white.clone()):white.clone());mesh.rotation.y=rotation;mesh.castShadow=true;mesh.receiveShadow=true;const o={...form,type,mesh,id:++state.sequence,hanging,cableLength,cable:null,debug:null};o.properties=properties();if(isSign(o))o.properties.messages=[{text:'This way — follow the trail.',choices:[]}];if(o.board)o.properties.messages=[{text:o.board.title,choices:[],action:{type:'board',targetId:o.id,label:'Open board'}}];mesh.userData.object=o;
 if(record?.seated)setGrandmaPose(o,true,physics);
 if(isSign(o)&&placement)applySignPlacement(o,placement);
 if(o.grandmaForms&&placement)applyGrandmaPlacement(o,placement,physics);
 const y=hanging?8.5-cableLength-form.height/2:form.height/2;
 if(record){mesh.position.fromArray(record.position);mesh.quaternion.fromArray(record.rotation).normalize();o.anchor=record.anchor?new THREE.Vector3().fromArray(record.anchor):null;o.properties={...properties(),...structuredClone(record.properties)};if(o.sign&&record.sign)o.sign={...o.sign,...record.sign};o.signSlot=record.signSlot;}
 else if(position){mesh.position.set(position[0],y,position[1]);if(!hanging){mesh.position.y=placement?.position.y??physics.supportY(o,position[0],position[1]);o.support=placement?.support??null;}if(!physics.canPlace(o,mesh.position)){disposeGrandma(o);form.geometry.dispose();mesh.material.dispose();return null;}}
 else {let found=false;const centerX=Math.round(controls.target.x/GRID)*GRID,centerZ=Math.round(controls.target.z/GRID)*GRID;for(let z=centerZ+3.5;z>=centerZ-4.5&&!found;z-=GRID)for(let x=centerX-5.5;x<=centerX+5.5&&!found;x+=GRID){mesh.position.set(x,y,z);mesh.position.y=hanging?y:physics.supportY(o,x,z);if(physics.canPlace(o,mesh.position))found=true;}if(!found){disposeGrandma(o);form.geometry.dispose();mesh.material.dispose();notify('No clear floor space for this form.');return null;}}
 decorateSign(o);decorateBoard(o);decoratePhoto(o);applyMaterialProperties(o);objectGroup.add(mesh);state.objects.push(o);pendulums.add(o);createCable(o);o.debug=new THREE.Mesh(o.geometry,new THREE.MeshBasicMaterial({color:0x597c46,wireframe:true,transparent:true,opacity:.6,depthTest:false}));o.debug.visible=state.debug;o.debug.renderOrder=8;mesh.add(o.debug);if(o.grandmaForms)attachGrandmaRig(o);if(!hydrating&&joining(o)&&!refreshJoins()){remove(o);notify('The connection needs clear space.');return null;}announce(o,'add');return o;}
let noticeTimer;
function notify(text){clearTimeout(noticeTimer);$('notice').textContent=text;$('notice').hidden=!text;if(text)noticeTimer=setTimeout(()=>{$('notice').hidden=true;},3500);}
function select(o){if(presentationOnly)o=null;const changed=state.selected!==o;state.selected=o;
 const list=$('object-list');list.replaceChildren(new Option('Select object',''),...[...state.objects,...state.holes].map(item=>new Option(`${objectSizeLabel(item)} ${item.id}${item.properties.locked?' · locked':''}`,item.id)));list.value=o?.id??'';
 if(changed||!o)inspector.select(o);signInspector.select(o);elementInspector.select(o);
 for(const id of ['rotate','remove','suspended','cable'])$(id).disabled=!!o&&!canManipulate(o,stacks.members(o));for(const form of state.objects){if(form.cable){form.cable.handle.visible=form===o&&form.hanging&&!form.properties.locked;form.cable.hit.visible=form.cable.handle.visible;}}selectionBox.visible=!!o;$('selection-empty').hidden=!!o;$('selection-controls').hidden=!o;if(!o)return;selectionBox.setFromObject(o.mesh);$('object-name').textContent=objectSizeLabel(o);$('surface-values').hidden=!o.stacking;$('surface-values').textContent=o.stacking?`Foot ${+o.stacking.foot.toFixed(1)} · Head ${+o.stacking.head.toFixed(1)}${o.support?' · On '+LABELS[o.support.type]:''}`:'';$('suspended').closest('.switch-row').hidden=o.type==='pool'||isSign(o)||o.type==='sign-pole';$('rotate').hidden=o.type==='pool'||isSign(o)||!!joining(o);const coordinates=o.hanging?o.anchor:o.mesh.position;$('object-coords').textContent=`${coordinates.x.toFixed(2)}, ${coordinates.z.toFixed(2)}`;$('object-coords').title=o.hanging?'Ceiling anchor X, Z':'Floor position X, Z';$('suspended').checked=o.hanging;$('cable-control').hidden=!o.hanging;$('hang-hint').hidden=!o.hanging&&o.type!=='pool';$('hang-hint').textContent=o.type==='pool'?'Drag an edge to move. Touching pools join.':'Drag the top ring to reposition. Pull the form and release to swing.';$('cable').value=o.cableLength;$('cable-value').textContent=`${o.cableLength.toFixed(2)} m`;}
function setHang(o,hanging,length=o.cableLength){
 if(o.type==='pool'||isSign(o)||o.type==='sign-pole'||!canManipulate(o,stacks.members(o)))return false;
 if(joining(o))joining(o)?.refresh(o);
 if(hanging&&stacks.members(o).length>1){notify('Move the objects off the top before hanging this form.');select(o);return false;}
 const position=o.mesh.position.clone(),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),new THREE.Euler().setFromQuaternion(o.mesh.quaternion,'YXZ').y);
 if(joining(o))rotation.identity();
 const anchor=o.hanging?o.anchor.clone():new THREE.Vector3(Math.round(position.x/GRID)*GRID,CEILING_HEIGHT,Math.round(position.z/GRID)*GRID);
 position.x=hanging?anchor.x:Math.round(position.x/GRID)*GRID;position.z=hanging?anchor.z:Math.round(position.z/GRID)*GRID;
 position.y=hanging?CEILING_HEIGHT-length-o.height/2:physics.supportY(o,position.x,position.z,rotation);
 if(!physics.canTravel(o,position)||!physics.canPlace(o,position,rotation)){if(joining(o))refreshJoins();notify('There is another form in the way. Move it clear first.');select(o);return false;}
 o.support=null;o.hanging=hanging;o.cableLength=length;o.anchor=hanging?anchor:null;o.mesh.position.copy(position);o.mesh.quaternion.copy(rotation);
 pendulums.rebuild(o);if(joining(o))refreshJoins();updateCable(o);select(o);announce(o,'update');notify(hanging?'Drag the top ring to place · pull the form to swing':'Placed on the floor · snapped to the grid');return true;
}
function remove(o,force=false){
 if(!o||!force&&!canManipulate(o,stacks.members(o)))return;
 announce(o,'remove');if(signFocus.pole===o)signFocus.exit(true);disposeSign(o);disposeBoard(o);disposePhoto(o);messages.clear();o.emissionLight?.dispose();o.primaryMaterial?.dispose();presentation.clear(o);const children=state.objects.filter(child=>child.support===o);if(state.drag?.object===o)endDrag();if(o.type==='pool'){state.holes.splice(state.holes.indexOf(o),1);objectGroup.remove(o.mesh);o.geometry.dispose();o.mesh.material.dispose();refreshHoles();select(null);return;}pendulums.remove(o);renderer.shadowMap.needsUpdate=true;objectGroup.remove(o.mesh);scene.remove(o.cable.group);
 for(const part of [o.cable.line,o.cable.clasp,o.cable.handle,o.cable.hit]){part.geometry.dispose();if(part.material!==cableMaterial)part.material.dispose();}
 disposeGrandma(o);o.geometry.dispose();o.mesh.material.dispose();o.debug.material.dispose();state.objects.splice(state.objects.indexOf(o),1);refreshJoins();for(const child of children){child.support=null;stacks.settle(child);for(const member of stacks.members(child))pendulums.syncPose(member);}select(null);notify('Form removed');
}
function reset(){boardView.close();signFocus.exit(true);hoveredSign=null;messageHops.reset();hopPuffs.reset();windTrails.reset();cancelToolbarDrag();cancelDrag();for(const o of [...state.objects,...state.holes])remove(o,true);state.sequence=0;
 for(const position of DEFAULT_PARK.pools)addHole(position,2);
 const fountain=addObject('fountain',DEFAULT_PARK.fountain);if(fountain)fountain.properties.messages=[{text:'drag me',choices:[]}];
 for(const bench of DEFAULT_PARK.benches)addObject('bench',bench.position,false,5,null,bench.rotation);
 const grandma=addObject('grandma-skirt-bun');if(grandma){stacks.placeGrandma(grandma,new THREE.Vector3(DEFAULT_PARK.grandma[0],0,DEFAULT_PARK.grandma[1]));pendulums.rebuild(grandma);}
 select(null);terrain.reset();ecology.reset();state.paused=false;$('pause').innerHTML='Pause <span>Ⅱ</span>';$('pause').setAttribute('aria-pressed','false');home();notify('');}

const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3();
function ray(event){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
function hitWater(bath=null,solids=raycaster.intersectObjects(state.objects.map(o=>o.mesh),false)){
 const basin=hitBathWater(raycaster,bath?[...ecology.bathViews.values()].filter(v=>v.field===bath.field):ecology.bathViews.values(),solids);if(bath)return basin;
 const hit=raycaster.intersectObjects(terrain.views.map(v=>v.mesh),false)[0];
 return basin&&(!hit||basin.distance<hit.distance)?basin:hit?{point:hit.point,view:hit.object.userData.waterView,distance:hit.distance}:null;
}
function waterUV(view,p){return view.uv?view.uv(p):terrain.uv(view,p);}
function splash(p,amount=8){const view=terrain.at(p.x,p.z);if(!view)return;const uv=terrain.uv(view,p);view.field.splash(uv.u,uv.v,amount);notify(state.paused?'Ripple queued — resume to see it travel':'Drag through the water to leave a wake');}
const groundRayPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function trackPointer(event){const groundPoint=raycaster.ray.intersectPlane(groundRayPlane,new THREE.Vector3());const rect=canvas.getBoundingClientRect();ecology.setPointer(groundPoint,{x:event.clientX-rect.left,y:event.clientY-rect.top});}
canvas.addEventListener('pointerleave',()=>{ecology.setPointer(null,null);messages.leave();hoveredSign=null;poleEye.target(null);});
const activePointers=new Set();
canvas.addEventListener('pointerdown',e=>{activePointers.add(e.pointerId);if(activePointers.size>1)cancelDrag();},true);
for(const event of ['pointerup','pointercancel'])window.addEventListener(event,e=>activePointers.delete(e.pointerId),true);
function pick(){const restore=presentation.apply();try{return pickScene();}finally{restore();}}
function pickScene(){
 const handles=raycaster.intersectObjects(state.selected?.hanging&&!state.selected.properties.locked?[state.selected.cable.hit]:[],false);
 if(handles.length)return {object:handles[0].object.userData.object,mode:'anchor',hit:handles[0].point};
 const hits=raycaster.intersectObjects(state.objects.map(o=>o.mesh),false),waterHit=hitWater(null,hits);
 if(!presentationOnly&&waterHit?.view.object?.properties.locked)return {locked:true};
 if(waterHit?.view.object)return {water:true,hit:waterHit.point,view:waterHit.view};
 const seeds=ecology.loose.filter(o=>o.type==='seed').map(seed=>{const p=seed.mesh.position.clone().project(camera);return {seed,p,distance:raycaster.ray.origin.distanceTo(seed.mesh.position),pixels:Math.hypot((p.x-pointer.x)*canvas.clientWidth/2,(p.y-pointer.y)*canvas.clientHeight/2)};}).filter(s=>Math.abs(s.p.z)<1&&s.pixels<12&&(!hits.length||s.distance<hits[0].distance+.12)).sort((a,b)=>a.pixels-b.pixels);
 if(seeds.length)return {seed:seeds[0].seed,hit:seeds[0].seed.mesh.position.clone()};
 if(!presentationOnly&&hits[0]?.object.userData.object.properties.locked)return {locked:true};
 if(hits.length)return {object:hits[0].object.userData.object,mode:hits[0].object.userData.object.hanging?'pull':'floor',hit:hits[0].point};
 const p=raycaster.ray.intersectPlane(groundRayPlane,new THREE.Vector3());
 if(p){const holes=[...state.holes].sort((a,b)=>(a===state.selected?-1:0)-(b===state.selected?-1:0));for(const o of holes){const dx=Math.abs(p.x-o.mesh.position.x),dz=Math.abs(p.z-o.mesh.position.z),half=o.size/2;if(dx<=half+.12&&dz<=half+.12&&(Math.abs(dx-half)<.12||Math.abs(dz-half)<.12))return !presentationOnly&&o.properties.locked?{locked:true}:{object:o,mode:'pool',hit:p};}}
 if(!presentationOnly&&waterHit&&state.holes.some(o=>o.properties.locked&&Math.abs(waterHit.point.x-o.mesh.position.x)<=o.size/2&&Math.abs(waterHit.point.z-o.mesh.position.z)<=o.size/2))return {locked:true};
 return waterHit?{water:true,hit:waterHit.point,view:waterHit.view,hoverObject:state.holes.find(o=>Math.abs(waterHit.point.x-o.mesh.position.x)<=o.size/2&&Math.abs(waterHit.point.z-o.mesh.position.z)<=o.size/2)}:null;
}
// Pick the visible surface, then release above its highest point so grains never spawn inside a solid.
function seedDropPoint(spread=0){
 const hits=raycaster.intersectObjects([...state.objects.map(o=>o.mesh),...terrain.group.children.filter(o=>o.isMesh)],false),hit=hits[0];
 const p=hit?hit.point.clone():raycaster.ray.intersectPlane(groundRayPlane,new THREE.Vector3());if(!p)return null;
 if(hit?.object.userData.object){const o=hit.object.userData.object;p.y=Math.max(p.y,new THREE.Box3().setFromObject(o.mesh).max.y);}
 if(spread){const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*spread;p.x+=Math.cos(a)*r;p.z+=Math.sin(a)*r;}
 return p;
}
canvas.addEventListener('pointerdown',event=>{
 if(boardView.active)return;if(event.button!==0||activePointers.size>1)return;if(signFocus.active){ray(event);if(!pick())signFocus.exit();return;}
 // Player avatars intercept the pointer before scene editing: your own entity
 // drags kinematically through this same pipeline; other players' entities are
 // refused (and work in presentation mode, where scene editing is disabled).
 ray(event);
 const playerHit=raycaster.intersectObjects(playerGroup.children,true)[0];
 if(playerHit){
  const hitId=playerHit.object.parent?.userData?.playerId??playerHit.object.userData?.playerId;
  if(hitId&&hitId!==room.identity.id){const other=entities.get(hitId);notify(other?`${other.entity.name} moves their own player`:'');return;}
  if(selfEntity){
   const planePoint=raycaster.ray.intersectPlane(groundRayPlane,new THREE.Vector3());if(!planePoint)return;
   canvas.focus({preventScroll:true});
   state.drag={mode:'avatar',id:event.pointerId,offset:new THREE.Vector3(planePoint.x-selfEntity.group.position.x,0,planePoint.z-selfEntity.group.position.z),previous:selfEntity.group.position.clone(),lastTarget:null,blocked:false};
   canvas.setPointerCapture(event.pointerId);controls.enabled=false;canvas.style.cursor='grabbing';
   notify('Drag your player · release to place · Esc to cancel');
  }
  return;
 }
 if(presentationOnly)return;canvas.focus({preventScroll:true});ray(event);trackPointer(event);const picked=pick();
 messages.clear();
 if(state.mouseMode==='seed'){const p=seedDropPoint();if(p)ecology.scatterFood(p);state.drag={mode:'feed',id:event.pointerId,last:performance.now(),lastPoint:p?.clone()};canvas.setPointerCapture(event.pointerId);controls.enabled=false;return;}
 if(picked?.locked)return;
 if(picked?.seed){
  select(null);const seed=picked.seed;plane.set(new THREE.Vector3(0,1,0),0);if(!raycaster.ray.intersectPlane(plane,point))return;
  sling.begin(seed);state.drag={mode:'seed',id:event.pointerId,offset:seed.mesh.position.clone().sub(point)};slingGuide.update(sling);controls.enabled=false;canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';notify('Pull back · release to launch · Esc to cancel');
 }else if(picked?.object){
  const o=picked.object,mode=picked.mode;if(!canManipulate(o,stacks.members(o)))return;if(joining(o)&&mode==='floor')joining(o)?.refresh(o);select(o);
  if(mode==='pull')plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),picked.hit);
  else plane.set(new THREE.Vector3(0,1,0),-(mode==='anchor'?CEILING_HEIGHT:o.mesh.position.y));
  if(!raycaster.ray.intersectPlane(plane,point))return;
  state.drag={object:o,mode,offset:(mode==='anchor'?o.anchor:o.mesh.position).clone().sub(point),snapshot:mode==='floor'?stacks.snapshot(o):mode==='pool'?{position:o.mesh.position.clone()}:pendulums.snapshot(o),id:event.pointerId,samples:[]};
  if(mode==='floor'||mode==='anchor')dragGhost.begin(mode==='floor'?stacks.members(o):[o]);
  if(mode==='anchor')pendulums.beginAnchor(o);if(mode==='pull'){presentation.clear(o);pendulums.beginPull(o);}
  canvas.setPointerCapture(event.pointerId);controls.enabled=false;gridCursor.setObject(o);gridCursor.position.set(o.mesh.position.x,0,o.mesh.position.z);gridCursor.visible=mode!=='pull';canvas.style.cursor='grabbing';
  notify(mode==='pull'?'Pull freely · release to swing · Esc to cancel':mode==='anchor'?'Reposition the ceiling anchor · grid locked':'Grid locked · release to place · Esc to cancel');
 }else if(picked?.water){select(null);if(picked.view.object)picked.view.splash(picked.hit);else splash(picked.hit);state.drag={water:true,bath:picked.view.object?picked.view:null,id:event.pointerId,last:performance.now(),previous:waterUV(picked.view,picked.hit),view:picked.view};canvas.style.cursor='crosshair';canvas.setPointerCapture(event.pointerId);controls.enabled=false;}
 else{select(null);notify('');}
});
function moveScenePointer(event){
 ray(event);trackPointer(event);if(!state.drag){const hit=pick();const hoverObject=hit?.object??hit?.view?.object??hit?.hoverObject;hoveredSign=isSign(hoverObject)&&(presentationOnly||!hoverObject.properties.locked)?hoverObject:null;poleEye.target(hoverObject);messages.target(state.mouseMode==='drag'?(hit?.object??hit?.view?.object??hit?.hoverObject):null);canvas.style.cursor=presentationOnly?'default':state.mouseMode==='seed'?'crosshair':hit?.locked?'default':hit?.object||hit?.seed?'grab':hit?.water?'crosshair':'default';return;}
 if(state.drag.id!==event.pointerId)return;
 if(state.drag.mode==='feed'){const p=seedDropPoint(),now=performance.now();if(p&&now-state.drag.last>180&&(!state.drag.lastPoint||p.distanceTo(state.drag.lastPoint)>.035)){ecology.scatterFood(seedDropPoint(.25));state.drag.last=now;state.drag.lastPoint=p.clone();}return;}
 if(state.drag.water){const p=hitWater(state.drag.bath),now=performance.now();if(p){const uv=waterUV(p.view,p.point);if(state.drag.previous&&(state.drag.view===p.view||state.drag.view?.field===p.view.field)){if(p.view.stroke)p.view.stroke(state.drag.previous,uv,(now-state.drag.last)/1000);else p.view.field.stroke(state.drag.previous,uv,(now-state.drag.last)/1000);}state.drag.previous=uv;state.drag.view=p.view;}else state.drag.previous=null;state.drag.last=now;return;}
 if(state.drag.mode==='avatar'){
  if(!raycaster.ray.intersectPlane(groundRayPlane,point))return;
  const rawTarget=point.clone().add(state.drag.offset);
  const placement=avatarPlacement(physics,spawnProbe,rawTarget.x,rawTarget.z);
  if(placement){selfEntity.setPose({x:placement.x,y:placement.y,z:placement.z,yaw:selfEntity.group.rotation.y});room.setPose(selfEntity.pose());}
  state.drag.blocked=!placement;
  notify(placement?'Grid locked · release to place':'Move to a clear spot');
  return;
 }
 if(!raycaster.ray.intersectPlane(plane,point))return;
 const {object:o,mode}=state.drag,target=point.clone().add(state.drag.offset);
 if(mode==='seed'){sling.aim(target);slingGuide.update(sling);return;}
 if(mode==='pull'){pendulums.setPullTarget(target);return;}
 if(isSign(o)&&mode==='floor'){const hit=raycaster.intersectObjects(state.objects.filter(item=>item!==o).map(item=>item.mesh),false)[0]?.object.userData.object;const pole=hit?.type==='sign-pole'?hit:hit?.support?.type==='sign-pole'?hit.support:null;if(pole){target.x=pole.mesh.position.x;target.z=pole.mesh.position.z;}}
 const rawTarget=target.clone();
 if(state.drag.blocked&&mode!=='pool')dragGhost.show(new THREE.Vector3(rawTarget.x-(mode==='anchor'?o.anchor.x:o.mesh.position.x),state.drag.ghostY-o.mesh.position.y,rawTarget.z-(mode==='anchor'?o.anchor.z:o.mesh.position.z)));
 target.x=Math.round(target.x/GRID)*GRID;target.z=Math.round(target.z/GRID)*GRID;target.y=mode==='anchor'?CEILING_HEIGHT:o.mesh.position.y;
 // Pointer events often repeat the same snapped target. Do collision work once.
 if(state.drag.lastTarget?.equals(target)&&!state.drag.blocked)return;
 state.drag.lastTarget=target.clone();
 gridCursor.position.set(target.x,0,target.z);
 let moved;
 if(mode==='anchor'){const visual=presentation.capture([o]),result=dragAnchor(pendulums,physics,o,target);moved=result.moved;if(moved)presentation.animate(visual,result.relocated);}
 else moved=mode==='pool'?moveHole(o,target):moveGround(o,target,true);
 state.drag.blocked=!moved;
 if(moved)dragGhost.hide();else if(mode!=='pool'){state.drag.ghostY=mode==='anchor'?o.mesh.position.y:stacks.supports(o,target.x,target.z)[0].y;dragGhost.show(new THREE.Vector3(rawTarget.x-(mode==='anchor'?o.anchor.x:o.mesh.position.x),state.drag.ghostY-o.mesh.position.y,rawTarget.z-(mode==='anchor'?o.anchor.z:o.mesh.position.z)));}

 if(moved){const placed=mode==='anchor'?o.anchor:o.mesh.position;gridCursor.position.set(placed.x,0,placed.z);state.drag.dirty=true;}
if(mode==='floor'&&moved)trackSample(state.drag.samples,o,event.timeStamp);
 gridCursor.material.color.set(moved?0x57794a:0x995548);notify(moved?'Grid locked · release to place · Esc to cancel':'Move the ghost to a clear spot');updateCable(o);select(o);
}
canvas.addEventListener('pointermove',event=>{if(!state.drag)moveScenePointer(event);});
// Release settle: a quick fling tosses the form ballistically to the next
// support; any other release simply rests where the drag left it. moveGround is
// the same transactional path drags use, so a rejected landing keeps the last
// valid position (pool basins resolve through the existing support query).
function applySettle(o,now){
 const plan=settleSolver.planRelease(o,releaseVelocity(state.drag?.samples,now));
 return plan?plan.to:null;
}
function endDrag(e,cancel=false){
if(!state.drag||e&&e.pointerId!==state.drag.id)return;const {id,object,mode,dirty}=state.drag;
// Planned before cleanup (it reads the drag's samples), applied after: the
// ghost and cursor reset first, then the settle eases to its landing cell.
const settle=mode==='floor'&&!cancel&&e?applySettle(object,e.timeStamp):null;
 if(mode==='seed'){if(cancel)sling.cancel();else sling.release();slingGuide.update(sling);notify('');}
 if(mode==='pull'){pendulums.releasePull();notify('Released · gravity takes over');}
 if(mode==='anchor'){pendulums.endAnchor(object);notify('Anchor placed · pull the hanging form to swing');}
 if(mode==='avatar'&&!cancel&&selfEntity)room.setPose(selfEntity.pose());
dragGhost.end();state.drag=null;if(joining(object))refreshJoins();gridCursor.visible=false;controls.enabled=!signFocus.active&&!presentationOnly;canvas.style.cursor=state.mouseMode==='seed'?'crosshair':'default';if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
if(settle)moveGround(object,settle,true);
// Announce after the settle lands so the relayed record carries the final
// resting position, not the mid-drag one.
if(!cancel&&dirty&&object&&(mode==='floor'||mode==='pool'||mode==='anchor'))announce(object,'update');
}
function cancelDrag(){const drag=state.drag;endDrag(null,true);if(drag?.mode==='avatar'&&selfEntity){selfEntity.group.position.copy(drag.previous);room.setPose(selfEntity.pose());}if(drag?.object){if(drag.mode==='pool'){drag.object.mesh.position.copy(drag.snapshot.position);refreshHoles();}else if(drag.mode==='floor'){stacks.restore(drag.snapshot);for(const s of drag.snapshot){presentation.clear(s.object);pendulums.syncPose(s.object);}}else{presentation.clear(drag.object);pendulums.restore(drag.object,drag.snapshot);}if(joining(drag.object))refreshJoins();updateCable(drag.object);select(drag.object);notify('Drag cancelled');}}
bindDragPointer(window,canvas,{getDrag:()=>state.drag,move:moveScenePointer,end:endDrag,cancel:cancelDrag});window.addEventListener('blur',()=>{cancelDrag();activePointers.clear();ecology.setPointer(null,null);});canvas.addEventListener('contextmenu',e=>e.preventDefault());
function placeForm(o,x,z){
 if(!canManipulate(o,stacks.members(o))||presentationOnly)return false;
 const target=new THREE.Vector3(Math.round(x/GRID)*GRID,o.hanging?CEILING_HEIGHT:o.mesh.position.y,Math.round(z/GRID)*GRID);
 const result=o.type==='pool'?moveHole(o,target):o.hanging?pendulums.moveAnchor(o,target,physics):moveGround(o,target);
 if(result)announce(o,'update');updateCable(o);select(o);return result;
}
canvas.addEventListener('keydown',e=>{
 if(signFocus.active){if(e.key==='Escape')signFocus.exit();return;}if(presentationOnly)return;const o=state.selected;if(e.key==='Escape'){cancelDrag();select(null);return;}if(!o)return;
 const dirs={ArrowLeft:[-GRID,0],ArrowRight:[GRID,0],ArrowUp:[0,-GRID],ArrowDown:[0,GRID]};
 if(dirs[e.key]){e.preventDefault();const [x,z]=dirs[e.key],p=o.hanging?o.anchor:o.mesh.position;if(!placeForm(o,p.x+x,p.z+z))notify('Occupied — choose a clear path');}
 if(e.key.toLowerCase()==='r')rotateSelected();if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove(o);}
});
function rotateSelected(){const o=state.selected;if(signFocus.active||!o||!canManipulate(o,stacks.members(o))||o.type==='pool'||!!joining(o))return;const members=stacks.members(o),visual=presentation.capture(members),pivot=(isSign(o)&&o.support?.type==='sign-pole'?o.support.mesh.position:o.mesh.position).clone();if(!(o.hanging?physics.rotate(o):stacks.rotate(o)))notify('Not enough clearance to rotate');else{presentation.animate(visual,false,pivot);for(const member of members)pendulums.syncPose(member);notify(isSign(o)?'Rotated 45°':'Rotated 90°');announce(o,'update');}updateCable(o);select(o);}
for(const button of document.querySelectorAll('[data-add]'))button.addEventListener('click',()=>{const o=addObject(button.dataset.add,null,false,5,null,0,+button.dataset.gridSize||2);if(o){select(o);notify(o.type==='birdbath'?'Bird bath added · leave it quiet for visitors':o.type==='pool'?'Pool added · drag an edge to move':`${objectSizeLabel(o)} added · drag it into place`);canvas.focus({preventScroll:true});}});
let pickerFamily='plant';
const pickerTypes={plant:'plant-snake-medium',table:'table-round-full',grandma:'grandma-skirt-bun',sign:'sign-arrow-text',home:'chair'};
function openPicker(family){
 closeSizeMenu();pickerFamily=family;const plant=family==='plant',grandma=family==='grandma',sign=family==='sign',home=family==='home';
 $('picker-title').textContent=sign?'Sign':grandma?'Grandma':plant?'Potted plant':home?'Home':'Table';$('variant-label').textContent=sign?'Shape':grandma?'Outfit':plant?'Plant':home?'Model':'Shape';
 $('size-label').textContent=sign?'Contents':grandma?'Hair & hat':'Size';
 const variants=sign?Object.entries(SIGN_VARIANTS):grandma?Object.entries(GRANDMA_OUTFITS):home?Object.entries(HOUSEHOLD_MODELS):plant?Object.entries(PLANTS):[['round','Round'],['square','Square']];
 const sizes=sign?[['text','Icon, text & arrow'],['icon','Icon & arrow']]:grandma?Object.entries(GRANDMA_HAIR):[['1','Small'],['2','Medium'],['3','Large']];
 $('object-variant').replaceChildren(...variants.map(([value,label])=>new Option(label,value)));
 $('object-size').replaceChildren(...sizes.map(([value,label])=>new Option(label,value)));
 const remembered=pickerTypes[family].split('-');$('object-variant').value=home?pickerTypes[family].replace(/^home-/,''):remembered[1];$('object-size').value=sign||grandma?remembered[2]:(document.getElementById('add-'+family).dataset.gridSize||'2');$('picker-scale-wrap').hidden=!sign&&!grandma;$('picker-scale').value=document.getElementById('add-'+family).dataset.gridSize||'2';
 $('picker-hint').textContent=sign?'Drag onto a sign pole. Each sign can point in its own direction.':grandma?'Occasionally scatters birdseed. Drag onto a park bench to sit.':home?'Choose a household model and size.':plant?'Choose a plant and size.':'Choose a shape and size.';
 $('object-picker').showModal();
}
$('add-sign').addEventListener('click',()=>openPicker('sign'));
$('add-plant').addEventListener('click',()=>openPicker('plant'));
$('add-grandma').addEventListener('click',()=>openPicker('grandma'));
$('add-table').addEventListener('click',()=>openPicker('table'));
$('add-home').addEventListener('click',()=>openPicker('home'));
$('picker-close').addEventListener('click',()=>$('object-picker').close());
$('picker-form').addEventListener('submit',event=>{
 event.preventDefault();const familyOptions=pickerFamily==='grandma'||pickerFamily==='sign',size=+(familyOptions?$('picker-scale').value:$('object-size').value),suffix=familyOptions?$('object-size').value:pickerFamily==='plant'?'medium':'full',type=pickerFamily==='home'?`home-${$('object-variant').value}`:`${pickerFamily}-${$('object-variant').value}-${suffix}`;document.getElementById('add-'+pickerFamily).dataset.gridSize=size;
 pickerTypes[pickerFamily]=type;const o=addObject(type,null,false,5,null,0,size);if(o){$('object-picker').close();select(o);notify(`${objectSizeLabel(o)} added · drag it into place`);canvas.focus({preventScroll:true});}
 else $('picker-hint').textContent='No clear space here. Close this picker, pan to an open area, or remove a form and try again.';
});
// Toolbar drags use a disposable preview; commit only on a valid scene drop.
var toolbarDrag=null;
let suppressToolbarClick=null;
const toolbar=document.querySelector('.toolbar');
const closeSizeMenu=installSizeMenu(toolbar,(type,size)=>{const o=addObject(type,null,false,5,null,0,size);if(o){select(o);canvas.focus({preventScroll:true});}},{typeFor:toolbarType,onVariants:button=>openPicker(button.id.replace('add-',''))});
function toolbarType(button){return button.dataset.add??pickerTypes[button.id.replace('add-','')];}
function updateToolbarDrag(event){
 const drag=toolbarDrag;if(!drag?.preview)return;
 ray(event);let hit=raycaster.ray.intersectPlane(groundRayPlane,new THREE.Vector3());
 // A drop on a tabletop should use that surface's X/Z, not the floor behind it.
 if(drag.type!=='pool'){
  const surface=raycaster.intersectObjects(state.objects.map(o=>o.mesh),false)[0];
  if(isSign(drag.preview)){const item=surface?.object.userData.object,pole=item?.type==='sign-pole'?item:item?.support?.type==='sign-pole'?item.support:null;if(pole)hit=pole.mesh.position.clone();}
  if(surface?.face&&surface.face.normal.clone().transformDirection(surface.object.matrixWorld).y>.7){
   const x=Math.round(surface.point.x/GRID)*GRID,z=Math.round(surface.point.z/GRID)*GRID;
   const placement=placementAt(stacks,drag.preview,x,z);
   if(placement?.support===surface.object.userData.object)hit=surface.point;
  }
 }
 drag.placement=null;drag.preview.mesh.visible=document.elementFromPoint(event.clientX,event.clientY)===canvas&&!!hit;
 gridCursor.visible=drag.preview.mesh.visible;if(!gridCursor.visible)return;
 const x=Math.round(hit.x/GRID)*GRID,z=Math.round(hit.z/GRID)*GRID,o=drag.preview;
 if(o.type==='pool'){
  if(canPlaceHole(drag.gridSize,x,z))drag.placement={position:new THREE.Vector3(x,.006,z),support:null};
 }else drag.placement=placementAt(stacks,o,x,z);
 o.mesh.position.copy(drag.placement?.position??new THREE.Vector3(x,o.type==='pool'?.006:physics.supportY(o,x,z),z));
 gridCursor.position.set(x,.02,z);gridCursor.material.color.set(drag.placement?0x57794a:0x995548);
 o.mesh.material.opacity=drag.placement?.55:.22;
 canvas.style.cursor=drag.placement?'copy':'not-allowed';
}
function finishToolbarDrag(event,cancel=false){
 const drag=toolbarDrag;if(!drag||event&&event.pointerId!==drag.id)return;
 if(drag.preview&&event&&!cancel)updateToolbarDrag(event);
 toolbarDrag=null;
 if(drag.started){suppressToolbarClick={button:drag.button,until:performance.now()+500};event?.preventDefault();event?.stopPropagation();}
 if(drag.button.hasPointerCapture(drag.id))drag.button.releasePointerCapture(drag.id);
 drag.button.classList.remove('dragging');controls.enabled=true;gridCursor.visible=false;canvas.style.cursor='default';
 if(drag.preview){scene.remove(drag.preview.mesh);disposeGrandma(drag.preview);drag.preview.geometry.dispose();drag.preview.mesh.material.dispose();}
 if(drag.started&&!cancel&&drag.placement){
  const {position}=drag.placement,o=addObject(drag.type,[position.x,position.z],false,5,drag.placement,0,drag.preview?.gridSize??null);
  if(o){select(o);notify('');canvas.focus({preventScroll:true});}
 }else if(drag.started)notify('');
}
function cancelToolbarDrag(){finishToolbarDrag(null,true);}
toolbar.addEventListener('pointerdown',event=>{
 const button=event.target.closest('button[data-add],#add-plant,#add-table,#add-grandma,#add-sign,#add-home');
 if(!button||event.button!==0||toolbarDrag||state.drag||signFocus.active)return;
 toolbarDrag={id:event.pointerId,button,type:toolbarType(button),gridSize:+button.dataset.gridSize||2,x:event.clientX,y:event.clientY,started:false,preview:null,placement:null};
 button.setPointerCapture(event.pointerId);
});
toolbar.addEventListener('dragstart',event=>event.preventDefault());
toolbar.addEventListener('click',event=>{
 if(suppressToolbarClick&&performance.now()<suppressToolbarClick.until&&suppressToolbarClick.button.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();}
 suppressToolbarClick=null;
},true);
window.addEventListener('pointermove',event=>{
 const drag=toolbarDrag;if(!drag||drag.id!==event.pointerId)return;
 if(!drag.started){
  if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
  drag.started=true;controls.enabled=false;drag.button.classList.add('dragging');
  if(state.objects.length+state.holes.length>=40){finishToolbarDrag(event,true);notify('The scene is full — remove a form to add another.');return;}
  const form=drag.type==='pool'?{geometry:new THREE.BoxGeometry(drag.gridSize,.012,drag.gridSize),height:.012,size:drag.gridSize,gridSize:drag.gridSize}:makeSizedForm(drag.type,RAPIER,drag.gridSize);
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,transparent:true,opacity:.55,depthWrite:false});
  if(drag.type==='hedge')applyHedgeSurface(material);
  const mesh=new THREE.Mesh(form.geometry,material);mesh.raycast=()=>{};drag.preview={...form,type:drag.type,mesh};scene.add(mesh);gridCursor.setObject(drag.preview);
 }
 event.preventDefault();event.stopPropagation();updateToolbarDrag(event);
},{capture:true,passive:false});
window.addEventListener('pointerup',event=>finishToolbarDrag(event),true);
window.addEventListener('pointercancel',event=>finishToolbarDrag(event,true),true);
toolbar.addEventListener('lostpointercapture',event=>{if(toolbarDrag?.id===event.pointerId)cancelToolbarDrag();});
// Photo to object: the toolbar button opens a hidden image input (the spaces
// import pattern); the pipeline places the object near the view and reports
// its own progress. No drag-preview: a photo needs the file dialog first.
const photoFile=document.createElement('input');photoFile.type='file';photoFile.accept='image/*';photoFile.hidden=true;photoFile.setAttribute('aria-label','Choose a photo to place');document.body.append(photoFile);
$('add-photo').addEventListener('click',()=>{if(!signFocus.active)photoFile.click();});
photoFile.addEventListener('change',async()=>{const file=photoFile.files?.[0];photoFile.value='';if(!file)return;const o=await handlePhotoFile(file,RAPIER,addObject,notify);if(o){select(o);canvas.focus({preventScroll:true});}});
window.addEventListener('blur',cancelToolbarDrag);
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&toolbarDrag){cancelToolbarDrag();event.preventDefault();event.stopPropagation();}},true);
let boardControlsEnabled=false;
const boardView=new BoardView(()=>{cancelDrag();cancelToolbarDrag();messages.clear();boardControlsEnabled=controls.enabled;controls.enabled=false;},()=>{controls.enabled=boardControlsEnabled&&!presentationOnly&&!signFocus.active;canvas.focus({preventScroll:true});});
const exitView=document.createElement('button');exitView.id='exit-view';exitView.type='button';exitView.textContent='×';exitView.title='Exit view';exitView.setAttribute('aria-label','Exit view');exitView.hidden=true;document.body.append(exitView);exitView.onclick=()=>{signFocus.exit();canvas.focus({preventScroll:true});};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&signFocus.active&&!boardView.active&&!editableTarget(event.target)){signFocus.exit();event.preventDefault();}});
function openBoard(o){if(!o?.board||!boardView.open(o.board))notify('Set a valid page URL first.');}
const messages=new ObjectMessages($('stage'),action=>{
 const object=[...state.objects,...state.holes].find(o=>o.id===action.targetId);if(!object){notify('That object is no longer in this space.');return;}
 if(action.type==='board'){openBoard(object);return;}
 cancelDrag();cancelToolbarDrag();messages.clear();signFocus.enter(object,state.objects,canvas.clientWidth,canvas.clientHeight,{front:object.type==='sign-pole'});
});messages.allowLocked=presentationOnly;
function editForm(o,type,config){
 if(!o||!canManipulate(o)||state.objects.some(child=>child.support===o)){notify('Move anything resting on this object before changing its shape.');return false;}
 try{const form=makeSizedForm(type,RAPIER,o.gridSize??2,config);
  if(!replaceForm(o,form,type,physics)){notify('This shape needs more room. Move it clear first.');return false;}
  disposeSign(o);disposeBoard(o);decorateSign(o);decorateBoard(o);disposePhoto(o);decoratePhoto(o);pendulums.rebuild(o);presentation.clear(o);updateCable(o);renderer.shadowMap.needsUpdate=true;select(o);return true;
 }catch(error){notify(error.message);return false;}
}
const signInspector=new SignInspector($('selection-controls'),o=>{if(o===state.selected)rotateSelected();},(o,variant,mode)=>{
 const old={...o.sign};if(editForm(o,`sign-${variant}-${mode}`,{})){Object.assign(o.sign,{label:old.label,icon:old.icon,arrow:old.arrow});disposeSign(o);decorateSign(o);}select(o);
});
const elementInspector=new ElementInspector($('selection-controls'),(o,key,value)=>{
 if(o.properties.locked)return;
 if(o.letter){editForm(o,'letter',{letter:{...o.letter,[key==='letter-font'?'font':'character']:value}});}
 else if(key==='board-url'){if(actionURL(value)){o.board.url=value;}else notify('Use an http or https page URL.');}
 else if(o.board){o.board.title=value;disposeBoard(o);decorateBoard(o);}
 elementInspector.select(o);
},openBoard);
const inspector=new ObjectInspector($('selection-controls'),(o,kind)=>{
 if(kind==='locked'){cancelDrag();messages.clear();select(o);}
 else if(['tone','reflectance','emittance'].includes(kind)){presentation.clear(o);applyMaterialProperties(o);renderer.shadowMap.needsUpdate=true;}
 else {messages.player.index=0;messages.render();}
 // Relay property edits; text keystrokes coalesce into one op after a pause.
 if(kind==='message-text'){clearTimeout(messageSyncTimer);messageSyncTimer=setTimeout(()=>announce(o,'update'),600);}
 else announce(o,'update');
},()=>[...state.objects,...state.holes]);
$('object-list').addEventListener('change',e=>select([...state.objects,...state.holes].find(o=>o.id===+e.target.value)??null));
function mouseMode(mode){cancelDrag();cancelToolbarDrag();state.mouseMode=mode;ecology.feedingMode=mode==='seed';$('mode-drag').setAttribute('aria-pressed',String(mode==='drag'));$('mode-seed').setAttribute('aria-pressed',String(mode==='seed'));$('seed-count').hidden=mode!=='seed';canvas.style.cursor=mode==='seed'?'crosshair':'default';messages.clear();}
$('mode-drag').onclick=()=>mouseMode('drag');$('mode-seed').onclick=()=>mouseMode('seed');
function updateTheme(){document.documentElement.style.setProperty('--message-ink',$('ink-color').value);document.documentElement.style.setProperty('--message-paper',$('paper-color').value);applySceneTheme(document.documentElement,{ink:$('ink-color').value,paper:$('paper-color').value,strength:+$('light-strength').value/100,dither:+$('dither').value});}
for(const id of ['ink-color','paper-color','light-strength','dither'])$(id).addEventListener('input',updateTheme);
updateTheme();
for(const [id,uniform] of [['ink-color','inkColor'],['paper-color','paperColor']]){
 const updateColor=()=>{const hex=parseInt($(id).value.slice(1),16);dither.uniforms[uniform].value.set(((hex>>16)&255)/255,((hex>>8)&255)/255,(hex&255)/255);};
 $(id).addEventListener('input',updateColor);updateColor();
}
$('sun').addEventListener('input',e=>{setSun(+e.target.value);$('sun-value').textContent=e.target.value+'°';});$('light-strength').addEventListener('input',e=>{const strength=+e.target.value/100;sun.intensity=3.8*strength;ambient.intensity=1.25*strength;$('light-strength-value').textContent=e.target.value+'%';});
$('dither').addEventListener('input',e=>{const scale=+e.target.value;dither.uniforms.scale.value=scale;$('dither-value').textContent=scale===0?'0 · Off':scale+' px';$('ink').disabled=scale===0;$('tone-colors').disabled=scale===0;$('tone-hint').textContent=scale===0?'Turn dithering on to use ink and paper colors.':'Two-tone uses just these two colors. Turn it off for shades between them.';$('ink').closest('.switch-row').classList.toggle('is-disabled',scale===0);});$('ink').addEventListener('change',e=>dither.uniforms.ink.value=+e.target.checked);$('wind').addEventListener('input',e=>{wind.strength=+e.target.value/100;$('wind-value').textContent=+e.target.value===0?'Calm':e.target.value+'%';});$('wind-turbulence').addEventListener('input',e=>{wind.turbulence=+e.target.value/100;$('wind-turbulence-value').textContent=e.target.value+'%';});$('wind-direction').addEventListener('input',e=>{wind.direction=+e.target.value;$('wind-direction-value').textContent=e.target.value+'°';});$('ripple').addEventListener('click',()=>{const h=state.selected?.type==='pool'?state.selected:state.holes[0];if(h)splash(h.mesh.position,10);});$('pause').addEventListener('click',()=>{state.paused=!state.paused;$('pause').innerHTML=state.paused?'Resume <span>▷</span>':'Pause <span>Ⅱ</span>';$('pause').setAttribute('aria-pressed',String(state.paused));});$('home').addEventListener('click',()=>{if(!signFocus.active)home();});$('reset').addEventListener('click',reset);$('rotate').addEventListener('click',rotateSelected);$('remove').addEventListener('click',()=>remove(state.selected));$('suspended').addEventListener('change',e=>state.selected&&setHang(state.selected,e.target.checked));$('cable').addEventListener('input',e=>state.selected&&setHang(state.selected,true,+e.target.value));$('colliders').addEventListener('change',e=>{state.debug=e.target.checked;for(const o of state.objects)o.debug.visible=state.debug;notify(state.debug?'Collision shapes visible · the arch opening is clear':'Collision shapes hidden');});$('settings-toggle').addEventListener('click',()=>{$('inspector').classList.toggle('open');$('settings-toggle').setAttribute('aria-expanded',String($('inspector').classList.contains('open')));});
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);composer.setSize(w,h);const aspect=w/h,available=w<760?w-26:w-305,vertical=Math.max(8.6,19.5*h/(2*available));camera.left=-vertical*aspect;camera.right=vertical*aspect;camera.top=vertical;camera.bottom=-vertical;camera.setViewOffset(w,h,presentationOnly||w<760?0:130,0,w,h);camera.updateProjectionMatrix();dither.uniforms.resolution.value.set(w,h);renderer.getDrawingBufferSize(dither.uniforms.bufferResolution.value);hangingFocus.resize(w,h);refraction.resize(w,h);}

const environmentIds=['sun','light-strength','dither','ink','ink-color','paper-color','wind','wind-turbulence','wind-direction'];
function captureSpace(){return {version:1,objects:[...state.holes,...state.objects].map(objectRecord),camera:{position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom},environment:Object.fromEntries(environmentIds.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]))};}
function loadSpace(input){
 const space=validateSpace(structuredClone(input),new Set([...Object.keys(LABELS),'pool']));cancelDrag();cancelToolbarDrag();boardView.close();signFocus.exit(true);messages.clear();messageHops.reset();hopPuffs.reset();
 hydrating=true;const byId=new Map();
 try{for(const o of [...state.objects,...state.holes])remove(o,true);state.sequence=0;
  for(const record of [...space.objects].sort((a,b)=>(a.type==='pool'?0:1)-(b.type==='pool'?0:1))){
   const o=record.type==='pool'?addHole([record.position[0],record.position[2]],record.size):addObject(record.type,null,record.hanging,record.cableLength??5,null,0,record.gridSize,record);
   if(!o)throw Error('Could not restore an object.');if(o.type==='pool'){o.properties={...properties(),...record.properties};applyMaterialProperties(o);}byId.set(record.id,o);
  }
  for(const record of space.objects){const o=byId.get(record.id);o.support=byId.get(record.support)??null;remapActions(o.properties,new Map([...byId].map(([id,o])=>[id,o.id])));}
 }finally{hydrating=false;}
 refreshJoins();for(const o of state.objects){pendulums.syncPose(o);if(presentationOnly&&o.hanging)o.body.setBodyType(RAPIER.RigidBodyType.Fixed,true);}
 for(const id of environmentIds)if(space.environment?.[id]!==undefined){if($(id).type==='checkbox')$(id).checked=!!space.environment[id];else $(id).value=space.environment[id];$(id).dispatchEvent(new Event($(id).type==='checkbox'?'change':'input'));}
 camera.position.fromArray(space.camera.position);controls.target.fromArray(space.camera.target);camera.zoom=space.camera.zoom;camera.lookAt(controls.target);camera.updateProjectionMatrix();controls.enabled=!presentationOnly;terrain.reset();ecology.reset();select(null);renderer.shadowMap.needsUpdate=true;
}
let copiedObjects=null;
function editableTarget(target){return target?.closest?.('input,textarea,select,[contenteditable="true"]');}
document.addEventListener('copy',event=>{if(presentationOnly||editableTarget(event.target)||!state.selected)return;copiedObjects=(state.selected.type==='pool'?[state.selected]:stacks.members(state.selected)).map(objectRecord);event.clipboardData?.setData('text/plain','ETERNITY_OBJECTS_V1\n'+JSON.stringify(copiedObjects));event.preventDefault();notify('Object copied');});
document.addEventListener('paste',event=>{if(presentationOnly||editableTarget(event.target))return;const text=event.clipboardData?.getData('text/plain');let records=text?null:copiedObjects;if(text?.startsWith('ETERNITY_OBJECTS_V1\n')){try{records=JSON.parse(text.slice('ETERNITY_OBJECTS_V1\n'.length));}catch{return;}}if(!records)return;event.preventDefault();try{pasteObjects(records);}catch(e){notify(e.message);}});
function pasteObjects(records){
 if(state.objects.length+state.holes.length+records.length>40)throw Error('The scene is full.');
 const ids=new Set(records.map(r=>r.id)),clean=structuredClone(records);for(const r of clean)if(!ids.has(r.support)){r.support=null;r.seated=false;r.signSlot=null;}
 validateSpace({...captureSpace(),objects:clean},new Set([...Object.keys(LABELS),'pool']));
 if(clean[0].type==='pool'){const r=clean[0],o=addHole(null,r.size);if(o){o.properties={...properties(),...structuredClone(r.properties)};applyMaterialProperties(o);select(o);notify('Pool pasted');}return;}
 const copies=[],map=new Map();hydrating=true;
 try{for(const r of clean){const o=addObject(r.type,null,r.hanging,r.cableLength??5,null,0,r.gridSize,r);if(!o)throw Error('No room for a copy.');copies.push(o);map.set(r.id,o);}for(const r of clean){const o=map.get(r.id);o.support=map.get(r.support)??null;remapActions(o.properties,new Map([...map].map(([id,o])=>[id,o.id])),{keepExternal:true});}}finally{hydrating=false;}
 const root=copies[0];if(!root.support&&!root.hanging){const shift=physics.supportY(root,root.mesh.position.x,root.mesh.position.z)-root.mesh.position.y;stacks.translate(copies,new THREE.Vector3(0,shift,0));}
 const original=copies.map(o=>o.mesh.position.clone()),ignore=new Set(copies);let found=false;
 search:for(let radius=1;radius<=12;radius++)for(const [x,z]of [[radius,0],[0,radius],[-radius,0],[0,-radius],[radius,radius],[-radius,-radius]]){
  const delta=new THREE.Vector3(x*GRID,0,z*GRID);if(!root.hanging)delta.y=physics.supportY(root,original[0].x+delta.x,original[0].z+delta.z)-original[0].y;
  if(copies.every((o,i)=>physics.canPlace(o,original[i].clone().add(delta),o.mesh.quaternion,ignore))){copies.forEach((o,i)=>{o.mesh.position.copy(original[i]).add(delta);if(o.anchor)o.anchor.add(delta);pendulums.syncPose(o);});found=true;break search;}
 }
 if(!found){for(const o of copies)remove(o,true);throw Error('No clear space for this copy.');}refreshJoins();select(root);notify('Object pasted');
}
function initializeSpaces(){
 if(!presentationOnly)installSpaces({capture:captureSpace,load:loadSpace,notify});
 try{if(location.hash.startsWith('#space='))loadSpace(JSON.parse(decodeURIComponent(location.hash.slice(7))));else if(presentationOnly){for(const o of state.objects)if(o.hanging)o.body.setBodyType(RAPIER.RigidBodyType.Fixed,true);controls.enabled=false;}}catch(e){notify(e.message);}
}

window.addEventListener('resize',resize);resize();reset();
initializeSpaces();
let previous=performance.now();
let shadowClock=0;
function tick(now){
 requestAnimationFrame(tick);const dt=Math.min((now-previous)/1000,.05);previous=now;if(document.hidden)return;
 if(boardView.active)controls.enabled=false;else if(signFocus.active)signFocus.step(dt);else if(presentationOnly)controls.enabled=false;else controls.update();exitView.hidden=!signFocus.active||boardView.active;followSun();
 poleEye.step(dt,camera,canvas,state.objects,presentationOnly||signFocus.active);for(const o of state.objects)stepSign(o,dt,o===hoveredSign,reducedMotion.matches);
 for(const o of pendulums.step(dt))updateCable(o);
 ecology.update(dt,camera,canvas.clientWidth,canvas.clientHeight);windTrails.update(dt,wind,controls.target);$('seed-count').textContent=`${ecology.food.remaining} seed${ecology.food.remaining===1?'':'s'} · ${ecology.food.eaten} eaten`;
 for(const o of state.objects)if(o.hanging)o.cable.handle.quaternion.copy(camera.quaternion);
 if(!state.paused)terrain.step(dt,wind);
 // Meadow shadows update at 30 Hz; water shading and physical motion remain smooth.
 shadowClock+=dt;if(shadowClock>=1/30){renderer.shadowMap.needsUpdate=true;shadowClock=0;}
 presentation.step(dt);
 const dragged=state.drag?.object?new Set(stacks.members(state.drag.object)):new Set();
 messageHops.step(dt,state.objects,{disabled:presentationOnly||state.paused||reducedMotion.matches||signFocus.active,busy:o=>dragged.has(o)||presentation.motion.has(o),clear:(members,height)=>hopClearance(stacks,members,height)});
 for(const event of messageHops.events){ecology.objectHop(event);if(event.kind==='takeoff')hopPuffs.emit(event.members,p=>ecology.waterAt(p));}
 hopPuffs.step(state.paused?0:dt,camera);
 room.step();stepChatBubbles(now);updateTags(now);
 // Culling runs after all motion, keeps what attention is on, and settles only
 // when the scene does — the throttle in ViewCull handles the rest. Physics is
 // never consulted for visibility and visibility never feeds back into it.
 const keep=new Set(state.debug?state.objects.map(o=>o.id):[]);
 if(state.selected)keep.add(state.selected.id);
 for(const o of dragged)keep.add(o.id);
 for(const o of presentation.motion.keys())keep.add(o.id);
 for(const o of messageHops.offsets.keys())keep.add(o.id);
 if(messages.player?.object)keep.add(messages.player.object.id);
 if(hoveredSign)keep.add(hoveredSign.id);
 if(signFocus.pole)keep.add(signFocus.pole.id);
 viewCull.tick(state.objects.map(o=>({id:o.id,mesh:o.mesh})),camera,{width:canvas.clientWidth,height:canvas.clientHeight},keep);
 presentation.withPresentation(()=>messageHops.withPresentation(()=>{
  for(const o of new Set([...presentation.motion.keys(),...messageHops.offsets.keys()]))if(o.hanging)updateCable(o);
  if(state.selected)selectionBox.setFromObject(state.selected.mesh);messages.step(dt,camera,canvas,[...state.objects,...state.holes]);
  dither.uniforms.hangingBlur.value=+hangingFocus.render(renderer,camera,state.objects);
  refraction.render(renderer,scene,camera,[...terrain.views.map(v=>v.mesh),...[...ecology.bathViews.values()].map(v=>v.mesh)]);
  composer.render();
 }));
 for(const o of new Set([...presentation.motion.keys(),...messageHops.offsets.keys()]))if(o.hanging)updateCable(o);
}
requestAnimationFrame(tick);$('loading').hidden=true;state.ready=true;
// Read-only diagnostics and actions are shared with the UI for integration and verification.
const api={snapshot:captureSpace,read:()=>({ready:state.ready,presentationOnly,objects:[...state.objects,...state.holes].map(o=>({id:o.id,type:o.type,properties:o.properties,messageSeen:!!o.messageSeen,gridSize:o.gridSize??null,letter:o.letter,board:o.board,sign:o.sign,signSlot:o.signSlot,seated:o.seated,grandmaVariant:o.grandmaVariant,schedule:ecology.grandmaSchedule?.states.get(o)?.state??null,busy:!!ecology.grandmas.busy&&ecology.grandmas.busy(o),position:o.mesh.position.toArray(),hanging:o.hanging,cableLength:o.cableLength,anchor:o.anchor?.toArray()??null,velocity:o.body?.linvel()??{x:0,y:0,z:0},rotation:o.mesh.quaternion.toArray(),parts:o.parts.length,foot:o.stacking?.foot??0,head:o.stacking?.head??0,supportedBy:o.support?.id??null,...(o.type==='pool'?{size:o.size}:{})})),paused:state.paused,mouseMode:state.mouseMode,camera:{focusedPole:signFocus.pole?.id??null,locked:presentationOnly||signFocus.active||boardView.active,boardOpen:boardView.active,position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom},rendering:{sunDirection:sunAngle,lightStrength:sun.intensity/3.8,ditherScale:dither.uniforms.scale.value,inkColor:$('ink-color').value,paperColor:$('paper-color').value,twoTone:!!dither.uniforms.ink.value&&dither.uniforms.scale.value>0,culledForms:viewCull.hidden.size},wind:{strength:wind.strength,direction:wind.direction,turbulence:wind.turbulence,trails:windTrails.read()},nature:{...ecology.read(),seedPods:ecology.read().seedPods.map(seed=>{const p=new THREE.Vector3(...seed.position).project(camera);return {...seed,screen:{x:(p.x+1)*canvas.clientWidth/2,y:(1-p.y)*canvas.clientHeight/2}};})},players:{status:room.status,name:playerName,role:playerRole,self:selfEntity?{name:playerName,position:selfEntity.group.position.toArray()}:null,remote:[...entities.entries()].filter(([id])=>id!==room.identity.id).map(([id,entry])=>({id,name:entry.entity.name,position:entry.entity.group.position.toArray()})),chat:{bubbles:[...chatBubbles.bubbles.keys()],entries:chatLog.items.length}},...terrain.read(),renderCalls:renderer.info.render.calls}),add:type=>{if(presentationOnly)throw Error('Presentation is read-only');if(type!=='pool'&&!Object.hasOwn(LABELS,type))throw Error('Unknown shape');const o=addObject(type);if(o)select(o);return o?.id??null;},move:(id,x,z)=>{if(![x,z].every(Number.isFinite))throw Error('Coordinates must be finite');const o=[...state.objects,...state.holes].find(o=>o.id===id);if(!o)throw Error('Unknown object');return placeForm(o,x,z);},project:id=>{const o=[...state.objects,...state.holes].find(o=>o.id===id);const p=(o?o.mesh.position.clone():new THREE.Vector3(POOL.x,-.19,POOL.z)).project(camera);return{x:(p.x+1)/2*canvas.clientWidth,y:(1-p.y)/2*canvas.clientHeight};},reset};
window.whitewater=api;
if(document.modelContext?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});for(const tool of [{name:'export_space',description:'Export the current space including objects, messages, environment and camera.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>captureSpace()},{name:'read_scene',description:'Read the shapes and their positions in the scene.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>api.read()},{name:'add_form',description:'Add a white geometric form to an available floor position.',inputSchema:{type:'object',properties:{shape:{type:'string',enum:[...Object.keys(LABELS),'pool']}},required:['shape'],additionalProperties:false},execute:input=>({id:api.add(input.shape)})},{name:'move_form',description:"Reposition a floor form or a hanging form’s ceiling anchor to a grid position if the path is clear.",inputSchema:{type:'object',properties:{id:{type:'number'},x:{type:'number'},z:{type:'number'}},required:['id','x','z'],additionalProperties:false},execute:input=>({moved:api.move(input.id,input.x,input.z)})}]){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(console.warn);}catch(error){console.warn(error);}}}
