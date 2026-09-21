// Bake scale into the render geometry and physics together. Mesh transforms stay
// unscaled so placement, stacking and rigid-body queries share world units.
export function scaleForm(form,R,factor){
 form.geometry.scale(factor,factor,factor);form.geometry.computeBoundingBox();
 const parts=form.parts.map(part=>{const s=part.shape;let shape;
  if(s.vertices){const vertices=new Float32Array(s.vertices).map(v=>v*factor);shape=s.type===R.ShapeType.TriMesh?new R.TriMesh(vertices,new Uint32Array(s.indices)):new R.ConvexPolyhedron(vertices,s.indices?new Uint32Array(s.indices):null);}
  else if(s.halfExtents)shape=new R.Cuboid(s.halfExtents.x*factor,s.halfExtents.y*factor,s.halfExtents.z*factor);
  else if(s.halfHeight!==undefined)shape=new R.Cylinder(s.halfHeight*factor,s.radius*factor);
  else shape=new R.Ball(s.radius*factor);
  return {...part,shape,offset:part.offset.clone().multiplyScalar(factor)};
 });
 const p=form.stacking,stacking=p?{...p,bottomY:p.bottomY*factor,headY:p.headY*factor,points:p.points.map(([x,z])=>[x*factor,z*factor]),heads:p.heads.map(h=>({...h,x:h.x*factor,z:h.z*factor,...(h.kind==='circle'?{r:h.r*factor}:{w:h.w*factor,d:h.d*factor})}))}:undefined;
 return {...form,parts,height:form.height*factor,stacking,modelScale:factor,...(form.hand?{hand:form.hand.clone().multiplyScalar(factor),seatY:form.seatY*factor}:{})};
}
