// Pointer capture is an optimization, not the lifetime of an object drag.
// Window listeners retain ownership when capture is temporarily lost or the
// pointer crosses an overlay; only its release/cancel may finish that drag.
export function bindDragPointer(root,canvas,{getDrag,move,end,cancel}){
 const owns=e=>getDrag()?.id===e.pointerId;
 const onMove=e=>{
  if(!owns(e))return;
  // A release outside the browser can be missed; don't resurrect it on re-entry.
  if(e.pointerType==='mouse'&&e.buttons===0){end(e);return;}
  move(e);
 };
 const onUp=e=>{if(!owns(e))return;move(e);end(e);};
 const onCancel=e=>{if(owns(e))cancel();};
 const onLost=e=>{
  if(!owns(e)||canvas.hasPointerCapture(e.pointerId))return;
  try{canvas.setPointerCapture(e.pointerId);}catch{/* Release may already be queued; window pointerup still owns completion. */}
 };
 root.addEventListener('pointermove',onMove,{capture:true});
 root.addEventListener('pointerup',onUp,{capture:true});
 root.addEventListener('pointercancel',onCancel,{capture:true});
 canvas.addEventListener('lostpointercapture',onLost);
 return ()=>{root.removeEventListener('pointermove',onMove,{capture:true});root.removeEventListener('pointerup',onUp,{capture:true});root.removeEventListener('pointercancel',onCancel,{capture:true});canvas.removeEventListener('lostpointercapture',onLost);};
}
