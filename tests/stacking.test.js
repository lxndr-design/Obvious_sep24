import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {CollisionScene} from '../src/collision.js';
import {StackScene} from '../src/stacking.js';
await R.init();
function setup(){const collision=new CollisionScene(R),stacks=new StackScene(collision);let sequence=0;
 const add=(type,x,z)=>{const f=makeForm(type,R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(x,collision.supportY({...f,mesh},x,z),z);const o={...f,mesh,type,id:++sequence};collision.objects.push(o);return o;};
 const move=(o,x,z)=>stacks.move(o,new THREE.Vector3(x,o.mesh.position.y,z));return {collision,stacks,add,move};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<.002,`${a} != ${b}`);
function tower(){const s=setup(),base=s.add('table-square-full',-10,0),middle=s.add('table-square-half',-7,0),top=s.add('sphere',-7,3);assert.ok(s.move(middle,-10,0));assert.ok(s.move(top,-10,0));return {...s,base,middle,top};}
test('flat surface scores distinguish cubes, curved forms, table feet and tabletops',()=>{
 const {add}=setup(),box=add('box',-10,0),sphere=add('sphere',-7,0),table=add('table-square-full',-4,0),column=add('cylinder',-1,0);
 assert.equal(box.stacking.foot,10);assert.equal(box.stacking.head,10);assert.equal(sphere.stacking.foot,0);assert.equal(sphere.stacking.head,0);
 assert.ok(table.stacking.foot<1);assert.equal(table.stacking.head,10);near(column.stacking.head,Math.PI*2.5);
});
test('a small pot sits on a tabletop; strict scores and actual foot outlines both constrain placement',()=>{
 const {add,move,stacks,collision}=setup(),table=add('table-square-full',-8,0),pot=add('plant-rubber-small',-5,0),box=add('box',-8,4);
 assert.ok(move(pot,-8,0));assert.equal(pot.support,table);near(pot.mesh.position.y,1.3+pot.height/2);assert.ok(collision.canPlace(pot,pot.mesh.position));
 assert.equal(stacks.fits(box,table,-8,0),false,'equal foot/head scores cannot stack');
 assert.equal(stacks.fits(pot,table,-7.1,0),false,'the whole pot base must fit');
 table.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4);
 assert.equal(stacks.fits(pot,table,-7.2,.8),false,'rotated support corners are not an oversized box');
 assert.equal(stacks.fits(table,pot,-8,0),false,'foliage has no supporting head');
});
test('dragging a base carries the whole tower; dragging a middle form leaves ancestors behind',()=>{
 const {base,middle,top,move,collision}=tower();near(middle.mesh.position.y,1.3+.325);near(top.mesh.position.y,1.3+.65+.75);assert.equal(top.support,middle);
 assert.ok(move(base,-6,0));for(const o of [base,middle,top]){near(o.mesh.position.x,-6);assert.ok(collision.canPlace(o,o.mesh.position));}
 assert.ok(move(middle,-6,4));near(base.mesh.position.z,0);near(middle.mesh.position.z,4);near(top.mesh.position.z,4);near(middle.mesh.position.y,.325);near(top.mesh.position.y,.65+.75);assert.equal(middle.support,null);assert.equal(top.support,middle);
 assert.ok(move(top,-3,4));near(top.mesh.position.y,.75);assert.equal(top.support,null);near(middle.mesh.position.x,-6);
});
test('all carried objects participate in continuous collisions and failed movement is atomic',()=>{
 const {base,middle,top,add,move,stacks}=tower(),obstacle=add('box',-7,0);obstacle.mesh.position.y=3.1;obstacle.hanging=true;
 const snapshot=stacks.snapshot(base);assert.equal(move(base,-4,0),false);
 for(const s of snapshot)assert.deepEqual(s.object.mesh.position.toArray(),s.position.toArray());assert.equal(middle.support,base);assert.equal(top.support,middle);
});
test('cancel restores the full stack and its support links; removal settles descendants onto a lower surface',()=>{
 const {base,middle,top,move,stacks,collision}=tower(),snapshot=stacks.snapshot(middle);
 assert.ok(move(middle,-7,4));stacks.restore(snapshot);assert.equal(middle.support,base);assert.equal(top.support,middle);near(top.mesh.position.z,0);
 collision.objects.splice(collision.objects.indexOf(middle),1);top.support=null;assert.ok(stacks.settle(top));assert.equal(top.support,base);near(top.mesh.position.y,1.3+.75);
});
test('stack rotation preserves relative placements and pool entry and exit preserve stack heights',()=>{
 const {base,middle,top,move,stacks}=tower();middle.mesh.position.x+=.5;top.mesh.position.x+=.5;
 assert.ok(stacks.rotate(base));near(middle.mesh.position.x,base.mesh.position.x);near(top.mesh.position.z,base.mesh.position.z-.5);
 // Move near the pool first, away from other furniture, then across the rim.
 assert.ok(move(base,3,4));assert.ok(move(base,3,-1.5));near(base.mesh.position.y,.65-.71);near(top.mesh.position.y,1.3+.65+.75-.71);
 assert.ok(move(base,3,4));near(base.mesh.position.y,.65);near(top.mesh.position.y,1.3+.65+.75);
});

test('float-rounded sphere contact can lift away from a circular tabletop',()=>{
 const {add,move}=setup(),table=add('table-round-half',1,5),sphere=add('sphere',1,8);
 assert.ok(move(sphere,1,5));sphere.mesh.position.y=Math.fround(sphere.mesh.position.y);table.mesh.position.y=Math.fround(table.mesh.position.y);
 assert.ok(move(sphere,1,8));assert.equal(sphere.support,null);near(sphere.mesh.position.y,.75);near(table.mesh.position.z,5);
});
