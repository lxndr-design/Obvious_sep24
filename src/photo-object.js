import * as THREE from 'three';

// Photo-to-object pipeline, pure logic only — every function here runs in
// node:test with synthetic pixel matrices. The browser glue (file input,
// canvases, textures) lives in photo-upload.js; the form builders consume
// contours, never images. Coordinates: images are sampled with y growing
// downward (canvas convention); contours are normalized to 0..1 with y up
// before they reach the geometry builders.

// A persisted photo may never smuggle in anything scriptable: only raster
// data URLs inside the budget survive sanitization.
export const PHOTO_BUDGET=65536;
const PHOTO_DATA_URL=/^data:image\/(?:png|jpeg|webp);base64,/;

// 64 KiB on the data-URL string itself — the bytes actually stored in spaces,
// the clipboard and localStorage.
export function photoDataUrlBudget(url,limit=PHOTO_BUDGET){return typeof url==='string'&&url.length<=limit;}

// Untrusted photo records (loaded spaces, pasted clipboards, the model API)
// sanitize to a safe shape or to null — they never throw, so a bad photo
// degrades to the paper card instead of failing the whole space.
export function sanitizePhotoRecord(photo,budget=PHOTO_BUDGET){
 if(!photo||typeof photo!=='object'||Array.isArray(photo))return null;
 const url=photoDataUrlBudget(photo.url,budget)&&PHOTO_DATA_URL.test(photo.url)?photo.url:null;
 const aspect=Number.isFinite(photo.aspect)&&photo.aspect>=.2&&photo.aspect<=5?photo.aspect:1.45;
 let contour=null;
 if(Array.isArray(photo.contour)&&photo.contour.length>=3&&photo.contour.every(point=>Array.isArray(point)&&point.length===2&&Number.isFinite(point[0])&&Number.isFinite(point[1])&&point[0]>=0&&point[0]<=1&&point[1]>=0&&point[1]<=1))contour=photo.contour;
 // 'cutout' without a usable contour degrades to the card; unknown shapes too.
 return {url,shape:photo.shape==='cutout'&&contour?'cutout':'card',contour:photo.shape==='cutout'?contour:null,aspect};
}

// Dominant border color: quantize the 1 px frame into 4-bit-per-channel
// buckets and average the largest bucket. Uniform backgrounds win outright;
// busy borders still return the most common region, and isolation quality is
// judged downstream, not here.
export function estimateBackgroundColor(pixels,w,h){
 if(!w||!h)throw Error('A photo needs a non-empty pixel buffer.');
 const buckets=new Map();
 const visit=(x,y)=>{
  const i=(y*w+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2],key=(r>>4)<<8|(g>>4)<<4|(b>>4);
  let bucket=buckets.get(key);
  if(!bucket){bucket={count:0,r:0,g:0,b:0};buckets.set(key,bucket);}
  bucket.count++;bucket.r+=r;bucket.g+=g;bucket.b+=b;
 };
 for(let x=0;x<w;x++){visit(x,0);visit(x,h-1);}
 for(let y=1;y<h-1;y++){visit(0,y);visit(w-1,y);}
 let best=null;
 for(const bucket of buckets.values())if(!best||bucket.count>best.count)best=bucket;
 return {r:Math.round(best.r/best.count),g:Math.round(best.g/best.count),b:Math.round(best.b/best.count)};
}

// Flood fill from every border pixel still within `tolerance` of the
// background color; what the fill cannot reach is the subject. Returns a
// Uint8Array mask: 255 subject, 0 background. Connected-component fill, so a
// subject that happens to match the background color is only lost where it
// touches the frame — the failure mode the card fallback covers.
export function isolateSubject(pixels,w,h,{background,tolerance=48}={}){
 if(pixels.length<w*h*4)throw Error('Pixel buffer does not match the image size.');
 const bg=background??estimateBackgroundColor(pixels,w,h),tolerance2=tolerance*tolerance;
 const near=i=>{const dr=pixels[i]-bg.r,dg=pixels[i+1]-bg.g,db=pixels[i+2]-bg.b;return dr*dr+dg*dg+db*db<=tolerance2;};
 const mask=new Uint8Array(w*h).fill(255),queue=[];
 const push=(x,y)=>{
  const idx=y*w+x;
  if(mask[idx]&&near(idx*4)){mask[idx]=0;queue.push(idx);}
 };
 for(let x=0;x<w;x++){push(x,0);push(x,h-1);}
 for(let y=1;y<h-1;y++){push(0,y);push(w-1,y);}
 while(queue.length){
  const idx=queue.pop(),x=idx%w,y=(idx-x)/w;
  if(x>0)push(x-1,y);if(x<w-1)push(x+1,y);
  if(y>0)push(x,y-1);if(y<h-1)push(x,y+1);
 }
 return mask;
}

