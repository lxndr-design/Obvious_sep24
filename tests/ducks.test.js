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
test('ducks glide and walk with shoreline transition hops, stay near companions, and drive actual waves',()=>{
 const terrain=pool(),flock=new DuckFlock(),contacts=new BirdWaterContacts(),wind=new WindField();wind.strength=0;const states=new Set();let peak=0,peakGap=0;
 advance(dt=>{flock.step(dt,terrain);contacts.step(dt,flock.ducks,p=>at(terrain,p));terrain.step(dt,wind);for(const d of flock.ducks){states.add(d.state);assert.ok(d.position.toArray().every(Number.isFinite));if(d.medium!=='air'){assert.ok(d.position.y<.5,'shoreline hop remains small');if(flock.ducks[0].medium!=='air')peakGap=Math.max(peakGap,d.position.distanceTo(flock.ducks[0].position));}}peak=Math.max(peak,...terrain.views[0].field.height.map(Math.abs));},120);
 assert.ok(states.has('swimming'));assert.ok(states.has('walking'));assert.ok(states.has('leaving-water'));assert.ok(states.has('entering-water'));assert.ok(states.has('dabbling'));assert.ok(!states.has('hopping'));assert.ok(peak>.003,`wave amplitude ${peak}`);assert.ok(peakGap<3,`flock separation ${peakGap}`);
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

test('shore hops have an airborne arc and ordinary movement holds a habitat for long stretches',()=>{
 const terrain=pool(),f=new DuckFlock();f.limit=2;const changes=[],hops=new Set();let previous=null,peakLift=0;
 advance(dt=>{f.step(dt,terrain);const d=f.ducks[0];if(!d)return;if(d.hop){hops.add(d.state);peakLift=Math.max(peakLift,d.position.y-Math.max(d.hop.from.y,d.hop.to.y));}if(d.medium!==previous){if(previous!==null)changes.push(f.time);previous=d.medium;}},190);
 assert.ok(hops.has('entering-water')&&hops.has('leaving-water'));assert.ok(peakLift>.06);assert.ok(changes.length>=2&&changes.length<=6,`habitat changes ${changes}`);
 for(let i=1;i<changes.length;i++)assert.ok(changes[i]-changes[i-1]>20,'no rapid shoreline ping-pong');
});
test('dabbling tips the head forward ninety degrees for several seconds, pauses travel, then restores swimming',()=>{
 const terrain=pool(),f=new DuckFlock();f.nextArrival=0;f.step(1/60,terrain);const d=f.ducks[0];d.position.set(0,-.09,0);d.state='swimming';d.medium='water';d.swimming=true;d.opacity=1;d.dabbleAt=0;f.nextMove=Infinity;
 const start=d.position.clone();let peak=0,states=new Set();advance(dt=>{f.step(dt,terrain);peak=Math.max(peak,Math.abs(d.dabbleAngle));states.add(d.state);if(d.state==='dabbling')assert.ok(Math.hypot(d.position.x-start.x,d.position.z-start.z)<1e-8);},3);
 assert.equal(d.state,'dabbling');assert.equal(d.dabbleAngle,-Math.PI/2,'holds the fully tipped pose for at least three seconds');
 advance(dt=>f.step(dt,terrain),3);
 assert.ok(states.has('dabbling'));assert.ok(Math.abs(peak-Math.PI/2)<1e-8);assert.equal(d.dabbleAngle,0);assert.equal(d.state,'swimming');
 const view=duckMesh();view.group.position.set(0,-.09,0);view.group.rotation.z=-Math.PI/2;view.group.updateMatrixWorld(true);const bill=new THREE.Vector3(.34,.205,0).applyMatrix4(view.group.matrixWorld);assert.ok(bill.y<-.19,'bill is submerged, not tipped backward');
});
test('a stationary dabbling duck pushes water around its head',()=>{
 const field=new WaveField(41,2);field.energy=0;const contacts=new BirdWaterContacts(),water=()=>({field,y:0,uv:p=>({u:p.x/2+.5,v:p.z/2+.5})});const d={id:1,species:'duck',scale:1,opacity:1,position:new THREE.Vector3(0,.1,0),yaw:0,dabbleAngle:0};
 contacts.step(1/60,[d],water);field.reset();d.dabbleAngle=-.3;contacts.step(1/60,[d],water);assert.ok(field.velocity.some(v=>v!==0));
});

test('waterfowl varieties have distinct colors and low-poly markings and mix within a flock',async()=>{
 const {DUCK_VARIANTS}=await import('../src/ducks.js');const signatures=new Set();
 for(const type of Object.keys(DUCK_VARIANTS)){
  const view=duckMesh(type);let triangles=0;
  view.group.traverse(o=>{if(o.isMesh){assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  assert.equal(view.wings.length,2);assert.ok(triangles<450,`${type}: ${triangles} triangles`);signatures.add(view.materials.map(m=>m.color.getHexString()).join(','));
  view.group.traverse(o=>o.geometry?.dispose());view.materials.forEach(m=>m.dispose());
 }
 assert.equal(signatures.size,5);
 const f=new DuckFlock(),terrain=pool();f.nextArrival=0;f.step(1/60,terrain);f.nextArrival=0;f.step(1/60,terrain);f.nextArrival=0;f.step(1/60,terrain);
 assert.equal(f.ducks.length,4);assert.equal(new Set(f.ducks.map(d=>d.variant)).size,4);assert.ok(f.read().every(d=>d.variantName));
});

test('ducks fly down into a pool, then take off away from the pointer before fading out',()=>{
 const terrain=pool(),f=new DuckFlock();f.nextArrival=0;f.limit=2;f.step(1/60,terrain);f.nextArrival=Infinity;
 const d=f.ducks[0],start=d.position.clone(),landing=d.flightTo.clone();assert.equal(d.medium,'air');assert.equal(d.opacity,0);assert.ok(start.y>landing.y+3);
 advance(dt=>f.step(dt,terrain),1);assert.ok(d.position.y<start.y-.5&&d.position.y>landing.y+1);assert.ok(d.opacity>.4&&d.opacity<1);assert.ok(d.position.distanceTo(landing)<start.distanceTo(landing));
 advance(dt=>f.step(dt,terrain),2.05);assert.equal(d.state,'swimming');assert.equal(d.medium,'water');assert.equal(d.opacity,1);assert.ok(d.position.y<.2);
 d.state='dabbling';d.dabbleAngle=-Math.PI/2;d.hop={};const before=d.position.clone(),threat=before.clone().add(new THREE.Vector3(.5,0,0));
 f.step(1/60,terrain,threat);assert.ok(f.ducks.every(duck=>duck.state==='departing'));assert.equal(d.hop,null);assert.equal(d.dabbleAngle,0);
 const destination=d.flightTo.clone();advance(dt=>f.step(dt,terrain,threat),.7);
 assert.ok(d.position.y>before.y+1);assert.ok(d.position.x<before.x);assert.ok(d.opacity>.9,'visible while taking off');assert.ok(d.flightTo.distanceTo(destination)<1e-9,'pointer does not restart the escape');
 advance(dt=>f.step(dt,terrain),1.4);assert.ok(d.opacity<.4&&d.position.y>before.y+3);advance(dt=>f.step(dt,terrain),1);assert.equal(f.ducks.length,0);
});
test('pool removal during arrival redirects the flock into an escape without snapping to the ground',()=>{
 const terrain=pool(),f=new DuckFlock();f.nextArrival=0;f.step(1/60,terrain);advance(dt=>f.step(dt,terrain),1);
 const before=f.ducks.map(d=>d.position.clone());terrain.rebuild(new HoleLayout([]));f.step(1/60,terrain);
 f.ducks.forEach((d,i)=>{assert.equal(d.state,'departing');assert.ok(d.position.distanceTo(before[i])<.1);});advance(dt=>f.step(dt,terrain),3.1);assert.equal(f.ducks.length,0);
});
