import * as THREE from 'three';
import {estimateBackgroundColor,isolateSubject,isolationUsable,traceContour,normalizeContour,simplifyForForm,photoDataUrlBudget} from './photo-object.js';

// Browser glue for photo-to-object: file decode, canvas work, textures. All
// image math lives in photo-object.js where node:test can reach it — nothing
// here talks to the network; the photo stays on the user's device.

const WORKING_SIZE=256,ALPHA_SIZE=128,BUDGET_RUNGS=[[1,.8],[1,.6],[1,.45],[.8,.5],[.6,.5],[.45,.45]];

// Downscale to a working canvas — the pipeline never touches more than 256 px
// per side, which bounds both the compute and the stored data URL.
function workingCanvas(bitmap){
 const scale=Math.min(1,WORKING_SIZE/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));
 canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const context=canvas.getContext('2d',{willReadFrequently:true});
 context.drawImage(bitmap,0,0,canvas.width,canvas.height);
 bitmap.close?.();
 return {canvas,context};
}

// JPEG quality ladder from good to tiny; null when even the smallest rung
// exceeds the budget, which the object then treats as "no photo" (paper card).
function budgetedDataUrl(canvas){
 for(const [scale,quality] of BUDGET_RUNGS){
  const source=scale===1?canvas:scaledCanvas(canvas,scale),url=source.toDataURL('image/jpeg',quality);
  if(photoDataUrlBudget(url))return url;
 }
 return null;
}
function scaledCanvas(canvas,scale){
 const out=document.createElement('canvas');
 out.width=Math.max(1,Math.round(canvas.width*scale));
 out.height=Math.max(1,Math.round(canvas.height*scale));
 out.getContext('2d').drawImage(canvas,0,0,out.width,out.height);
 return out;
}

// The cutout's alpha: the stored contour rasterized onto the form's bounding
// box, blurred a fraction of a pixel for a soft edge. Rasterizing the contour
// (not the raw mask) keeps the alpha exactly aligned with the extruded
// geometry on both the upload and reload paths.
function silhouetteCanvas(contour){
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(const [x,y] of contour){
  if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
 }
 const w=Math.max(maxX-minX,1e-6),h=Math.max(maxY-minY,1e-6),canvas=document.createElement('canvas');
 canvas.width=ALPHA_SIZE;canvas.height=ALPHA_SIZE;
 const c=canvas.getContext('2d');
 c.fillStyle='#000';c.fillRect(0,0,ALPHA_SIZE,ALPHA_SIZE);
 c.filter='blur(.75px)';
 c.fillStyle='#fff';
 c.beginPath();
 contour.forEach(([x,y],i)=>{const px=(x-minX)/w*ALPHA_SIZE,py=(1-(y-minY)/h)*ALPHA_SIZE;i?c.lineTo(px,py):c.moveTo(px,py);});
 c.closePath();c.fill();c.filter='none';
 return canvas;
}

// The upload pipeline the toolbar button invokes: decode → isolate → trace →
// place, through the same addObject path every form uses. Returns the object
// or null (unreadable file, no clear space, scene full); the notice reports
// the outcome either way — the flow never dead-ends.
export async function handlePhotoFile(file,R,add,notify){
 if(!file)return null;
 notify?.('Reading the photo…');
 let bitmap;
 try{bitmap=await createImageBitmap(file);}
 catch{notify?.('That file could not be read as an image.');return null;}
 const {canvas,context}=workingCanvas(bitmap),w=canvas.width,h=canvas.height,pixels=context.getImageData(0,0,w,h).data;
 const background=estimateBackgroundColor(pixels,w,h);
 const mask=isolateSubject(pixels,w,h,{background});
 const usable=isolationUsable(mask,w,h)?normalizeContour(traceContour(mask,w,h),w,h):null;
 const contour=usable?simplifyForForm(usable):null;
 const shape=contour&&contour.length>=3?'cutout':'card';
 const photo={url:budgetedDataUrl(canvas),shape,contour:shape==='cutout'?contour:null,aspect:w/h};
 const object=add('photo-object',null,false,5,null,0,null,{photo});
 if(!object){notify?.('No clear space near the view for a photo object.');return null;}
 notify?.(shape==='cutout'?'Placed your photo, cut out as a placeable object.':'The subject was hard to isolate, so the photo landed as a paper card.');
 return object;
}

// Texture planes on front and back — the decorateBoard pattern: one shared
// material, faces raycast-exempt, everything tracked for disposal. The photo
// texture attaches asynchronously; until it lands (or when there is none) the
// faces read as paper, so the object never looks broken.
export function decoratePhoto(o){
 if(o.type!=='photo-object'||o.photoVisual)return;
 const b=o.geometry.boundingBox,w=b.max.x-b.min.x,h=b.max.y-b.min.y,d=b.max.z-b.min.z;
 const geometry=new THREE.PlaneGeometry(w*.998,h*.998),material=new THREE.MeshBasicMaterial({color:'#f6f5ed'});
 if(o.photo?.shape==='cutout'&&o.photo.contour){
  const alpha=new THREE.CanvasTexture(silhouetteCanvas(o.photo.contour));
  material.alphaMap=alpha;material.alphaTest=.4;material.needsUpdate=true;
 }
 const faces=[];
 for(const side of [-1,1]){
  const face=new THREE.Mesh(geometry,material);
  face.position.z=side*(d/2+.002);
  if(side<0)face.rotation.y=Math.PI;
  face.raycast=()=>{};
  o.mesh.add(face);faces.push(face);
 }
 o.photoVisual={texture:null,alphaTexture:material.alphaMap,material,geometry,faces};
 if(o.photo?.url)attachPhotoTexture(o);
}

// Maps the photo onto the faces — sRGB CanvasTexture, the board texture path.
async function attachPhotoTexture(o){
 const visual=o.photoVisual,url=o.photo?.url;
 if(!visual||!url)return;
 try{
  const image=new Image();
  image.src=url;
  await image.decode();
  const canvas=document.createElement('canvas');
  canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  canvas.getContext('2d').drawImage(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  if(o.photoVisual!==visual)return; // disposed or replaced while decoding
  visual.texture?.dispose();
  visual.texture=texture;
  visual.material.map=texture;
  visual.material.color.set(0xffffff);
  visual.material.needsUpdate=true;
 }catch{/* an undecodable photo keeps the paper-card look */}
}

export function disposePhoto(o){
 if(!o.photoVisual)return;
 const v=o.photoVisual;
 for(const face of v.faces)face.removeFromParent();
 v.texture?.dispose();v.alphaTexture?.dispose();v.material.dispose();v.geometry.dispose();
 o.photoVisual=null;
}
