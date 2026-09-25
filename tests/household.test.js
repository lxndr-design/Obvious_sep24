import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm,LABELS} from '../src/shapes.js';
import {makeSizedForm} from '../src/object-size.js';
import {HOUSEHOLD_LABELS,householdComponents} from '../src/household.js';
import {CollisionScene} from '../src/collision.js';
import {StackScene} from '../src/stacking.js';
import {PendulumScene} from '../src/pendulums.js';
import {shapeBounds} from '../src/collision-bounds.js';
import {objectRecord,validateSpace} from '../src/spaces.js';
import {properties,canManipulate} from '../src/object-properties.js';
await R.init();
function form(type,size=null){const f=size?makeSizedForm(type,R,size):makeForm(type,R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(-5,f.height/2,3);return {...f,mesh,type,hanging:false,cableLength:1};}
function probe(){const geometry=new THREE.SphereGeometry(.025);geometry.computeBoundingBox();return {geometry,parts:[{shape:new R.Ball(.025),offset:new THREE.Vector3()}],mesh:new THREE.Mesh()};}
function setup(){const collision=new CollisionScene(R),stacks=new StackScene(collision);let sequence=0;
 const add=(type,x,z,size=null)=>{const f=size?makeSizedForm(type,R,size):makeForm(type,R),mesh=new THREE.Mesh(f.geometry),o={...f,type,id:++sequence,mesh,hanging:false,cableLength:1};mesh.position.set(x,collision.supportY(o,x,z),z);collision.objects.push(o);return o;};
 return {collision,stacks,add};
}
function visualBounds(c){
 if(c.kind==='box')return new THREE.Box3(new THREE.Vector3(c.x-c.w/2,c.y-c.h/2,c.z-c.d/2),new THREE.Vector3(c.x+c.w/2,c.y+c.h/2,c.z+c.d/2));
 const {r,h,x,y,z,axis}=c;
 return axis==='y'?new THREE.Box3(new THREE.Vector3(x-r,y-h/2,z-r),new THREE.Vector3(x+r,y+h/2,z+r)):new THREE.Box3(new THREE.Vector3(x-r,y-r,z-h/2),new THREE.Vector3(x+r,y+r,z+h/2));
}
const STACKABLES=['home-coffee-table','home-bookshelf','home-dresser','home-kitchen-counter'];

test('every household model at every size has finite geometry, valid colliders and a placeable body',()=>{
 const p=new PendulumScene(R),collision=new CollisionScene(R);
 for(const type of Object.keys(HOUSEHOLD_LABELS))for(const size of [1,2,3]){
  const o=form(type,size);
  assert.ok(o.geometry.attributes.position.array.every(Number.isFinite),`${type}/${size}`);
  assert.ok(o.height>0,`${type}/${size}`);
  assert.equal(collision.canPlace(o,o.mesh.position),true,`${type}/${size}`);
  p.add(o);
  assert.equal(o.body.numColliders(),o.parts.length,`${type}/${size}`);
  p.remove(o);o.geometry.dispose();
 }
 p.dispose();
});

test('each collider matches its visual component within 5% and counts follow the recipe',()=>{
 for(const type of Object.keys(HOUSEHOLD_LABELS)){
  const f=makeForm(type,R),components=householdComponents(type);
  assert.equal(f.parts.length,components.length,type);
  const natural=components.reduce((bounds,c)=>bounds.union(visualBounds(c)),new THREE.Box3());
  assert.ok(Math.abs(natural.min.y)<1e-9,`${type} sits on the floor`);
  const center=(natural.min.y+natural.max.y)/2;
  for(let i=0;i<components.length;i++){
   const collider=shapeBounds(f.parts[i].shape).clone().translate(f.parts[i].offset),visual=visualBounds(components[i]).translate(new THREE.Vector3(0,-center,0)),size=visual.getSize(new THREE.Vector3()),middle=visual.getCenter(new THREE.Vector3());
   for(const axis of ['x','y','z']){
    assert.ok(Math.abs(collider.max[axis]-collider.min[axis]-size[axis])<=.05*Math.max(size[axis],.05),`${type}[${i}] ${axis} size`);
    assert.ok(Math.abs((collider.max[axis]+collider.min[axis])/2-middle[axis])<1e-4,`${type}[${i}] ${axis} center`);
   }
  }
  f.geometry.dispose();
 }
});

test('merged geometry bounds agree with the union of the declared components',()=>{
 for(const type of Object.keys(HOUSEHOLD_LABELS)){
  const f=makeForm(type,R),components=householdComponents(type);
  const natural=components.reduce((bounds,c)=>bounds.union(visualBounds(c)),new THREE.Box3()),shifted=natural.clone().translate(new THREE.Vector3(0,-(natural.min.y+natural.max.y)/2,0));
  for(const axis of ['x','y','z']){
   assert.ok(Math.abs(f.geometry.boundingBox.min[axis]-shifted.min[axis])<1e-4,`${type} ${axis} min`);
   assert.ok(Math.abs(f.geometry.boundingBox.max[axis]-shifted.max[axis])<1e-4,`${type} ${axis} max`);
  }
  f.geometry.dispose();
 }
});

// [x,y,z,clear,label] in natural frame; clear = a probe ball fits there.
const PROBES={
 'home-chair':[[0,.3,0,true,'open under the seat'],[.185,.3,.185,false,'leg'],[0,.445,0,false,'seat slab']],
 'home-sofa':[[0,.3,0,false,'base'],[0,.7,-.3,false,'backrest'],[0,.7,0,true,'air in front of the backrest']],
 'home-coffee-table':[[0,.25,0,true,'open underside'],[.4,.25,.2,false,'leg'],[0,.42,0,false,'top']],
 'home-bookshelf':[[0,.7,0,true,'lower shelf cavity'],[0,1.6,0,true,'upper cavity'],[0,.7,-.14,false,'back panel'],[0,.5,0,false,'shelf'],[.385,.9,0,false,'side']],
 'home-dresser':[[0,.4,0,false,'body'],[0,.22,.28,false,'drawer face']],
 'home-bed':[[0,.3,0,false,'frame'],[0,.85,-1.02,false,'headboard']],
 'home-kitchen-counter':[[0,.4,0,false,'body'],[0,.875,0,false,'top']],
 'home-television':[[0,.56,0,false,'screen'],[0,.13,0,false,'neck'],[.3,.13,0,true,'air beside the neck']],
 'home-floor-lamp':[[0,.015,0,false,'base'],[0,.7,0,false,'pole'],[.12,.7,0,true,'air beside the pole'],[0,1.42,0,false,'shade']],
 'home-fridge':[[0,.85,0,false,'body'],[0,.85,.34,false,'door face'],[.28,1.05,.365,false,'handle']],
 'home-washing-machine':[[0,.4,0,false,'body'],[0,.5,.32,false,'drum door']],
 'home-rug':[[0,.01,0,false,'flat slab']],
};
test('probes confirm open undersides and solid silhouettes exactly where the visuals say',()=>{
 for(const [type,checks] of Object.entries(PROBES)){
  const o=form(type),ball=probe(),collision=new CollisionScene(R);collision.objects=[o,ball];
  const at=(x,y,z)=>new THREE.Vector3(x,y-o.height/2,z).add(o.mesh.position);
  for(const [x,y,z,clear,label] of checks)assert.equal(collision.canPlace(ball,at(x,y,z)),clear,`${type} ${label}`);
  o.geometry.dispose();ball.geometry.dispose();
 }
});

test('stackable household models take a small form on top and refuse a full-foot block',()=>{
 for(const type of STACKABLES){
  const {collision,stacks,add}=setup(),host=add(type,-8,0),pot=add('plant-rubber-small',-5,0),block=add('box',-2,0);
  assert.ok(stacks.fits(pot,host,-8,0),`${type} accepts a plant`);
  assert.ok(stacks.move(pot,new THREE.Vector3(-8,0,0)),`${type} hosts the plant`);
  assert.equal(pot.support,host,`${type} becomes the support`);
  assert.ok(collision.canPlace(pot,pot.mesh.position),`${type} placement stays valid`);
  assert.equal(stacks.fits(block,host,-8,0),false,`${type} refuses a full-foot block`);
  for(const o of [host,pot,block])o.geometry.dispose();
 }
});

test('non-stackable household models refuse a small form on top',()=>{
 for(const type of Object.keys(HOUSEHOLD_LABELS).filter(t=>!STACKABLES.includes(t))){
  const {stacks,add}=setup(),host=add(type,-8,0),pot=add('plant-rubber-small',-5,0);
  assert.equal(stacks.fits(pot,host,-8,0),false,`${type} refuses a plant`);
  host.geometry.dispose();pot.geometry.dispose();
 }
});

test('household models rotate in place through 5-degree clearance probes',()=>{
 for(const type of Object.keys(HOUSEHOLD_LABELS)){
  const {stacks,add}=setup(),o=add(type,-8,0);
  assert.equal(stacks.rotate(o),true,type);
  o.geometry.dispose();
 }
});

test('household forms round-trip through the existing space records',()=>{
 const f=makeSizedForm('home-sofa',R,2),o={...f,id:7,type:'home-sofa',mesh:new THREE.Mesh(f.geometry),properties:{locked:false,tone:.3,reflectance:0,emittance:0,messageMode:'ordered',messages:[{text:'hello',choices:[]}]},hanging:false,cableLength:5,anchor:null};
 const record=objectRecord(o),space={version:1,objects:[record],camera:{position:[1,2,3],target:[0,0,0],zoom:1},environment:{sun:'80'}};
 const loaded=validateSpace(JSON.parse(JSON.stringify(space)),new Set([...Object.keys(LABELS),'pool']));
 assert.deepEqual(loaded,space);
 assert.equal(loaded.objects[0].type,'home-sofa');
 const rebuilt=makeSizedForm(loaded.objects[0].type,R,loaded.objects[0].gridSize);
 assert.equal(rebuilt.height,f.height);
 rebuilt.geometry.dispose();f.geometry.dispose();
});

test('household forms honor the locked-object distinction',()=>{
 const f=makeForm('home-chair',R),o={...f,type:'home-chair',mesh:new THREE.Mesh(f.geometry),properties:properties()};
 assert.equal(canManipulate(o,[o]),true);
 o.properties.locked=true;
 assert.equal(canManipulate(o,[o]),false);
 o.geometry.dispose();
});