// Fraction of the frame claimed by the subject. Isolation is unsuitable when
// almost nothing survived (subject matched the background) or almost
// everything did (no real background to remove) — both degrade to the card.
export function isolationUsable(mask,w,h,{minFraction=.02,maxFraction=.985}={}){
 if(!mask||mask.length!==w*h)return false;
 let subject=0;
 for(let i=0;i<mask.length;i++)if(mask[i])subject++;
 const fraction=subject/mask.length;
 return fraction>=minFraction&&fraction<=maxFraction;
}

// Marching squares over the mask's 0.5 level set. Midpoint indices: 0 top,
// 1 right, 2 bottom, 3 left of each cell; segments are directed so the subject
// stays on the left of the walk. Each crossing midpoint belongs to exactly one
// incoming and one outgoing segment, so stitching is a walk; the longest loop
// is the outer contour (holes are ignored in v1).
const CELL_SEGMENTS={
 1:[[3,0]],2:[[0,1]],3:[[3,1]],4:[[1,2]],5:[[3,0],[1,2]],6:[[0,2]],7:[[3,2]],
 8:[[2,3]],9:[[2,0]],10:[[0,1],[2,3]],11:[[2,1]],12:[[1,3]],13:[[1,0]],14:[[0,3]],
};
export function traceContour(mask,w,h){
 if(mask.length!==w*h)throw Error('Mask does not match the image size.');
 const sample=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&mask[y*w+x]?1:0;
 const next=new Map(); // segment startKey → [endKey, fromPoint]
 const emit=(fromX,fromY,toX,toY)=>{
  const key=(x,y)=>`${Math.round(x*2)},${Math.round(y*2)}`;
  next.set(key(fromX,fromY),[key(toX,toY),[fromX,fromY]]);
 };
 for(let y=-1;y<h;y++)for(let x=-1;x<w;x++){
  const corners=sample(x,y)|sample(x+1,y)<<1|sample(x+1,y+1)<<2|sample(x,y+1)<<3;
  for(const [from,to] of CELL_SEGMENTS[corners]??[]){
   const points=[[x+.5,y],[x+1,y+.5],[x+.5,y+1],[x,y+.5]];
   emit(...points[from],...points[to]);
  }
 }
 // Walk every unused segment until the loop closes; keep the longest ring.
 let best=null;
 for(const start of [...next.keys()]){
  if(!next.has(start))continue;
  const loop=[];let key=start;
  while(next.has(key)){
   const [end,fromPoint]=next.get(key);
   next.delete(key);loop.push(fromPoint);key=end;
   if(key===start)break;
  }
  if(loop.length>=4&&(!best||loop.length>best.length))best=loop;
 }
 return best??[];
}

// Douglas–Peucker on a closed ring: split at the vertex farthest from vertex
// 0, simplify the two open halves, stitch. Strict `>` keeps the first farthest
// vertex on ties, so runs are deterministic.
function perpendicularDistance([px,py],[ax,ay],[bx,by]){
 const dx=bx-ax,dy=by-ay,length2=dx*dx+dy*dy;
 if(length2===0)return Math.hypot(px-ax,py-ay);
 let t=((px-ax)*dx+(py-ay)*dy)/length2;
 t=Math.max(0,Math.min(1,t));
 return Math.hypot(px-ax-t*dx,py-ay-t*dy);
}
function simplifyOpen(points,epsilon){
 if(points.length<3)return points.slice();
 const keep=new Uint8Array(points.length);
 keep[0]=keep[points.length-1]=1;
 const stack=[[0,points.length-1]];
 while(stack.length){
  const [i,j]=stack.pop();
  if(j<=i+1)continue;
  let maxDistance=-1,maxIndex=-1;
  for(let k=i+1;k<j;k++){
   const distance=perpendicularDistance(points[k],points[i],points[j]);
   if(distance>maxDistance){maxDistance=distance;maxIndex=k;}
  }
  if(maxDistance>epsilon){keep[maxIndex]=1;stack.push([i,maxIndex],[maxIndex,j]);}
 }
 return points.filter((_,index)=>keep[index]);
}
export function simplify(contour,epsilon=.012){
 if(!Array.isArray(contour)||contour.length<3)return [];
 const n=contour.length;
 let split=1,maxDistance=-1;
 for(let i=1;i<n;i++){
  const distance=Math.hypot(contour[i][0]-contour[0][0],contour[i][1]-contour[0][1]);
  if(distance>maxDistance){maxDistance=distance;split=i;}
 }
 const first=simplifyOpen(contour.slice(0,split+1),epsilon);
 const second=simplifyOpen([...contour.slice(split),contour[0]],epsilon);
 const result=[...first.slice(0,-1),...second.slice(0,-1)];
 return result.length>=3?result:contour.slice();
}

