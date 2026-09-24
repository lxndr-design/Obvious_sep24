import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {projectBoundsToView,anyOnScreen,computeVisibility,ViewCull} from '../src/view-cull.js';
import {makeForm} from '../src/shapes.js';
import {makeFurnishing} from '../src/furnishings.js';
import {makeBirdbath} from '../src/bath-shapes.js';
import {WaterRefraction} from '../src/water-refraction.js';
import {HangingFocus} from '../src/hanging-focus.js';
await R.init();

// Tight orthographic rig: camera at (0,0,10) looking down -z, near .1 far 10.
// One world unit is .0909 NDC of screen X, so pixel-margin boundary cases land
// on clean, exactly-checkable offsets. Depth margins are world units.
function rig(){
 const camera=new THREE.OrthographicCamera(-11,11,8,-8,.1,10);
 camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.zoom=1;camera.updateProjectionMatrix();
 return camera;
}
const box=(id,size,x,y,z)=>({id,bounds:new THREE.Box3(new THREE.Vector3(x-size/2,y-size/2,z-size/2),new THREE.Vector3(x+size/2,y+size/2,z+size/2))});
const margin={depth:.15,screenPx:4};
function meshAt(geometry,x,y,z){const mesh=new THREE.Mesh(geometry);mesh.position.set(x,y,z);return mesh;}
const view=(width,height)=>({width,height});
const flat=g=>g.index?g.toNonIndexed():g.clone();
const triangleCount=g=>flat(g).attributes.position.count/3;
function duplicateTriangles(g){
 const a=flat(g).attributes.position.array,n=a.length/9,seen=new Map();let dups=0;
 for(let i=0;i<n;i+=9){
  const key=[[a[i],a[i+1],a[i+2]],[a[i+3],a[i+4],a[i+5]],[a[i+6],a[i+7],a[i+8]]].map(v=>v.map(c=>+c.toFixed(4)).join(',')).sort().join('|');
  if(seen.has(key))dups++;else seen.set(key,1);
 }
 return dups;
}
// Wall-band normal audit: within a y-band only the drawn bowl wall occupies,
// every outer triangle (centroid radius > .65) must point away from the axis
// and every inner one (.5 < r < .65) toward it.
function wallBand(geometry,yMin,yMax){
 const p=geometry.attributes.position.array,n=geometry.attributes.normal.array;let outer=0,inner=0,misdirected=0;
 for(let i=0;i<p.length;i+=9){
  const cy=(p[i+1]+p[i+4]+p[i+7])/3;if(!(cy>yMin&&cy<yMax))continue;
  const cx=(p[i]+p[i+3]+p[i+6])/3,cz=(p[i+2]+p[i+5]+p[i+8])/3,r=Math.hypot(cx,cz);
  const nx=(n[i]+n[i+3]+n[i+6])/3,nz=(n[i+2]+n[i+5]+n[i+8])/3,d=nx*cx+nz*cz;
  if(r>0.65){outer++;if(d<=0)misdirected++;}
  else if(r>0.5){inner++;if(d>=0)misdirected++;}
 }
 return {outer,inner,misdirected};
}

test('projection places scene bounds in frame and orders depth with distance',()=>{
 const camera=rig();
 const frame=projectBoundsToView(box(1,2,0,0,5).bounds,camera);
 assert.ok(frame.minX>-1&&frame.maxX<1&&frame.minY>-1&&frame.maxY<1&&frame.minDepth>-1&&frame.maxDepth<1);
 const nearer=projectBoundsToView(box(2,1,0,0,6).bounds,camera),farther=projectBoundsToView(box(3,1,0,0,4).bounds,camera);
 assert.ok(nearer.minDepth<farther.minDepth);
});

test('anyOnScreen requires depth reach, not just an in-frame rectangle',()=>{
 const camera=rig();
 assert.equal(anyOnScreen([meshAt(new THREE.BoxGeometry(2,2,2),0,0,5)],camera),true);
 assert.equal(anyOnScreen([meshAt(new THREE.BoxGeometry(2,2,2),13,0,5)],camera),false);
 assert.equal(anyOnScreen([meshAt(new THREE.BoxGeometry(2,2,2),0,0,12)],camera),false); // fully behind the near plane
 assert.equal(anyOnScreen([meshAt(new THREE.BoxGeometry(2,2,2),0,0,10.5)],camera),true); // straddling it still renders
});

test('a fully occluded candidate hides; a partially visible one shows',()=>{
 const camera=rig(),occluder=box(1,3,0,0,5),hidden=box(2,1,0,0,2);
 assert.equal(computeVisibility([hidden],camera,[occluder],margin).get(2),false);
 const poking=box(3,1,1.2,0,2);
 assert.equal(computeVisibility([poking],camera,[occluder],margin).get(3),true);
});

