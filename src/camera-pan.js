import {Vector3} from 'three';
// Trackpads report two-finger scrolling as wheel deltas; pinch carries ctrlKey.
// Capture scroll before OrbitControls' wheel zoom while leaving pinch to it.
export function panCamera(camera,controls,dx,dy,width,height,mode=0){
 const unit=mode===1?16:mode===2?height:1;
 camera.updateMatrixWorld();
 const right=new Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new Vector3().setFromMatrixColumn(camera.matrixWorld,1);
 const offset=right.multiplyScalar(dx*unit*(camera.right-camera.left)/(camera.zoom*width)).addScaledVector(up,-dy*unit*(camera.top-camera.bottom)/(camera.zoom*height));
 camera.position.add(offset);controls.target.add(offset);
}
export function installTrackpadPan(canvas,camera,controls,blocked=()=>false){
 const wheel=event=>{
  if(!controls.enabled||blocked()){event.preventDefault();event.stopImmediatePropagation();return;}
  if(event.ctrlKey||event.metaKey)return;
  event.preventDefault();event.stopImmediatePropagation();
  panCamera(camera,controls,event.deltaX,event.deltaY,canvas.clientWidth,canvas.clientHeight,event.deltaMode);
 };
 canvas.addEventListener('wheel',wheel,{capture:true,passive:false});
 return ()=>canvas.removeEventListener('wheel',wheel,true);
}
