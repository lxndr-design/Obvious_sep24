// Update render and collision geometry as one transaction. Invalid edits keep
// the original object, ID, messages, attachments and placement intact.
export function replaceForm(object,form,type,collision){
 const keys=['geometry','parts','height','stacking','modelScale','gridSize','letter','board','sign','type'];
 const previous=Object.fromEntries(keys.map(key=>[key,object[key]])),position=object.mesh.position.clone();
 Object.assign(object,form,{type});collision.prepared.delete(object);
 if(!object.hanging&&!object.support)object.mesh.position.y=collision.supportY(object,position.x,position.z);
 if(!collision.canPlace(object,object.mesh.position)){
  Object.assign(object,previous);object.mesh.position.copy(position);collision.prepared.delete(object);form.geometry.dispose();return false;
 }
 object.mesh.geometry=form.geometry;if(object.debug)object.debug.geometry=form.geometry;
 previous.geometry.dispose();collision.prepared.delete(object);return true;
}
