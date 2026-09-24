import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import {MessageHops,messageHopMembers} from '../src/message-hops.js';
const form=(text='Hello')=>({type:'box',height:1,properties:{locked:false,messages:[{text}]},mesh:new Mesh(new BoxGeometry(),new MeshStandardMaterial())});
const advance=(h,objects,time,options)=>{for(let i=0;i<time*60;i++)h.step(1/60,objects,options);};
test('nonempty message objects make brief occasional hops and logical poses always restore',()=>{
 const a=form(),b=form('  '),h=new MessageHops(()=>0);a.mesh.position.set(2,.5,3);const original=a.mesh.position.clone();
 advance(h,[a,b],1.4);assert.ok(h.offsets.has(a));assert.equal(h.offsets.has(b),false);assert.ok(h.offsets.get(a)>.04);
 h.withPresentation(()=>assert.ok(a.mesh.position.y>original.y));assert.deepEqual(a.mesh.position,original);
 assert.throws(()=>h.withPresentation(()=>{throw Error('render failed');}),/render failed/);assert.deepEqual(a.mesh.position,original);
 advance(h,[a,b],.3);assert.equal(h.active,null);advance(h,[a,b],4);assert.equal(h.active,null);advance(h,[a,b],2);assert.ok(h.active);
});
test('joined tiles and upper stack members hop together without changing support links',()=>{
 const base=form(),top=form(''),other=form('');top.support=base;const h=new MessageHops(()=>0);advance(h,[base,top,other],1.4);
 assert.equal(h.offsets.get(base),h.offsets.get(top));assert.equal(h.offsets.has(other),false);assert.equal(top.support,base);
 const left=form(),right=form();left.type=right.type='birdbath';left.bathJoins=2;right.bathJoins=1;right.mesh.position.x=1.5;
 assert.deepEqual(messageHopMembers(left,[left,right]),[left,right]);
});
test('hovering, dragging, locks, pause, reduced motion and blocked clearance suppress hops',()=>{
 for(const options of [{disabled:true},{busy:()=>true},{clear:()=>false}]){const a=form(),h=new MessageHops(()=>0);advance(h,[a],4,options);assert.equal(h.active,null);assert.equal(h.offsets.size,0);}
 const a=form(),top=form(''),h=new MessageHops(()=>0);top.support=a;top.properties.locked=true;advance(h,[a,top],4);assert.equal(h.active,null);
 top.properties.locked=false;for(let i=0;i<90&&!h.active;i++)h.step(1/60,[a,top]);assert.ok(h.active);a.properties.messages=[];h.step(1/60,[a,top]);assert.equal(h.offsets.size,0);
 h.reset();assert.equal(h.schedule.size,0);assert.equal(h.active,null);
});
test('several message objects take turns instead of hopping together',()=>{
 const objects=[form(),form(),form()],h=new MessageHops(()=>0),seen=new Set();
 for(let i=0;i<4*60;i++){h.step(1/60,objects);assert.ok(h.offsets.size<=1);if(h.active)seen.add(h.active.root);}
 assert.equal(seen.size,3);
});

test('real shape clearance allows a floor hop but rejects an overhead obstruction',async()=>{
 const {default:R}=await import('@dimforge/rapier3d-compat');await R.init();const {CollisionScene}=await import('../src/collision.js'),{StackScene}=await import('../src/stacking.js'),{makeForm}=await import('../src/shapes.js'),{hopClearance}=await import('../src/message-hops.js');
 const c=new CollisionScene(R),stacks=new StackScene(c),shape=makeForm('box',R),o={...shape,mesh:new Mesh(shape.geometry),type:'box'};o.mesh.position.set(0,o.height/2,-3);c.objects=[o];assert.equal(hopClearance(stacks,[o],.13),true);
 const roofShape=makeForm('box',R),roof={...roofShape,mesh:new Mesh(roofShape.geometry),type:'box'};roof.mesh.position.set(0,o.height+.04+roof.height/2,-3);c.objects.push(roof);assert.equal(hopClearance(stacks,[o],.13),false);assert.equal(o.mesh.position.y,o.height/2);
});

