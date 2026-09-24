import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import {estimateBackgroundColor,isolateSubject,isolationUsable,traceContour,simplify,simplifyForForm,normalizeContour,buildPhotoForm,buildCardForm,makePhotoForm,PHOTO_BUDGET,photoDataUrlBudget,sanitizePhotoRecord} from '../src/photo-object.js';
import {makeForm,LABELS} from '../src/shapes.js';
import {CATALOG_TYPES} from '../src/catalog-layout.js';
import {CollisionScene} from '../src/collision.js';
await R.init();

// Synthetic pixel matrices: RGBA buffers with y growing downward, exactly what
// getImageData hands the browser shim. The standard fixture is a white 16×16
// frame with an 8×8 black square at (4..11, 4..11).
const W=16,H=16;
function frame(square,{squareColor=[20,20,20],background=[255,255,255],from=4,to=11}={}){
 const pixels=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const inside=square&&x>=from&&x<=to&&y>=from&&y<=to,color=inside?squareColor:background,i=(y*W+x)*4;
  pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=255;
 }
 return pixels;
}
const subjectPixels=mask=>mask.reduce((count,v)=>count+(v?1:0),0);
const chebyshev=(a,b)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]));
const CUTOUT_CONTOUR=[[0,0],[1,0],[1,1],[.5,.4],[0,1]]; // square with a notch the hull must cover
const CUTOUT_RECORD={url:'data:image/png;base64,AAA',shape:'cutout',contour:CUTOUT_CONTOUR,aspect:1.25};

test('background estimate reads the dominant border color',()=>{
 assert.deepEqual(estimateBackgroundColor(frame(true),W,H),{r:255,g:255,b:255});
 // A 12 px slate border on the left/top dominates a 4 px warm frame on the
 // right/bottom: the mode bucket, not the mean, must win.
 const mixed=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const slate=x<12||y<12,color=slate?[70,80,96]:[240,200,140],i=(y*W+x)*4;
  mixed[i]=color[0];mixed[i+1]=color[1];mixed[i+2]=color[2];mixed[i+3]=255;
 }
 assert.deepEqual(estimateBackgroundColor(mixed,W,H),{r:70,g:80,b:96});
});

test('flood fill isolates the subject and honors tolerance',()=>{
 const mask=isolateSubject(frame(true),W,H);
 assert.equal(subjectPixels(mask),64);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)assert.equal(mask[y*W+x],x>=4&&x<=11&&y>=4&&y<=11?255:0,`${x},${y}`);
 // A square within tolerance of the background belongs to the fill, not the subject.
 assert.equal(subjectPixels(isolateSubject(frame(true,{squareColor:[230,230,230]}),W,H,{tolerance:60})),0);
 // A tight tolerance keeps a mid-gray square as subject.
 assert.equal(subjectPixels(isolateSubject(frame(true,{squareColor:[180,180,180]}),W,H,{tolerance:30})),64);
});

test('isolation usability rejects empty and full-frame masks',()=>{
 const mask=isolateSubject(frame(true),W,H);
 assert.equal(isolationUsable(mask,W,H),true);
 assert.equal(isolationUsable(new Uint8Array(W*H).fill(255),W,H),false); // nothing removed
 assert.equal(isolationUsable(new Uint8Array(W*H),W,H),false); // nothing left
 assert.equal(isolationUsable(new Uint8Array(W*H+1),W,H),false); // size mismatch
});

test('marching squares returns one closed ring around the subject',()=>{
 const contour=traceContour(isolateSubject(frame(true),W,H),W,H);
 assert.ok(contour.length>=8,`contour too short: ${contour.length}`);
 for(let i=0;i<contour.length;i++){
  const step=chebyshev(contour[i],contour[(i+1)%contour.length]);
  assert.ok(step<=1.01,`non-adjacent step ${step} at ${i}`);
 }
 for(const [x,y] of contour){
  assert.ok(x>=3.4&&x<=11.6&&y>=3.4&&y<=11.6,`point ${x},${y} outside the square's boundary band`);
  assert.ok(x<=4.6||x>=10.4||y<=4.6||y>=10.4,`point ${x},${y} wandered inside the subject`);
 }
 // An all-background mask has no contour at all.
 assert.deepEqual(traceContour(new Uint8Array(W*H),W,H),[]);
});

test('simplification is deterministic, collapses straight runs and keeps the shape',()=>{
 const raw=traceContour(isolateSubject(frame(true),W,H),W,H);
 const once=simplify(raw),twice=simplify(raw);
 assert.deepEqual(once,twice);
 assert.ok(once.length>=3&&once.length<=8,`square simplified to ${once.length} points`);
 for(const [x,y] of once){
  assert.ok(x>=3.49&&x<=11.51&&y>=3.49&&y<=11.51,`vertex ${x},${y} left the original band`);
 }
 // A degenerate input degrades to no contour rather than throwing.
 assert.deepEqual(simplify([[0,0],[1,1]]),[]);
});

test('point budget forces coarser simplification deterministically',()=>{
 const raw=traceContour(isolateSubject(frame(true),W,H),W,H);
 const capped=simplifyForForm(raw,{maxPoints:8});
 assert.ok(capped.length<=8,`capped ring kept ${capped.length} points`);
 assert.deepEqual(capped,simplifyForForm(raw,{maxPoints:8}));
 assert.deepEqual(simplifyForForm(raw),simplify(raw));
});

