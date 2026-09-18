import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {birdMesh} from '../src/nature-shapes.js';
import {animateBirdWings,setBirdWings} from '../src/bird-wings.js';
const advance=(bird,seconds)=>{for(let i=0;i<seconds*120;i++){bird.age+=1/120;animateBirdWings(bird,1/120);}};
test('closed wings tuck against the body while open wings have a distinct broad silhouette',()=>{
 const view=birdMesh(),width=()=>new THREE.Box3().setFromObject(view.group).getSize(new THREE.Vector3()).z;
 setBirdWings(view,0);const closed=width();setBirdWings(view,1);const open=width();
 assert.ok(closed<.08);assert.ok(open>.45&&open>closed*5);
 assert.ok(view.wings.every(w=>w.geometry.index.count===6),'each wing remains two triangles');
 setBirdWings(view,0);assert.equal(width(),closed);
});
test('flapping strokes extend both spread wings above and below the resting plane',()=>{
 const view=birdMesh(),tips=()=>view.wings.map(w=>w.localToWorld(new THREE.Vector3().fromBufferAttribute(w.geometry.attributes.position,2)));
 setBirdWings(view,1,1.1);view.group.updateMatrixWorld(true);const high=tips();assert.ok(high.every(p=>p.y>.18));
 setBirdWings(view,1,-1.1);view.group.updateMatrixWorld(true);const low=tips();assert.ok(low.every(p=>p.y<-.15));
 assert.ok(Math.abs(high[0].y-high[1].y)<1e-6);assert.ok(Math.abs(low[0].y-low[1].y)<1e-6);
});
test('birds glide open, fold at rest, and smoothly reopen for flight without resetting the flap phase',()=>{
 const bird={state:'arriving',age:2.45,wingSpread:1,wingFlap:1.12,wingPhase:.2};advance(bird,.35);
 assert.equal(bird.wingState,'open');assert.equal(bird.wingSpread,1);assert.equal(bird.wingFlap,0);
 bird.state='perching';bird.age=0;advance(bird,.4);assert.equal(bird.wingState,'closed');assert.equal(bird.wingSpread,0);assert.equal(bird.wing,0);
 bird.state='departing';bird.age=0;const phase=bird.wingPhase;animateBirdWings(bird,1/120);assert.equal(bird.wingState,'flapping');assert.ok(bird.wingSpread>0&&bird.wingSpread<.3);assert.notEqual(bird.wingPhase,phase);
 let min=Infinity,max=-Infinity;for(let i=0;i<120;i++){bird.age+=1/120;animateBirdWings(bird,1/120);min=Math.min(min,bird.wing);max=Math.max(max,bird.wing);}
 assert.ok(min<-.9&&max>.9);
});
test('bathing alternates active flapping with folded pauses',()=>{
 const bird={state:'bathing',age:.3};animateBirdWings(bird,1/60);assert.equal(bird.wingState,'flapping');
 bird.age=1.1;advance(bird,.35);assert.equal(bird.wingState,'closed');assert.equal(bird.wingSpread,0);assert.equal(bird.wing,0);
});
