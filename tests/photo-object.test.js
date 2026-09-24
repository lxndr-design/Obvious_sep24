import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {estimateBackgroundColor,isolateSubject,isolationUsable,traceContour,simplify,featherMask,normalizeContour} from '../src/photo-object.js';

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

test('feathered alpha is a one-pixel soft edge on the binary mask',()=>{
 const mask=isolateSubject(frame(true),W,H),soft=featherMask(mask,W,H);
 assert.equal(soft[5*W+5],255); // deep interior stays fully opaque
 assert.equal(soft[0],0); // deep background stays clear
 const edge=soft[4*W+4]; // top-left corner of the subject: 4 of 9 samples inside
 assert.ok(edge>70&&edge<141,`corner edge alpha ${edge}`);
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

test('the photo pipeline makes no network calls',()=>{
 for(const file of ['photo-object.js']){
  const source=readFileSync(fileURLToPath(new URL(`../src/${file}`,import.meta.url)),'utf8');
  for(const pattern of ['fetch(','XMLHttpRequest','WebSocket','sendBeacon','importScripts']){
   assert.ok(!source.includes(pattern),`${file} references ${pattern}`);
  }
 }
});