test('a depth straddle renders even under full rectangle containment',()=>{
 const camera=rig(),occluder=box(1,3,0,0,5),straddling=box(2,1,0,0,6.2); // near face pokes in front of the occluder's front face
 assert.equal(computeVisibility([straddling],camera,[occluder],margin).get(2),true);
});

test('the depth margin blocks marginal hides',()=>{
 const camera=rig(),occluder=box(1,3,0,0,5),justBehind=box(2,1,0,0,5.9); // nearest point .1 world behind the occluder's front face
 assert.equal(computeVisibility([justBehind],camera,[occluder],{depth:.15,screenPx:4}).get(2),true);
 assert.equal(computeVisibility([justBehind],camera,[occluder],{depth:.2,screenPx:4}).get(2),true);
 assert.equal(computeVisibility([justBehind],camera,[occluder],{depth:.001,screenPx:4}).get(2),false);
 const wellBehind=box(3,1,0,0,5.5); // .5 world behind the front face — outside the default margin
 assert.equal(computeVisibility([wellBehind],camera,[occluder],margin).get(3),false);
});

test('the pixel margin blocks marginal hides at the occluder edge',()=>{
 const camera=rig(),occluder=box(1,3,0,0,5),nudged=box(2,1,.94,0,2); // right edge inside the occluder's, but within the 4 px clearance
 assert.equal(computeVisibility([nudged],camera,[occluder],{depth:.05,screenPx:4},view(800,600)).get(2),true);
 assert.equal(computeVisibility([nudged],camera,[occluder],{depth:.05,screenPx:0},view(800,600)).get(2),false);
});

test('off-frame and behind-camera bounds are not viewable',()=>{
 const camera=rig(),occluder=box(1,3,0,0,5);
 assert.equal(computeVisibility([box(2,1,13,0,2)],camera,[occluder],margin).get(2),false);
 assert.equal(computeVisibility([box(3,1,0,0,10.5)],camera,[occluder],margin).get(3),false);
});

test('an occluder behind the camera never hides anything',()=>{
 const camera=rig();
 assert.equal(computeVisibility([box(2,1,0,0,2)],camera,[box(1,3,0,0,11.5)],margin).get(2),true);
});

test('an object never occludes itself',()=>{
 const camera=rig(),solo=box(1,3,0,0,5);
 assert.equal(computeVisibility([solo],camera,[solo],margin).get(1),true);
});

test('ViewCull hides occluded meshes and honors the keep set',()=>{
 let t=0;const camera=rig(),viewport=view(800,600),viewCull=new ViewCull({now:()=>t});
 const occluder=meshAt(new THREE.BoxGeometry(3,3,3),0,0,5),candidate=meshAt(new THREE.BoxGeometry(1,1,1),0,0,2),kept=meshAt(new THREE.BoxGeometry(1,1,1),0,0,2);
 const entries=[{id:1,mesh:occluder},{id:2,mesh:candidate},{id:3,mesh:kept}];
 viewCull.tick(entries,camera,viewport);
 assert.equal(candidate.visible,false);
 assert.equal(kept.visible,false);
 assert.equal(viewCull.hiddenCount,2);
 t+=1; // the keep set arrives with no motion: the kept mesh is revealed, the rest recomputed
 viewCull.tick(entries,camera,viewport,new Set([3]));
 assert.equal(kept.visible,true);
 assert.equal(candidate.visible,false);
 assert.equal(viewCull.hiddenCount,1);
});

test('selecting a hidden mesh reveals it before the next compute',()=>{
 let t=0;const camera=rig(),viewport=view(800,600),viewCull=new ViewCull({now:()=>t});
 const occluder=meshAt(new THREE.BoxGeometry(3,3,3),0,0,5),candidate=meshAt(new THREE.BoxGeometry(1,1,1),0,0,2);
 const entries=[{id:1,mesh:occluder},{id:2,mesh:candidate}];
 viewCull.tick(entries,camera,viewport);
 assert.equal(candidate.visible,false);
 t+=1; // interval elapsed; the keep set arrives with no motion at all
 viewCull.tick(entries,camera,viewport,new Set([2]));
 assert.equal(candidate.visible,true);
});

test('motion reveals immediately; recompute waits for the interval',()=>{
 let t=0;const camera=rig(),viewport=view(800,600),viewCull=new ViewCull({now:()=>t});
 const occluder=meshAt(new THREE.BoxGeometry(3,3,3),0,0,5),candidate=meshAt(new THREE.BoxGeometry(1,1,1),0,0,2);
 const entries=[{id:1,mesh:occluder},{id:2,mesh:candidate}];
 viewCull.tick(entries,camera,viewport);
 assert.equal(candidate.visible,false);
 camera.position.x+=1;t+=.05;
 viewCull.tick(entries,camera,viewport);
 assert.equal(candidate.visible,true);
 t+=.05;
 viewCull.tick(entries,camera,viewport);
 assert.equal(candidate.visible,false);
});

