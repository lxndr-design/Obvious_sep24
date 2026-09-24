import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {BirdColony,seededRandom} from '../src/birds.js';
import {BirdseedField} from '../src/birdseed.js';
import {sampleBirdScale,birdFootHeight} from '../src/bird-traits.js';
import {makeForm} from '../src/shapes.js';
import {Ecology} from '../src/ecology.js';
import {PendulumScene} from '../src/pendulums.js';
import {CollisionScene} from '../src/collision.js';
import {WindField} from '../src/wind.js';
await R.init();
const advance=(fn,seconds)=>{for(let i=0;i<seconds*60;i++)fn(1/60);};
const resident=(id,site,scale=1)=>{
 const position=site.position.clone().add(new THREE.Vector3(0,.08*scale,0));
 return {id,scale,caution:1,fullness:0,capacity:10,fatness:0,pileId:site.id,habitat:site.kind??'leaves',sitePosition:site.position.clone(),position,target:position.clone(),walkTarget:position.clone(),nextWalk:99,state:'foraging',age:0,visitAge:0,opacity:1,yaw:0,angle:0};
};
test('a cautious bathing resident notices seed before returning to the rim and gets it before new arrivals',()=>{
 const bath={id:'bath',kind:'bath',position:new THREE.Vector3(),rimY:1.53,waterY:1.45,rimRadius:.69};
 const c=new BirdColony(),f=new BirdseedField(()=>.5),b=resident(1,bath);b.state='bathing';b.position.set(.16,1.525,0);b.to=b.position.clone();b.target.set(.69,1.612,0);c.birds=[b];c.sequence=1;c.time=20;c.nextArrival=20;
 f.scatter(new THREE.Vector3(1.6,0,0));let noticeTime=null,peakFlight=0;
 advance(dt=>{c.step(dt,[bath,...f.sites()]);if(b.state==='considering'&&noticeTime===null)noticeTime=c.time-20;if(b.state==='arriving')peakFlight=Math.max(peakFlight,b.position.y);},14);
 assert.ok(noticeTime>3&&noticeTime<4.6,`noticed after ${noticeTime}s`);
 assert.equal(f.read().seeds[0].eatenBy,b.id);assert.equal(b.fullness,1);
 assert.ok(peakFlight>bath.rimY+.2,'departure rises over the rim');assert.equal(b.opacity,1);
});
test('real fountain visitors leave for physical grains and their rendered scales match their traits',()=>{
 const p=new PendulumScene(R),collision=new CollisionScene(R),f=makeForm('fountain',R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(0,f.height/2,3);const fountain={...f,mesh,id:3,type:'fountain',hanging:false};collision.objects=[fountain];p.add(fountain);
 const e=new Ecology(new THREE.Scene(),p,collision,new WindField(),R);e.feedingMode=true;p.beforeStep=dt=>e.beforeStep(dt);
 const step=dt=>{p.step(dt);e.update(dt,null,0,0);};advance(step,25);
 const ids=e.colony.birds.filter(b=>b.habitat==='bath').map(b=>b.id);assert.ok(ids.length>=1);
 e.scatterFood(new THREE.Vector3(1.5,0,3));advance(step,14);
 assert.equal(e.food.eaten,1);assert.ok(ids.includes(e.food.read().seeds[0].eatenBy));
 for(const bird of e.colony.birds){assert.ok(bird.scale>=.75&&bird.scale<=1.25);assert.equal(e.birdViews.get(bird.id).group.scale.x,bird.scale);assert.equal(e.read().birds.find(b=>b.id===bird.id).scale,bird.scale);}
 e.reset();p.dispose();
});
test('large birds make fewer ground hops and bath trips over the same time',()=>{
 const hops=[],trips=[];
 for(const scale of [.8,1.2]){
  const pile={id:'pile',position:new THREE.Vector3(),count:4},c=new BirdColony(),b=resident(1,pile,scale);b.walkTarget.x=30;c.birds=[b];c.nextArrival=Infinity;
  let count=0,raised=false;advance(dt=>{c.step(dt,[pile]);const above=b.position.y>birdFootHeight(b)+.001;if(above&&!raised)count++;raised=above;},8);hops.push(count);
  const bath={id:'bath',kind:'bath',position:new THREE.Vector3(),rimY:1.5,waterY:1.4,rimRadius:.6},d=new BirdColony(),visitor=resident(1,bath,scale);visitor.state='perching';visitor.position.y=1.5+birdFootHeight(visitor);visitor.target=visitor.position.clone();d.birds=[visitor];d.nextArrival=Infinity;
  let journeys=0,last='perching';advance(dt=>{d.step(dt,[bath]);if(visitor.state==='hopping'&&last!=='hopping')journeys++;last=visitor.state;},35);trips.push(journeys);
 }
 assert.ok(hops[0]>hops[1]*1.4,`ground hops ${hops}`);assert.ok(trips[0]>trips[1],`bath trips ${trips}`);
});
test('size distribution modestly favors small birds and small arrivals choose a nearby squad',()=>{
 const random=seededRandom(73),scales=Array.from({length:10000},()=>sampleBirdScale(random)),fraction=scales.filter(s=>s<1).length/scales.length;
 assert.ok(fraction>.55&&fraction<.65);assert.ok(scales.every(s=>s>=.75&&s<=1.25));
 const a={id:'large-group',position:new THREE.Vector3(-3,0,0),count:8},b={id:'small-group',position:new THREE.Vector3(3,0,0),count:8};
 const c=new BirdColony();c.time=20;c.nextArrival=0;c.sequence=2;c.traitRandom=()=>0;c.birds=[resident(1,a,1.2),resident(2,b,.8)];
 c.step(1/60,[a,b]);const newcomer=c.birds.find(b=>b.id===3);assert.ok(newcomer);assert.equal(newcomer.pileId,b.id);assert.equal(newcomer.scale,.75);assert.ok(newcomer.target.distanceTo(c.birds[1].position)<1);assert.ok(c.nextArrival-c.time<11.1,'small squads get shorter arrival intervals');
});
