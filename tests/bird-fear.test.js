import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BirdColony} from '../src/birds.js';
import {DuckFlock} from '../src/ducks.js';
import {HoleTerrain} from '../src/hole-terrain.js';
import {HoleLayout} from '../src/terrain.js';
const advance=(step,t)=>{for(let i=0;i<t*60;i++)step(1/60);};
const site={id:'pile',position:new THREE.Vector3(),count:6};
function resident(id,caution,x){const position=new THREE.Vector3(x,.08,0);return {id,caution,position,target:position.clone(),walkTarget:position.clone(),sitePosition:site.position.clone(),pileId:site.id,habitat:'leaves',state:'foraging',scale:1,opacity:1,age:0,visitAge:0,nextWalk:10,yaw:0};}
test('cautious birds flee first, brave birds hesitate, and repeated world or screen scares do not reset deadlines',()=>{
 const c=new BirdColony();c.nextArrival=Infinity;c.birds=[resident(1,1,-.3),resident(2,.5,0),resident(3,0,.3)];const before=c.birds.map(b=>b.position.clone()),deadlines=[];
 c.disturb(site.position,[site]);for(const b of c.birds)deadlines.push(b.fleeAt);assert.ok(deadlines[0]<deadlines[1]&&deadlines[1]<deadlines[2]);
 advance(dt=>{c.birds.forEach(b=>c.scare(b,site.position));c.step(dt,[site],site.position);},.3);
 assert.equal(c.birds[0].state,'departing');assert.equal(c.birds[1].state,'foraging');assert.equal(c.birds[2].state,'foraging');assert.equal(c.birds[2].fleeAt,deadlines[2]);assert.ok(c.birds[2].position.equals(before[2]));
 advance(dt=>c.step(dt,[site],site.position),.9);assert.equal(c.birds[1].state,'departing');assert.equal(c.birds[2].state,'foraging');
 advance(dt=>c.step(dt,[site],site.position),.8);assert.equal(c.birds[2].state,'departing');assert.ok(c.birds[0].age>c.birds[1].age+.5&&c.birds[1].age>c.birds[2].age+.5);
});
test('duck flock mates react individually using the same caution scale and retain their flight paths',()=>{
 const terrain=new HoleTerrain(new THREE.Scene(),new THREE.MeshStandardMaterial());terrain.rebuild(new HoleLayout([{id:1,x:0,z:0,size:2}]));
 const f=new DuckFlock();f.nextArrival=0;f.step(1/60,terrain);f.nextArrival=Infinity;f.nextMove=Infinity;advance(dt=>f.step(dt,terrain),3.1);
 const [timid,brave]=f.ducks;timid.caution=1;brave.caution=0;f.ducks.forEach(d=>{d.dabbleAt=Infinity;});const threat=new THREE.Vector3(0,0,0);f.scare(threat);const at=brave.fleeAt;
 advance(dt=>{f.scare(threat);f.step(dt,terrain,threat);},.4);assert.equal(timid.state,'departing');assert.equal(brave.state,'swimming');assert.equal(brave.fleeAt,at);assert.ok(timid.position.y>brave.position.y+.3);
 advance(dt=>f.step(dt,terrain,threat),1.6);assert.equal(brave.state,'departing');assert.ok(timid.age>brave.age+1.7);advance(dt=>f.step(dt,terrain),3.1);assert.equal(f.ducks.length,0);
});
test('habitat removal still evacuates alerted birds immediately',()=>{
 const c=new BirdColony();c.nextArrival=Infinity;const b=resident(1,0,0);c.birds=[b];c.scare(b,site.position);c.step(1/60,[]);assert.equal(b.state,'departing');assert.equal(b.fleeAt,null);
});
