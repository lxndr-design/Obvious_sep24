import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {BATH,FOUNTAIN} from '../src/bath-shapes.js';
import {BathWater,bathWaterContexts,hitBathWater} from '../src/birdbath.js';
import {HedgeScene} from '../src/hedges.js';
import {StackScene} from '../src/stacking.js';
import {dragFloor} from '../src/dragging.js';
import {CollisionScene} from '../src/collision.js';
import {PendulumScene} from '../src/pendulums.js';
await R.init();
function setup(){
 const collision=new CollisionScene(R),p=new PendulumScene(R),joins=new HedgeScene(R,collision,p,()=>{},'birdbath');let id=0;
 const add=(x,z)=>{const f=makeForm('birdbath',R),mesh=new THREE.Mesh(f.geometry),o={...f,mesh,type:'birdbath',id:++id,hanging:false};mesh.position.set(x,f.height/2,z);assert.ok(collision.canPlace(o,mesh.position));collision.objects.push(o);p.add(o);return o;};
 const geometry=new THREE.SphereGeometry(.02);geometry.computeBoundingBox();const probe={geometry,mesh:new THREE.Mesh(),parts:[{shape:new R.Ball(.02),offset:new THREE.Vector3()}]};
 return {collision,p,joins,add,clear:(x,y,z)=>collision.canPlace(probe,new THREE.Vector3(x,y,z))};
}
test('shorter baths join into a hollow basin and regain their round rims when separated',()=>{
 const {p,joins,add,clear}=setup(),a=add(0,0),b=add(1.5,0);assert.equal(a.height,1.2);assert.ok(a.height<FOUNTAIN.height);
 assert.ok(joins.refresh());assert.equal(a.bathJoins,2);assert.equal(b.bathJoins,1);
 assert.ok(clear(.75,BATH.waterY,0),'no divider across the water');assert.equal(clear(.75,.96,0),false,'continuous solid basin floor');
 assert.equal(clear(.5,1.14,.70),false,'outer rim remains');assert.ok(joins.refresh(b));b.mesh.position.x=4.5;p.syncPose(b);assert.ok(joins.refresh());
 assert.equal(a.bathJoins,0);assert.equal(b.bathJoins,0);assert.equal(clear(.7,1.14,0),false,'round rim restored');p.dispose();
});
test('joined baths share ripples, water hit targets and matching heights along their join',()=>{
 const {p,joins,add}=setup(),a=add(0,0),b=add(1.5,0);assert.ok(joins.refresh());
 const contexts=bathWaterContexts([a,b]),va=new BathWater(a,contexts.get(a)),vb=new BathWater(b,contexts.get(b));assert.equal(va.field,vb.field);
 va.splash(new THREE.Vector3(.35,BATH.waterY,0));let rightPeak=0;
 for(let i=0;i<90;i++){va.update(1/60,new THREE.Vector3());vb.update(1/60,new THREE.Vector3(),false);const uv=vb.uv(new THREE.Vector3(1.05,BATH.waterY,0)),n=va.field.size;rightPeak=Math.max(rightPeak,Math.abs(va.field.height[Math.round(uv.v*(n-1))*n+Math.round(uv.u*(n-1))]));}
 assert.ok(rightPeak>.0001,'waves propagate into the neighbouring tile');
 const ap=va.geometry.attributes.position,bp=vb.geometry.attributes.position;
 for(let row=0;row<33;row++)assert.ok(Math.abs(ap.getY(row*33+32)-bp.getY(row*33))<1e-7,'no raised seam');
 a.mesh.updateMatrixWorld(true);b.mesh.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(.8,3,0),new THREE.Vector3(0,-1,0));
 assert.ok(hitBathWater(ray,[va,vb],ray.intersectObjects([a.mesh,b.mesh],false)),'water rather than a divider handles the pointer');
 va.dispose();vb.dispose();p.dispose();
});
test('square and L bath groups preserve independent tiles, and deletion or different elevations splits them',()=>{
 const {p,collision,joins,add,clear}=setup(),a=add(0,0),b=add(1.5,0),c=add(0,1.5),d=add(1.5,1.5);assert.ok(joins.refresh());
 assert.ok(clear(.75,BATH.waterY,.75));assert.equal(new Set(bathWaterContexts([a,b,c,d]).values()).size,1);
 collision.objects.splice(collision.objects.indexOf(d),1);p.remove(d);assert.ok(joins.refresh());assert.equal(clear(.75,BATH.waterY,.75),false,'rim bounds the removed corner');assert.ok(clear(.5,BATH.waterY,.5));
 b.mesh.position.y+=1;p.syncPose(b);assert.ok(joins.refresh());assert.equal(b.bathJoins,0);assert.equal(new Set(bathWaterContexts([a,b,c]).values()).size,2);p.dispose();
});

test('a middle bath pulls free without moving its neighbours and reconnects on return',()=>{
 const {collision,p,joins,add}=setup(),a=add(0,0),b=add(1.5,0),c=add(3,0),stacks=new StackScene(collision);assert.ok(joins.refresh());
 assert.ok(joins.refresh(b));assert.ok(dragFloor(stacks,b,new THREE.Vector3(1.5,b.mesh.position.y,2)).moved);assert.ok(joins.refresh());
 assert.equal(a.bathJoins,0);assert.equal(c.bathJoins,0);assert.equal(a.mesh.position.x,0);assert.equal(c.mesh.position.x,3);
 assert.ok(dragFloor(stacks,b,new THREE.Vector3(1.5,b.mesh.position.y,0)).moved);assert.ok(joins.refresh());assert.equal(b.bathJoins,3);p.dispose();
});
