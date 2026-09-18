import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DuckFlock,duckMesh} from '../src/ducks.js';
import {BirdWaterContacts} from '../src/bird-water.js';
import {HoleTerrain} from '../src/hole-terrain.js';
import {HoleLayout} from '../src/terrain.js';
import {WindField} from '../src/wind.js';
import {WaveField} from '../src/waves.js';
const advance=(fn,t)=>{for(let i=0;i<t*60;i++)fn(1/60);};
function pool(holes=[{id:1,x:0,z:0,size:2}]){const terrain=new HoleTerrain(new THREE.Scene(),new THREE.MeshStandardMaterial());terrain.rebuild(new HoleLayout(holes));return terrain;}
const at=(terrain,p)=>{const view=terrain.at(p.x,p.z);return view?{field:view.field,y:view.mesh.position.y+terrain.sample(view,p.x,p.z),uv:q=>terrain.uv(view,q)}:null;};
test('duck admission creates pairs atomically, permits later singles and departs together',()=>{
 const terrain=pool(),flock=new DuckFlock();flock.nextArrival=0;flock.step(1/60,terrain);assert.equal(flock.ducks.length,2);
 flock.nextArrival=0;flock.step(1/60,terrain);assert.equal(flock.ducks.length,3);
 flock.step(1/60,terrain,flock.ducks[0].position.clone());assert.ok(flock.ducks.every(d=>d.state==='departing'));
 advance(dt=>{flock.step(dt,terrain);assert.notEqual(flock.ducks.length,1);},4);assert.equal(flock.ducks.length,0);
 const blocked=new DuckFlock();blocked.nextArrival=0;blocked.step(1/60,terrain,null,()=>false);assert.equal(blocked.ducks.length,0,'no partial pair when blocked');
});
test('ducks swim, walk ashore without hops, stay near companions, and drive actual waves',()=>{
 const terrain=pool(),flock=new DuckFlock(),contacts=new BirdWaterContacts(),wind=new WindField();wind.strength=0;const states=new Set();let peak=0,peakGap=0;
 advance(dt=>{flock.step(dt,terrain);contacts.step(dt,flock.ducks,p=>at(terrain,p));terrain.step(dt,wind);for(const d of flock.ducks){states.add(d.state);assert.ok(d.position.toArray().every(Number.isFinite));assert.ok(d.position.y<.3,'no hopping above the shore');peakGap=Math.max(peakGap,d.position.distanceTo(flock.ducks[0].position));}peak=Math.max(peak,...terrain.views[0].field.height.map(Math.abs));},75);
 assert.ok(states.has('swimming'));assert.ok(states.has('walking'));assert.ok(!states.has('hopping'));assert.ok(peak>.003,`wave amplitude ${peak}`);assert.ok(peakGap<3,`flock separation ${peakGap}`);
 assert.ok(contacts.impulses>100);flock.reset();contacts.reset();assert.equal(flock.ducks.length,0);assert.equal(contacts.contacts.size,0);
 advance(dt=>terrain.step(dt,wind),18);assert.ok(Math.max(...terrain.views[0].field.height.map(Math.abs))<.001);
});
test('ducks respect solid obstacles and pool removal removes the whole group',()=>{
 const terrain=pool(),flock=new DuckFlock(),clear=p=>p.x<.2;
 advance(dt=>{flock.step(dt,terrain,null,clear);assert.ok(flock.ducks.every(d=>d.position.x<.2));},35);assert.ok(flock.ducks.length>=2);
 terrain.rebuild(new HoleLayout([]));flock.step(1/60,terrain);assert.ok(flock.ducks.every(d=>d.state==='departing'));advance(dt=>flock.step(dt,terrain),4);assert.equal(flock.ducks.length,0);
});
test('bird contact creates landing, moving and takeoff waves while flying overhead has no effect',()=>{
 const field=new WaveField(41,2);field.energy=0;const water=p=>Math.abs(p.x)<1&&Math.abs(p.z)<1?{field,y:0,uv:q=>({u:q.x/2+.5,v:q.z/2+.5})}:null;
 const contacts=new BirdWaterContacts(),bird={id:1,scale:1,opacity:1,position:new THREE.Vector3(0,1,0)};
 contacts.step(1/60,[bird],water);assert.ok(field.velocity.every(v=>v===0));bird.position.y=.08;contacts.step(1/60,[bird],water);assert.ok(field.velocity.some(v=>v!==0));field.reset();
 advance(dt=>{bird.position.x+=dt*.2;contacts.step(dt,[bird],water);field.step(dt);},1);assert.ok(Math.max(...field.height.map(Math.abs))>.0001);
 field.reset();bird.position.y=1;contacts.step(1/60,[bird],water);assert.ok(field.velocity.some(v=>v!==0));field.reset();contacts.step(1/60,[bird],water);assert.ok(field.velocity.every(v=>v===0));
});
test('duck silhouettes have a broad bill, webbed feet and bounded low-poly geometry',()=>{
 const view=duckMesh();view.group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(view.group),size=bounds.getSize(new THREE.Vector3());let triangles=0;
 view.group.traverse(o=>{if(o.isMesh){assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 assert.ok(size.x>.65&&size.x<.9);assert.ok(size.z>.19);assert.equal(view.feet.length,2);assert.ok(triangles<350,`triangles ${triangles}`);
});

test('joined pool seams stay water and narrow or disconnected pockets cannot create a lone duck',()=>{
 const joined=pool([{id:1,x:-1,z:0,size:2},{id:2,x:1,z:0,size:2}]),flock=new DuckFlock();
 assert.ok(flock.shoreDistance(joined,joined.views[0],new THREE.Vector3(0,0,0))>.9,'shared edge is not a bank');
 const tiny=pool([{id:1,x:0,z:0,size:.5},{id:2,x:3,z:0,size:.5}]);flock.nextArrival=0;flock.step(1/60,tiny);assert.equal(flock.ducks.length,0);
});
