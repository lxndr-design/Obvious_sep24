import './catalog.css';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {makeSizedForm} from './object-size.js';
import {CATALOG_TYPES,CATALOG_ROWS,catalogLayout,catalogName} from './catalog-layout.js';
import {decorateBoard} from './boards.js';
import {decorateSign} from './signs.js';
import {applyHedgeSurface} from './hedge-surface.js';
import {HoleLayout} from './terrain.js';
import {HoleTerrain} from './hole-terrain.js';
import {BathWater} from './birdbath.js';
import {WaterRefraction} from './water-refraction.js';
import {DitherShader} from './dither.js';
import {installTrackpadPan} from './camera-pan.js';

document.title='Eternity · Object catalog';
document.body.innerHTML=`<header><a class="brand" href="?edit">Eternity</a><h1>Object catalog<small>Small 1×1 · Medium 2×2 · Large 3×3</small></h1><nav aria-label="Catalog controls"><label class="sr-only" for="catalog-object">Focus an object</label><select id="catalog-object"><option value="">All objects</option></select><button id="catalog-fit">Fit all</button><button id="catalog-out" aria-label="Zoom out">−</button><button id="catalog-in" aria-label="Zoom in">+</button></nav></header><main id="catalog-stage"><canvas tabindex="0" aria-label="Object catalog. Drag or two-finger scroll to pan. Pinch to zoom. Choose an object to inspect its three sizes."></canvas><div id="catalog-labels"></div><div id="catalog-loading">Preparing objects…</div></main><footer><span>${CATALOG_TYPES.length} designs · ${CATALOG_TYPES.length*3} objects · 1 tile between size footprints</span><span>Drag / two-finger pan · Pinch to zoom</span></footer>`;
const select=document.querySelector('select');
for(const type of CATALOG_TYPES)select.add(new Option(catalogName(type),type));
await R.init();
const stage=document.querySelector('main'),canvas=document.querySelector('canvas');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
const scene=new THREE.Scene();scene.background=new THREE.Color('white');
const camera=new THREE.OrthographicCamera(-30,30,25,-25,.1,500);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.enableRotate=false;controls.screenSpacePanning=true;controls.minZoom=.35;controls.maxZoom=12;controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.PAN};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};
installTrackpadPan(canvas,camera,controls);
scene.add(new THREE.HemisphereLight(0xffffff,0x969696,1));
const light=new THREE.DirectionalLight(0xffffff,3.04);light.position.set(24,45,42);light.target.position.set(17.5,0,15);light.castShadow=true;light.shadow.mapSize.set(4096,4096);Object.assign(light.shadow.camera,{left:-36,right:36,top:36,bottom:-36,near:1,far:110});light.shadow.bias=-.00015;light.shadow.normalBias=.025;scene.add(light,light.target);
const white=new THREE.MeshStandardMaterial({color:'white',roughness:.88});
const cells=catalogLayout(),labels=[],objects=[],baths=[];
const terrain=new HoleTerrain(scene,white);
terrain.rebuild(new HoleLayout(cells.filter(c=>c.type==='pool').map((c,id)=>({id,x:c.x,z:c.z,size:c.size}))));
const labelLayer=document.getElementById('catalog-labels');
function label(text,x,y,z,kind=''){
 const el=document.createElement('span');el.className=`catalog-label ${kind}`;el.textContent=text;labelLayer.append(el);labels.push({el,point:new THREE.Vector3(x,y,z),kind});
}
const outlines=[],grid=[],boardWidth=Math.max(...cells.map(c=>c.x0+c.size))+1,boardDepth=Math.max(...cells.map(c=>c.z0+c.size))+1;
function segment(array,x,z,x2,z2,y=.014){array.push(x,y,z,x2,y,z2);}
for(let x=-1;x<=boardWidth;x++)segment(grid,x,-1,x,boardDepth);
for(let z=-1;z<=boardDepth;z++)segment(grid,-1,z,boardWidth,z);
for(const cell of cells){
 const {type,size,x,z,x0,z0,index}=cell;
 for(const [a,b,c,d]of [[x0,z0,x0+size,z0],[x0+size,z0,x0+size,z0+size],[x0+size,z0+size,x0,z0+size],[x0,z0+size,x0,z0]])segment(outlines,a,b,c,d,.02);
 if(size===2)label(catalogName(type),Math.floor(index/CATALOG_ROWS)*9+4,0,z0-.52);
 label(`${['','Small','Medium','Large'][size]} · ${size}×${size}`,x,0,z0+size+.28,'size');
 if(type==='pool')continue;
 const form=makeSizedForm(type,R,size),material=white.clone();if(type==='hedge')applyHedgeSurface(material);
 const mesh=new THREE.Mesh(form.geometry,material),b=form.geometry.boundingBox;
 mesh.position.set(x-(b.min.x+b.max.x)/2,-b.min.y,z-(b.min.z+b.max.z)/2);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
 const object={...form,type,id:objects.length+1,mesh};objects.push(object);decorateSign(object);decorateBoard(object);
 if(type==='birdbath'||type==='fountain')baths.push(new BathWater(object));
}
function lines(vertices,color,opacity){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const mesh=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));scene.add(mesh);}
lines(grid,0xb0b7aa,1);lines(outlines,0x627454,1);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const dither=new ShaderPass(DitherShader);composer.addPass(dither);
const refraction=new WaterRefraction(),waterMeshes=[...terrain.views.map(v=>v.mesh),...baths.map(b=>b.mesh)];
let width=1,height=1;
function aim(target,zoom){controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(25,45,55));camera.zoom=zoom;camera.updateProjectionMatrix();controls.update();}
function fit(){select.value='';aim(new THREE.Vector3((boardWidth-1)/2,0,(boardDepth-1)/2),1);camera.updateMatrixWorld();let mx=0,my=0;for(const x of [-2,boardWidth+1])for(const y of [0,3.5])for(const z of [-2,boardDepth+1]){const p=new THREE.Vector3(x,y,z).project(camera);mx=Math.max(mx,Math.abs(p.x));my=Math.max(my,Math.abs(p.y));}camera.zoom=.89/Math.max(mx,my);camera.updateProjectionMatrix();}
function resize(){width=stage.clientWidth;height=stage.clientHeight;camera.left=-25*width/height;camera.right=25*width/height;camera.top=25;camera.bottom=-25;camera.updateProjectionMatrix();renderer.setSize(width,height);composer.setSize(width,height);dither.uniforms.resolution.value.set(width,height);renderer.getDrawingBufferSize(dither.uniforms.bufferResolution.value);refraction.resize(dither.uniforms.bufferResolution.value.x,dither.uniforms.bufferResolution.value.y);}
new ResizeObserver(()=>{resize();if(!select.value)fit();}).observe(stage);resize();fit();
select.onchange=()=>{if(!select.value){fit();return;}const c=cells.find(c=>c.type===select.value);aim(new THREE.Vector3(Math.floor(c.index/CATALOG_ROWS)*9+4,.65,c.z0+1.5),Math.min(7,50*(width/height)/11));};
document.getElementById('catalog-fit').onclick=fit;
for(const [id,factor]of [['catalog-in',1.35],['catalog-out',1/1.35]])document.getElementById(id).onclick=()=>{camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.35,12);camera.updateProjectionMatrix();};
canvas.onkeydown=e=>{if(['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')fit();else document.getElementById(e.key==='-'?'catalog-out':'catalog-in').click();}};
document.getElementById('catalog-loading').remove();
const projected=new THREE.Vector3(),wind=new THREE.Vector3(.025,0,.01);let previous=performance.now();
renderer.setAnimationLoop(now=>{
 const dt=Math.min((now-previous)/1000,.035);previous=now;controls.update();
 for(const bath of baths)bath.update(dt,wind);
 camera.updateMatrixWorld();
 for(const l of labels){projected.copy(l.point).project(camera);l.el.hidden=Math.abs(projected.x)>1.15||Math.abs(projected.y)>1.1||projected.z>1||(l.kind==='size'&&camera.zoom<1.65);if(!l.el.hidden)l.el.style.transform=`translate(${(projected.x*.5+.5)*width}px,${(-projected.y*.5+.5)*height}px) translate(-50%,-50%)`;}
 refraction.render(renderer,scene,camera,waterMeshes);composer.render();
});
