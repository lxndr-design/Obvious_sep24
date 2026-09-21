import {makeForm} from './shapes.js';
export const SIZED_FORMS=new Set(['box','sphere','cylinder','arch','pebble']);
export function makeSizedForm(type,R,gridSize=null){
 const form=makeForm(type,R);if(!gridSize||!SIZED_FORMS.has(type))return form;
 if(![1,2,3].includes(gridSize))throw Error('Choose a 1, 2 or 3 tile size.');
 const bounds=form.geometry.boundingBox,factor=gridSize/Math.max(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z);
 form.geometry.scale(factor,factor,factor);form.geometry.computeBoundingBox();form.height*=factor;
 form.parts=form.parts.map(part=>{const s=part.shape;let shape;
  if(s.vertices){const vertices=new Float32Array(s.vertices).map(v=>v*factor);shape=s.indices&&s.type===6?new R.TriMesh(vertices,new Uint32Array(s.indices)):new R.ConvexPolyhedron(vertices,s.indices?new Uint32Array(s.indices):null);}
  else if(s.halfExtents)shape=new R.Cuboid(s.halfExtents.x*factor,s.halfExtents.y*factor,s.halfExtents.z*factor);
  else if(s.halfHeight!==undefined)shape=new R.Cylinder(s.halfHeight*factor,s.radius*factor);
  else shape=new R.Ball(s.radius*factor);
  return {...part,shape,offset:part.offset.clone().multiplyScalar(factor)};
 });
 const p=form.stacking;if(p){p.bottomY*=factor;p.headY*=factor;p.points=p.points.map(([x,z])=>[x*factor,z*factor]);p.heads=p.heads.map(h=>({...h,x:h.x*factor,z:h.z*factor,...(h.kind==='circle'?{r:h.r*factor}:{w:h.w*factor,d:h.d*factor})}));}
 return {...form,gridSize};
}
export function installSizeMenu(toolbar,onAdd){
 const menu=document.createElement('div');menu.className='size-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Object size');toolbar.parentElement.append(menu);let owner=null,timer;
 const close=()=>{menu.hidden=true;owner?.setAttribute('aria-expanded','false');};
 const open=button=>{clearTimeout(timer);owner?.setAttribute('aria-expanded','false');owner=button;button.setAttribute('aria-expanded','true');menu.replaceChildren();
  for(const [size,name]of [[1,'Small'],[2,'Medium'],[3,'Large']]){const option=document.createElement('button');option.type='button';option.setAttribute('role','menuitem');option.textContent=`${name} · ${size} × ${size}`;option.onclick=()=>{onAdd(button.dataset.add,size);close();};menu.append(option);}
  menu.hidden=false;const r=button.getBoundingClientRect(),p=toolbar.parentElement.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(p.width-160,r.left-p.left+r.width/2-76))+'px';menu.style.bottom=p.bottom-r.top+8+'px';
 };
 for(const button of toolbar.querySelectorAll('[data-add]'))if(SIZED_FORMS.has(button.dataset.add)||button.dataset.add==='pool'){
  button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.addEventListener('pointerenter',()=>open(button));button.addEventListener('focus',()=>open(button));button.addEventListener('pointerleave',()=>timer=setTimeout(close,220));button.addEventListener('keydown',e=>{if(e.key==='ArrowUp'){e.preventDefault();open(button);menu.firstChild.focus();}});
 }
 menu.onpointerenter=()=>clearTimeout(timer);menu.onpointerleave=()=>timer=setTimeout(close,180);menu.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();owner?.focus();close();}if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const buttons=[...menu.children],i=buttons.indexOf(document.activeElement);buttons[(i+(e.key==='ArrowUp'?-1:1)+3)%3].focus();}};
 toolbar.addEventListener('pointerdown',close);window.addEventListener('resize',close);return close;
}