test('contours normalize to 0..1 with y up',()=>{
 const contour=traceContour(isolateSubject(frame(true),W,H),W,H),normalized=normalizeContour(contour,W,H);
 const ys=normalized.map(([,y])=>y);
 for(const [x,y] of normalized)assert.ok(x>=0&&x<=1&&y>=0&&y<=1,`normalized point ${x},${y} out of range`);
 // The image-top edge (pixel y≈3.5) must land high after the flip.
 assert.ok(Math.max(...ys)>.7&&Math.min(...ys)<.3,`y range ${Math.min(...ys)}..${Math.max(...ys)} did not flip upward`);
 assert.equal(normalizeContour([[0,0]],W,H),null);
 assert.equal(normalizeContour(contour,0,H),null);
});

test('photo records sanitize to safe shapes and never throw',()=>{
 assert.deepEqual(sanitizePhotoRecord(CUTOUT_RECORD),CUTOUT_RECORD);
 // Scriptable or over-budget URLs drop to null; garbage returns null outright.
 assert.equal(sanitizePhotoRecord({...CUTOUT_RECORD,url:'data:text/html;base64,PHNjcmlwdD4='}).url,null);
 assert.equal(sanitizePhotoRecord({...CUTOUT_RECORD,url:'data:image/png;base64,'+'A'.repeat(70000)}).url,null);
 // A cutout without a usable ring, or with out-of-range points, degrades to the card.
 assert.equal(sanitizePhotoRecord({...CUTOUT_RECORD,contour:[[0,0],[2,0]]}).shape,'card');
 assert.equal(sanitizePhotoRecord({...CUTOUT_RECORD,contour:[[0,0],[1,0],[1,2]]}).shape,'card');
 assert.equal(sanitizePhotoRecord({...CUTOUT_RECORD,shape:'mystery'}).shape,'card');
 assert.equal(sanitizePhotoRecord('photo'),null);
 assert.equal(sanitizePhotoRecord(null),null);
});

test('the data-URL budget is 64 KiB on the stored string',()=>{
 assert.equal(PHOTO_BUDGET,65536);
 assert.equal(photoDataUrlBudget('x'.repeat(65536)),true);
 assert.equal(photoDataUrlBudget('x'.repeat(65537)),false);
 assert.equal(photoDataUrlBudget(undefined),false);
});

test('cutout forms extrude the silhouette with a matching convex collider',()=>{
 const form=buildPhotoForm(CUTOUT_CONTOUR,R,{aspect:1.5});
 assert.equal(form.parts.length,1);
 const hull=form.parts[0].shape;
 assert.ok(Number.isFinite(hull.vertices?.length)&&hull.vertices.length>=12,'hull has no vertices');
 assert.ok(form.height>1&&form.height<=2.11,`height ${form.height}`);
 const b=form.geometry.boundingBox;
 assert.ok((b.max.x-b.min.x)/(b.max.y-b.min.y)>1,`aspect ignored: ${b.max.x-b.min.x} × ${b.max.y-b.min.y}`);
 // The silhouette is centered on the origin so placement lifts by height/2.
 assert.ok(Math.abs((b.max.y+b.min.y)/2)<1e-6,'silhouette not y-centered');
 assert.throws(()=>buildPhotoForm([[0,0],[1,1]],R),/three points/);
});

test('card forms are thin boxes with one cuboid part',()=>{
 const form=buildCardForm(1.45,R);
 assert.equal(form.parts.length,1);
 assert.deepEqual({...form.parts[0].shape.halfExtents},{x:1.2,y:1.05,z:.03}); // 2.1×1.45 clamps to the 2.4 width cap
 assert.equal(form.height,2.1);
 const wide=buildCardForm(4,R); // aspect clamped so cards stay placeable
 assert.ok(wide.geometry.boundingBox.max.x-wide.geometry.boundingBox.min.x<=2.4+1e-6); // Float32 vertex rounding
});

test('makePhotoForm degrades unsuitable cutouts to the card without throwing',()=>{
 const cutout=makePhotoForm(R,CUTOUT_RECORD);
 assert.equal(cutout.photo.shape,'cutout');
 const card=makePhotoForm(R,{...CUTOUT_RECORD,contour:null});
 assert.equal(card.photo.shape,'card');
 assert.equal(card.geometry.type,'BoxGeometry');
 const plain=makePhotoForm(R,undefined);
 assert.equal(plain.photo,null); // no photo record at all → plain paper card
});

test('photo objects place through the shared collision and catalog paths',()=>{
 assert.equal(LABELS['photo-object'],'Photo');
 assert.ok(!CATALOG_TYPES.includes('photo-object'),'photo objects are user-created, never catalog templates');
 const form=makeForm('photo-object',R,{photo:CUTOUT_RECORD});
 assert.ok(form.parts.length>=1&&form.photo.shape==='cutout');
 const collision=new CollisionScene(R),subject={parts:form.parts,height:form.height,geometry:form.geometry,mesh:new THREE.Mesh(form.geometry)};
 // Open floor returns the mesh-center y (household convention).
 assert.ok(Math.abs(collision.supportY(subject,2,2)-form.height/2)<1e-9,`supportY ${collision.supportY(subject,2,2)}`);
 assert.equal(collision.canPlace(subject,new THREE.Vector3(2,form.height/2,2)),true);
 // No stacking heads: nothing may be stacked onto a photo cutout via profiles,
 // though resting a form on its top surface stays a legal placement.
 assert.deepEqual(form.stacking.heads,[]);
});

test('the photo pipeline makes no network calls',()=>{
 for(const file of ['photo-object.js','photo-upload.js']){
  const source=readFileSync(fileURLToPath(new URL(`../src/${file}`,import.meta.url)),'utf8');
  for(const pattern of ['fetch(','XMLHttpRequest','WebSocket','sendBeacon','importScripts']){
   assert.ok(!source.includes(pattern),`${file} references ${pattern}`);
  }
 }
});
