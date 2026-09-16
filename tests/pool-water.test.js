import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PoolWater,PoolSpray} from '../src/pool-water.js';
const advance=(w,seconds)=>{for(let i=0;i<seconds*120;i++)w.step(1/120);};
test('pool interaction raises the real surface above the floor and spray follows gravity back to water',()=>{
 const w=new PoolWater();w.energy=0;w.splash(.5,.5);let crest=0,spray=0;
 for(let i=0;i<180;i++){w.step(1/120);crest=Math.max(crest,...w.height);spray=Math.max(spray,...w.drops.map(d=>d.y));}
 assert.ok(crest>.3,`crest ${crest} must rise above the -0.19m rest level`);
 assert.ok(spray>.65,`ballistic spray height ${spray}`);assert.ok(w.returns>0);assert.equal(w.drops.length,0);
 advance(w,25);assert.ok(Math.max(...w.height.map(Math.abs))<.001);
});
test('dragging raises a crest and emits bounded low-poly spray, while calm water stays still',()=>{
 const w=new PoolWater();w.energy=0;advance(w,1);assert.ok(w.height.every(h=>h===0));assert.equal(w.drops.length,0);
 w.stroke({u:.2,v:.5},{u:.8,v:.5},.5);advance(w,.05);assert.ok(Math.max(...w.height)>.1);assert.ok(w.drops.length>0&&w.drops.length<=96);
 const view=new PoolSpray(w,new THREE.MeshPhongMaterial({color:0xffffff}));view.update();assert.equal(view.mesh.count,w.drops.length);
 const matrix=new THREE.Matrix4();view.mesh.getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.elements[13]-w.drops[0].y)<1e-6);
 assert.equal(view.mesh.geometry.attributes.position.count/3,8);
 w.reset();view.update();assert.equal(view.mesh.count,0);assert.ok(w.height.every(h=>h===0));
});
test('pool spray is independent of display frame rate and heavy interaction stays finite',()=>{
 const a=new PoolWater(),b=new PoolWater();a.energy=b.energy=0;a.splash(.5,.5);b.splash(.5,.5);
 for(let i=0;i<60;i++)a.step(1/120);for(let i=0;i<15;i++)b.step(1/30);assert.deepEqual(a.height,b.height);assert.deepEqual(a.drops,b.drops);
 a.energy=1;for(let i=0;i<1200;i++){if(i%12===0)a.splash(.5+.3*Math.sin(i),.5+.3*Math.cos(i),10);a.step(1/120);assert.ok(a.drops.length<=96);}
 assert.ok(a.height.every(Number.isFinite));assert.ok(Math.max(...a.height.map(Math.abs))<2);assert.ok(Math.abs(a.height.reduce((sum,h)=>sum+h,0)/a.height.length)<1e-6);
});