// Pixel-space contour → normalized 0..1 with y up (the geometry convention).
// x and y divide by different dims; buildPhotoForm restores proportions via
// the photo's aspect.
export function normalizeContour(contour,w,h){
 if(!w||!h||!Array.isArray(contour)||contour.length<3)return null;
 return contour.map(([x,y])=>[x/w,1-y/h]);
}

// Upload-path helper: cap geometry/collider complexity by doubling the
// simplification epsilon until the ring fits. Deterministic.
export function simplifyForForm(contour,{epsilon=.012,maxPoints=90}={}){
 let simplified=simplify(contour,epsilon),factor=epsilon;
 while(simplified.length>maxPoints&&factor<1){factor*=2;simplified=simplify(contour,factor);}
 return simplified;
}

// The cutout: the silhouette extruded with the photo mapped on front and back
// (planes attached by the upload shim), one convex hull collider from the
// extrusion's own vertices so the collision shape matches the drawn piece.
// Contours arrive in image-normalized coordinates, so `aspect` (photo width /
// height) restores true proportions before `height` bounds the longest planar
// dimension — the household convention.
export function buildPhotoForm(contour,R,{height=2.1,aspect=1,depthRatio=.12,bevel=.012}={}){
 if(!Array.isArray(contour)||contour.length<3)throw Error('A photo silhouette needs at least three points.');
 const planar=contour.map(([x,y])=>[x*aspect,y]);
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(const [x,y] of planar){
  if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
 }
 const w=Math.max(maxX-minX,1e-6),h=Math.max(maxY-minY,1e-6),scale=height/Math.max(w,h),depth=depthRatio*h*scale;
 // Center on the origin (household convention): placement lifts by height/2.
 const points=planar.map(([x,y])=>new THREE.Vector2((x-minX)*scale-w*scale/2,(y-minY)*scale-h*scale/2));
 const geometry=new THREE.ExtrudeGeometry(new THREE.Shape(points),{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,curveSegments:1});
 geometry.translate(0,0,-depth/2);
 geometry.computeBoundingBox();
 // Recentre fully (the household convention) — the bevel's outward expansion
 // is not symmetric, and placement lifts by height/2.
 const center=new THREE.Vector3();
 geometry.boundingBox.getCenter(center);
 geometry.translate(-center.x,-center.y,-center.z);
 geometry.computeBoundingBox();
 const parts=[{shape:new R.ConvexPolyhedron(new Float32Array(geometry.attributes.position.array)),offset:new THREE.Vector3()}];
 return {geometry,parts,height:geometry.boundingBox.max.y-geometry.boundingBox.min.y};
}

// The fallback: a paper card carrying the photo, or plain paper when no
// usable photo URL survived. Still an honest placeable object.
export function buildCardForm(aspect=1.45,R,{height=2.1,thickness=.06}={}){
 const w=Math.min(Math.max(height*aspect,.5),2.4);
 const geometry=new THREE.BoxGeometry(w,height,thickness);
 geometry.computeBoundingBox();
 return {geometry,parts:[{shape:new R.Cuboid(w/2,height/2,thickness/2),offset:new THREE.Vector3()}],height};
}

// makeForm adapter for type 'photo-object'. Records loaded from spaces or the
// clipboard are sanitized first; an unusable cutout degrades to the card, and
// a missing photo degrades to plain paper — the pipeline never dead-ends.
export function makePhotoForm(R,photo){
 const record=sanitizePhotoRecord(photo);
 if(record?.shape==='cutout'){
  try{return {...buildPhotoForm(record.contour,R,{aspect:record.aspect}),photo:record};}
  catch{/* fall through to the card */}
 }
 return {...buildCardForm(record?record.aspect:1.45,R),photo:record};
}
