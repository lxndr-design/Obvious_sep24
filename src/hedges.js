import {scaleForm} from './form-scale.js';
import * as THREE from 'three';
import {hedgeUVs} from './hedge-surface.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {makeBirdbath,BATH} from './bath-shapes.js';
import {stackingProfile} from './stacking.js';

export const HEDGE_TILE=1;
export const HEDGE_HEIGHT=.65;
// A clipped, low-poly crown. Only exposed edges taper; shared edges meet flush.
export function makeHedge(R,joins=0){
 const left=joins&1,right=joins&2,back=joins&4,front=joins&8;
 const x0=left?-.5:-.36,x1=right?.5:.36,z0=back?-.5:-.36,z1=front?.5:.36;
 const points=[];
 for(const [y,inset] of [[-.325,0],[.255,0],[.325,.065]]){
  const a=x0+(left?0:inset),b=x1-(right?0:inset),c=z0+(back?0:inset),d=z1-(front?0:inset);
  const corner=(x,z,dx,dz,clipped)=>{if(clipped){points.push(new THREE.Vector3(x+dx*.055,y,z),new THREE.Vector3(x,y,z+dz*.055));}else points.push(new THREE.Vector3(x,y,z));};
  corner(a,c,1,1,!left&&!back);corner(b,c,-1,1,!right&&!back);
  corner(b,d,-1,-1,!right&&!front);corner(a,d,1,-1,!left&&!front);
 }
 const geometry=hedgeUVs(new ConvexGeometry(points));geometry.computeBoundingBox();
 const positions=geometry.clone();positions.deleteAttribute('normal');positions.deleteAttribute('uv');const hull=mergeVertices(positions,1e-6);
 const parts=[{shape:new R.ConvexPolyhedron(new Float32Array(hull.attributes.position.array),new Uint32Array(hull.index.array)),offset:new THREE.Vector3()}];positions.dispose();hull.dispose();
 // An interior cuboid makes fully coincident hull contacts unambiguous to GJK.
 parts.push({shape:new R.Cuboid(.24,.29,.24),offset:new THREE.Vector3()});
 const form={geometry,parts,height:HEDGE_HEIGHT};return {...form,stacking:stackingProfile('hedge',form),hedgeJoins:joins};
}

export class HedgeScene {
 constructor(R,collision,pendulums,onChange=()=>{},type='hedge'){this.type=type;this.tile=type==='birdbath'?BATH.tile:HEDGE_TILE;this.key=type==='birdbath'?'bathJoins':'hedgeJoins';this.make=type==='birdbath'?makeBirdbath:makeHedge;this.R=R;this.collision=collision;this.pendulums=pendulums;this.onChange=onChange;}
 refresh(excluded=null){
  const hedges=this.collision.objects.filter(o=>o.type===this.type),changes=[];
  const active=o=>o!==excluded&&!o.hanging&&!o.support;
  for(const o of hedges){
   let joins=0;
   if(active(o))for(const other of hedges){
    if(other===o||!active(other)||Math.abs(o.mesh.position.y-other.mesh.position.y)>.001)continue;
    const scale=o.modelScale??1;if(Math.abs(scale-(other.modelScale??1))>.001)continue;const tile=this.tile*scale;
    const x=other.mesh.position.x-o.mesh.position.x,z=other.mesh.position.z-o.mesh.position.z;
    if(Math.abs(z)<.001){if(Math.abs(x+tile)<.001)joins|=1;if(Math.abs(x-tile)<.001)joins|=2;}
    if(Math.abs(x)<.001){if(Math.abs(z+tile)<.001)joins|=4;if(Math.abs(z-tile)<.001)joins|=8;}
   }
   if(joins===o[this.key])continue;
   const form=scaleForm(this.make(this.R,joins),this.R,o.modelScale??1),old={geometry:o.geometry,parts:o.parts,stacking:o.stacking,[this.key]:o[this.key]};
   Object.assign(o,form);o.mesh.geometry=form.geometry;if(o.debug)o.debug.geometry=form.geometry;
   this.collision.prepared.delete(o);changes.push({o,old,form});
  }
  // Growing a connection must not swallow another solid or a pool wall.
  if(changes.some(({o})=>!this.collision.canPlace(o,o.mesh.position))){
   for(const {o,old,form} of changes){Object.assign(o,old);o.mesh.geometry=old.geometry;if(o.debug)o.debug.geometry=old.geometry;this.collision.prepared.delete(o);form.geometry.dispose();}
   return false;
  }
  for(const {o,old} of changes){if(o.body)this.pendulums.rebuild(o);old.geometry.dispose();}
  if(changes.length)this.onChange();return true;
 }
}