test('moving the occluder unhides within one cull cycle',()=>{
 let t=0;const camera=rig(),viewport=view(800,600),viewCull=new ViewCull({now:()=>t});
 const occluder=meshAt(new THREE.BoxGeometry(3,3,3),0,0,5),candidate=meshAt(new THREE.BoxGeometry(1,1,1),0,0,2);
 const entries=[{id:1,mesh:occluder},{id:2,mesh:candidate}];
 viewCull.tick(entries,camera,viewport);
 assert.equal(candidate.visible,false);
 occluder.position.set(0,0,-100);t+=1;
 viewCull.tick(entries,camera,viewport);
 assert.equal(candidate.visible,true);
});

test('disabling the cull reveals everything and stops hiding',()=>{
 let t=0;const camera=rig(),viewport=view(800,600),viewCull=new ViewCull({now:()=>t});
 const occluder=meshAt(new THREE.BoxGeometry(3,3,3),0,0,5),candidate=meshAt(new THREE.BoxGeometry(1,1,1),0,0,2);
 const entries=[{id:1,mesh:occluder},{id:2,mesh:candidate}];
 viewCull.tick(entries,camera,viewport);
 assert.equal(candidate.visible,false);
 viewCull.enabled=false;
 viewCull.tick(entries,camera,viewport);
 assert.equal(candidate.visible,true);
});

test('closed primitives pin their triangle counts with no interior duplicates',()=>{
 // box: 12; sphere(48,32): 48·31·2 side rows + 2·48 pole fans; column: 64·2
 // walls + 2·64 caps; arch: extruded 52-point profile plus its side walls.
 const expected={box:12,sphere:2976,cylinder:256,arch:212};
 for(const [type,count] of Object.entries(expected)){
  const form=makeForm(type,R);
  assert.equal(triangleCount(form.geometry),count,type);
  assert.equal(duplicateTriangles(form.geometry),0,type);
 }
});

test('the fountain bowl wall is seam-free with colliders unchanged',()=>{
 const fountain=makeFurnishing('fountain',R);
 assert.equal(triangleCount(fountain.geometry),912); // 528 cylinders + 384 wall strips
 assert.equal(duplicateTriangles(fountain.geometry),0);
 assert.equal(fountain.parts.length,52); // 4 analytic cylinders + 48 wedge colliders
 const band=wallBand(fountain.geometry,.55,.70);
 assert.deepEqual(band,{outer:96,inner:96,misdirected:0});
});

test('the birdbath bowl wall is seam-free for joined and open tiles',()=>{
 const joined=makeBirdbath(R);
 assert.equal(triangleCount(joined.geometry),748); // 384 wall strips + 188 ring + 96 + 80 cylinders
 assert.equal(duplicateTriangles(joined.geometry),0);
 assert.equal(joined.parts.length,52);
 assert.deepEqual(wallBand(joined.geometry,.44,.57),{outer:96,inner:96,misdirected:0});
 const open=makeBirdbath(R,15); // every join open: no wedges, no wall strips
 assert.equal(triangleCount(open.geometry),192);
 assert.equal(duplicateTriangles(open.geometry),0);
 assert.equal(open.parts.length,4);
});

test('WaterRefraction skips the full-scene capture when no water is on screen',()=>{
 const camera=rig();
 let calls=0;
 const renderer={getRenderTarget:()=>null,setRenderTarget(){},clear(){},render(){calls++;},getDrawingBufferSize:v=>(v.set(800,600),v)};
 const refraction=new WaterRefraction();
 const water=meshAt(new THREE.PlaneGeometry(2,2),0,0,4);
 assert.equal(refraction.render(renderer,new THREE.Scene(),camera,[water]),true);
 assert.equal(refraction.captures,1);
 assert.equal(calls,1);
 water.position.set(0,0,10.5); // behind the camera plane
 assert.equal(refraction.render(renderer,new THREE.Scene(),camera,[water]),false);
 assert.equal(refraction.skips,1);
 assert.equal(calls,1);
});

test('HangingFocus skips the mask render without a viewable hanging subject',()=>{
 const camera=rig();
 let calls=0;
 const renderer={getRenderTarget:()=>null,setRenderTarget(){},clear(){},render(){calls++;}};
 const focus=new HangingFocus(),geometry=new THREE.BoxGeometry(1,1,1);
 const mk=(hanging,z)=>{const mesh=meshAt(geometry,0,0,z);return {hanging,geometry,mesh};};
 assert.equal(focus.render(renderer,camera,[mk(false,4)]),false);
 assert.equal(focus.skips,1);
 assert.equal(focus.render(renderer,camera,[mk(false,4),mk(true,10.5)]),false);
 assert.equal(focus.skips,2);
 assert.equal(calls,0);
 assert.equal(focus.render(renderer,camera,[mk(false,4),mk(true,4)]),true);
 assert.equal(focus.captures,1);
 assert.equal(calls,1);
});
