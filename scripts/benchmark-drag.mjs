import {performance} from 'node:perf_hooks';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {makeForm} from '../src/shapes.js';
import {CollisionScene} from '../src/collision.js';
import {StackScene} from '../src/stacking.js';
await R.init();
const fixtures=[['box',-3,2],['box',-4.5,.5],['sphere',-1,3.5],['cylinder',-4,-3],['arch',-1,-1],['pebble',3.5,3.5],['plant-rubber-medium',-5.5,2.5],['table-round-half',-3,4.5],['bench',-4,-5],['birdbath',6.5,0]];
const scene=new CollisionScene(R),placement=new StackScene(scene);let contacts=0,casts=0;
for(const [type,x,z] of fixtures){const f=makeForm(type,R),mesh=new THREE.Mesh(f.geometry);mesh.position.set(x,f.height/2,z);scene.objects.push({...f,mesh,type});}
for(const o of scene.objects)for(const {shape}of o.parts){for(const name of ['contactShape','castShape']){const fn=shape[name];shape[name]=function(...args){if(name==='contactShape')contacts++;else casts++;return fn.apply(this,args);};}}
const bath=scene.objects.at(-1),origin=bath.mesh.position.clone();
function run(name,target){const times=[];contacts=casts=0;for(let i=0;i<120;i++){bath.mesh.position.copy(origin);const start=performance.now();placement.move(bath,target(i));times.push(performance.now()-start);}times.sort((a,b)=>a-b);console.log(JSON.stringify({name,meanMs:+(times.reduce((a,b)=>a+b,0)/times.length).toFixed(3),p95Ms:+times[114].toFixed(3),contactsPerMove:Math.round(contacts/120),castsPerMove:Math.round(casts/120)}));}
for(let i=0;i<5;i++)placement.move(bath,new THREE.Vector3(7,bath.height/2,0));
run('birdbath over clear ground',()=>new THREE.Vector3(7.5,bath.height/2,.5));
run('birdbath toward a nearby obstacle',()=>new THREE.Vector3(3,bath.height/2,3.5));
run('same snapped cell',()=>origin.clone());
