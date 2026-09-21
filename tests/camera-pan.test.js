import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {panCamera,installTrackpadPan} from '../src/camera-pan.js';
import {DEFAULT_PARK} from '../src/default-scene.js';
import {HoleLayout} from '../src/terrain.js';
import {CollisionScene} from '../src/collision.js';
import {StackScene} from '../src/stacking.js';
import {makeForm} from '../src/shapes.js';
const camera=()=>{const c=new THREE.OrthographicCamera(-10,10,6,-6,.1,100);c.position.set(10,12,10);c.lookAt(0,0,0);c.zoom=1.7;c.updateProjectionMatrix();c.updateMatrixWorld();return c;};
test('two-axis scrolling pans exactly in screen pixels without changing zoom or viewing direction',()=>{
 const c=camera(),controls={target:new THREE.Vector3()},before=c.position.clone(),offset=c.position.clone().sub(controls.target),q=c.quaternion.clone();const landmark=new THREE.Vector3().project(c);
 panCamera(c,controls,75,-36,1000,600);c.updateMatrixWorld();const moved=new THREE.Vector3().project(c);
 assert.ok(Math.abs((moved.x-landmark.x)*500+75)<1e-7);assert.ok(Math.abs((moved.y-landmark.y)*-300-36)<1e-7);
 assert.ok(c.position.clone().sub(controls.target).distanceTo(offset)<1e-7);assert.ok(c.quaternion.angleTo(q)<1e-7);assert.equal(c.zoom,1.7);assert.ok(c.position.distanceTo(before)>0);
});
test('pinch reaches OrbitControls, while focused or dragging scenes consume all camera gestures',()=>{
 let handler;const canvas={clientWidth:1000,clientHeight:600,addEventListener:(name,fn)=>handler=fn,removeEventListener:()=>handler=null},c=camera(),controls={target:new THREE.Vector3(),enabled:true};let blocked=false;
 const cleanup=installTrackpadPan(canvas,c,controls,()=>blocked),event=(extra={})=>({deltaX:20,deltaY:40,deltaMode:0,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
 const pinch=event({ctrlKey:true});handler(pinch);assert.equal(pinch.stopped,undefined);
 const scroll=event();handler(scroll);assert.equal(scroll.stopped,true);const saved=c.position.clone();
 blocked=true;const locked=event({ctrlKey:true});handler(locked);assert.equal(locked.prevented,true);assert.ok(c.position.equals(saved));
 blocked=false;controls.enabled=false;handler(event());assert.ok(c.position.equals(saved));cleanup();assert.equal(handler,null);
});
test('default park forms one connected pool around a dry island with valid fountain and seated Grandma',async()=>{
 await R.init();const layout=new HoleLayout(DEFAULT_PARK.pools.map(([x,z],id)=>({id,x,z,size:2})));assert.equal(layout.components.length,1);assert.equal(layout.contains(...DEFAULT_PARK.fountain),false);assert.equal(layout.contains(1,-1),true);assert.equal(layout.contains(3,1),true);
 const c=new CollisionScene(R);c.setTerrain(layout);const stacks=new StackScene(c);
 const add=(type,position,rotation=0)=>{const f=makeForm(type,R),o={...f,type,mesh:new THREE.Mesh(f.geometry)};o.mesh.rotation.y=rotation;o.mesh.position.set(position[0],0,position[1]);o.mesh.position.y=c.supportY(o,...position);assert.ok(c.canPlace(o,o.mesh.position),type);c.objects.push(o);return o;};
 const fountain=add('fountain',DEFAULT_PARK.fountain);assert.ok(Math.abs(fountain.mesh.position.y+fountain.geometry.boundingBox.min.y)<1e-6);
 const benches=DEFAULT_PARK.benches.map(b=>add('bench',b.position,b.rotation));const grandma=add('grandma-skirt-bun',[-6,0]);assert.ok(stacks.placeGrandma(grandma,new THREE.Vector3(DEFAULT_PARK.grandma[0],0,DEFAULT_PARK.grandma[1])));assert.equal(grandma.support,benches[0]);assert.equal(grandma.seated,true);assert.ok(c.canPlace(grandma,grandma.mesh.position));
});
