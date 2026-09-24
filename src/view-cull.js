import * as THREE from 'three';

// Project a world-space bounds through the camera. Returns the screen rect in
// normalized device coordinates (-1..1), the near/farthest NDC depth of the
// eight corners, and the same range in world units along the view axis
// (nearWorld = closest corner's distance from the camera); depth grows with
// distance from the camera.
export function projectBoundsToView(bounds,camera){
 const v=new THREE.Vector3();
 let minX=1/0,maxX=-1/0,minY=1/0,maxY=-1/0,minDepth=1/0,maxDepth=-1/0,nearWorld=1/0,farWorld=-1/0;
 for(let i=0;i<8;i++){
  v.set(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z).applyMatrix4(camera.matrixWorldInverse);
  const viewZ=v.z; // negative in front of the camera; distance grows as viewZ shrinks
  nearWorld=Math.min(nearWorld,-viewZ);farWorld=Math.max(farWorld,-viewZ);
  v.applyMatrix4(camera.projectionMatrix);
  minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);
  minDepth=Math.min(minDepth,v.z);maxDepth=Math.max(maxDepth,v.z);
 }
 return {minX,maxX,minY,maxY,minDepth,maxDepth,nearWorld,farWorld};
}

// True while at least one object's bounds reaches the viewport. Under an
// orthographic projection the NDC rect plus depth range decide this — no
// viewport size is needed, the frustum is already baked into the projection
// matrix, and bounds beyond either side of the near/far range are not
// viewable however centered they appear in X/Y.
export function anyOnScreen(objects,camera){
 // Refresh the camera's world matrices like the renderer does each frame —
 // callers may run before the first render of a moved camera.
 camera.updateMatrixWorld();
 for(const object of objects){
  const p=projectBoundsToView(new THREE.Box3().setFromObject(object),camera);
  if(p.minX<=1&&p.maxX>=-1&&p.minY<=1&&p.maxY>=-1&&p.minDepth<=1&&p.maxDepth>=-1)return true;
 }
 return false;
}

// Conservative occlusion for the orthographic camera. An object hides only
// when some occluder's screen rect contains the candidate's rect with a few
// pixels of clearance AND the occluder's front face sits in front of the
// candidate's nearest point by a depth margin in world units — the face is a
// guaranteed real surface, so a depth straddle can never pop. Bounds fully
// outside the frustum are not viewable. Anything uncertain renders.
export function computeVisibility(objects,camera,occluders,margin={depth:.15,screenPx:4},viewport={width:1920,height:1080}){
 const projected=new Map();
 for(const {id,bounds} of [...objects,...occluders])if(!projected.has(id))projected.set(id,projectBoundsToView(bounds,camera));
 const padX=2*margin.screenPx/viewport.width,padY=2*margin.screenPx/viewport.height,result=new Map();
 for(const {id} of objects){
  const p=projected.get(id);
  if(p.minX>1||p.maxX<-1||p.minY>1||p.maxY<-1||p.minDepth>1||p.maxDepth<-1){result.set(id,false);continue;}
  let visible=true;
  for(const occluder of occluders){
   if(occluder.id===id)continue;
   const q=projected.get(occluder.id);
   // An occluder reaching past the near or far plane is never a full cover —
   // excluding it only ever renders more, which keeps the rule conservative.
   if(q.minDepth<-1||q.maxDepth>1)continue;
   if(q.nearWorld+margin.depth<p.nearWorld&&q.minX<=p.minX-padX&&q.maxX>=p.maxX+padX&&q.minY<=p.minY-padY&&q.maxY>=p.maxY+padY){visible=false;break;}
  }
  result.set(id,visible);
 }
 return result;
}

// Applies computeVisibility to scene meshes at most every `interval` seconds.
// Any camera or mesh motion reveals everything first — a hide computed for an
// older view must never outlive it — so culling settles only when the scene
// does: the camera-move-end throttle the render spec asks for. Callers pass
// the meshes they want kept visible (selection, drags, popups) as `keep`; the
// cull never touches physics, only `mesh.visible`.
export class ViewCull{
 constructor({depth=.15,screenPx=4,interval=.1,now=()=>performance.now()/1000}={}){
  this.margin={depth,screenPx};this.interval=interval;this.now=now;this.enabled=true;
  this.lastRun=-1/0;this.cameraMatrix=new THREE.Matrix4();this.objectMatrices=new Map();this.hidden=new Set();this.pending=false;
 }
 get hiddenCount(){return this.hidden.size;}
 reveal(){for(const mesh of this.hidden)mesh.visible=true;this.hidden.clear();}
 tick(entries,camera,viewport,keep=new Set()){
  if(!this.enabled){if(this.hidden.size)this.reveal();return;}
  camera.updateMatrixWorld();
  const view=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  let stale=!view.equals(this.cameraMatrix);
  this.cameraMatrix.copy(view);
  if(!stale)for(const {id,mesh} of entries){
   mesh.updateWorldMatrix(false,false);
   const previous=this.objectMatrices.get(id);
   if(!previous||!previous.equals(mesh.matrixWorld)){stale=true;break;}
  }
  // Kept meshes are never hidden: a selection or drag starting on a culled
  // mesh reveals the scene and forces a recompute even if nothing moved.
  if(!stale)for(const {id,mesh} of entries)if(keep.has(id)&&this.hidden.has(mesh)){stale=true;break;}
  if(stale){this.reveal();this.pending=true;}
  const time=this.now();
  if(!this.pending||time-this.lastRun<this.interval)return;
  this.pending=false;this.lastRun=time;
  const candidates=[],occluders=[],byId=new Map();
  for(const {id,mesh} of entries){
   const bounds=new THREE.Box3().setFromObject(mesh);
   occluders.push({id,bounds});byId.set(id,mesh);
   if(!keep.has(id))candidates.push({id,bounds});
  }
  const visibility=computeVisibility(candidates,camera,occluders,this.margin,viewport);
  this.objectMatrices.clear();
  for(const {id,mesh} of entries)this.objectMatrices.set(id,mesh.matrixWorld.clone());
  for(const [id,visible] of visibility)if(visible===false){const mesh=byId.get(id);mesh.visible=false;this.hidden.add(mesh);}
 }
}