test('hop height scales with geometry and showing a message retires future hops after landing',()=>{
 const a=form(),b=form(),ha=new MessageHops(()=>0),hb=new MessageHops(()=>0);b.mesh.scale.setScalar(2);
 advance(ha,[a],1.25);advance(hb,[b],1.25);assert.ok(Math.abs(hb.active.height/ha.active.height-2)<1e-8);
 a.messageSeen=true;const events=[];for(let i=0;i<20*60;i++){ha.step(1/60,[a]);events.push(...ha.events);}
 assert.equal(events.filter(e=>e.kind==='landing').length,1);assert.equal(events.filter(e=>e.kind==='takeoff').length,0);assert.equal(ha.active,null);assert.equal(ha.offsets.size,0);
});
test('hop puffs share one bounded instanced draw and fade completely in under half a second',async()=>{
 const {Scene,PerspectiveCamera}=await import('three'),{HopPuffs}=await import('../src/hop-puffs.js');const scene=new Scene(),puffs=new HopPuffs(scene,()=>.5),camera=new PerspectiveCamera(),o=form();o.mesh.position.y=.5;
 puffs.emit([o]);puffs.step(0,camera);assert.equal(puffs.mesh.count,6);const alpha=puffs.alpha.getX(0),radius=puffs.puffs[0].radius;
 puffs.step(.2,camera);assert.ok(puffs.alpha.getX(0)<alpha*.3);assert.equal(scene.children.length,1);assert.ok(puffs.puffs[0].position.y>.025);
 for(let i=0;i<40;i++)puffs.emit([o]);assert.equal(puffs.puffs.length,puffs.capacity);puffs.step(.5,camera);assert.equal(puffs.mesh.count,0);assert.ok(radius>0);
});
test('hops disturb pool and basin water, shake off visitors even in seed mode, and leave unrelated birds alone',async()=>{
 const THREE=await import('three'),{default:R}=await import('@dimforge/rapier3d-compat');await R.init();
 const {Ecology}=await import('../src/ecology.js'),{CollisionScene}=await import('../src/collision.js'),{PendulumScene}=await import('../src/pendulums.js'),{WindField}=await import('../src/wind.js'),{makeForm}=await import('../src/shapes.js'),{HoleTerrain}=await import('../src/hole-terrain.js'),{HoleLayout}=await import('../src/terrain.js');
 const scene=new THREE.Scene(),collision=new CollisionScene(R),p=new PendulumScene(R),wind=new WindField(),layout=new HoleLayout([{id:1,x:0,z:0,size:2}]),terrain=new HoleTerrain(scene,new THREE.MeshStandardMaterial());terrain.rebuild(layout);collision.setTerrain(layout);p.setTerrain(layout);
 const f=makeForm('fountain',R),mesh=new THREE.Mesh(f.geometry),o={...f,mesh,type:'fountain',id:8,hanging:false};mesh.position.y=f.height/2-.71;collision.objects=[o];p.add(o);
 const e=new Ecology(scene,p,collision,wind,R);e.terrain=terrain;e.feedingMode=true;e.syncBaths();
 const resident=(id,pileId,position)=>({id,pileId,position,opacity:1,state:'perching',scale:1,yaw:0,caution:0});
 const guest=resident(1,'bath-8',new THREE.Vector3(.6,.9,0)),distant=resident(2,'leaves',new THREE.Vector3(4,.08,0));e.colony.birds=[guest,distant];
 const position=mesh.position.clone(),bath=e.bathViews.get(o);e.objectHop({kind:'takeoff',members:[o],height:.14});
 assert.equal(guest.state,'departing');assert.equal(distant.state,'perching');assert.equal(guest.fleeAt,null);assert.ok(terrain.views[0].field.velocity.some(v=>v!==0));assert.ok(bath.field.velocity.some(v=>v!==0));assert.ok(mesh.position.equals(position));
 const splashes=bath.splashCount;e.objectHop({kind:'landing',members:[o],height:.14});assert.ok(bath.splashCount>splashes);e.reset();p.dispose();
});
