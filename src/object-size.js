import {makeForm,LABELS} from './shapes.js';
import {scaleForm} from './form-scale.js';
export const SIZED_FORMS=new Set(Object.keys(LABELS));
export function objectSizeLabel(o){const name=o.type==='pool'?'Pool':o.type==='hedge'?'Hedge':LABELS[o.type].replace(/ · (small|medium|large|½|1\/1)$/i,'');const size=['','Small','Medium','Large'][o.gridSize??o.size];return size?`${name} · ${size}`:name;}
export function makeSizedForm(type,R,gridSize=2){
 const form=makeForm(type,R);if(gridSize==null)return form;
 if(![1,2,3].includes(gridSize))throw Error('Choose Small, Medium or Large.');
 const b=form.geometry.boundingBox;
 // Sizes define a common envelope; narrow shapes retain their proportions.
 const span=type==='hedge'?1:Math.max(b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z),factor=gridSize/span;
 if(form.grandmaForms){const grandmaForms=Object.fromEntries(Object.entries(form.grandmaForms).map(([key,value])=>[key,scaleForm(value,R,factor)]));return {...form,...grandmaForms.standing,grandmaForms,gridSize};}
 return {...scaleForm(form,R,factor),gridSize};
}
export function installSizeMenu(toolbar,onAdd,{typeFor=b=>b.dataset.add,onVariants=()=>{}}={}){
 const menu=document.createElement('div');menu.className='size-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Object size');toolbar.parentElement.append(menu);let owner=null,timer;
 const close=()=>{clearTimeout(timer);menu.hidden=true;owner?.setAttribute('aria-expanded','false');};
 const deferClose=()=>{clearTimeout(timer);timer=setTimeout(close,500);};
 const open=button=>{
  clearTimeout(timer);if(owner===button&&!menu.hidden)return;owner?.setAttribute('aria-expanded','false');owner=button;button.setAttribute('aria-expanded','true');menu.replaceChildren();
  for(const [size,name]of [[1,'Small'],[2,'Medium'],[3,'Large']]){const option=document.createElement('button');option.type='button';option.setAttribute('role','menuitem');option.textContent=name;option.onclick=()=>{button.dataset.gridSize=size;onAdd(typeFor(button),size);close();};menu.append(option);}
  if(!button.dataset.add){const variants=document.createElement('button');variants.type='button';variants.setAttribute('role','menuitem');variants.textContent='Variants…';variants.onclick=()=>{close();onVariants(button);};menu.append(variants);}
  menu.hidden=false;const r=button.getBoundingClientRect(),p=toolbar.parentElement.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(p.width-160,r.left-p.left+r.width/2-76))+'px';menu.style.bottom=p.bottom-r.top+6+'px';
 };
 for(const button of toolbar.querySelectorAll('button'))if(typeFor(button)){
  button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.addEventListener('pointerenter',()=>open(button));button.addEventListener('focus',()=>open(button));button.addEventListener('pointerleave',deferClose);button.addEventListener('keydown',e=>{if(e.key==='ArrowUp'){e.preventDefault();open(button);menu.firstChild.focus();}});
 }
 // Keep the whole bridge between the icon and popover live, including slow travel.
 document.addEventListener('pointermove',e=>{if(menu.hidden||!owner)return;const a=owner.getBoundingClientRect(),b=menu.getBoundingClientRect();const inside=e.clientX>=Math.min(a.left,b.left)-8&&e.clientX<=Math.max(a.right,b.right)+8&&e.clientY>=b.top-8&&e.clientY<=a.bottom+8;if(inside)clearTimeout(timer);else deferClose();});
 menu.onpointerenter=()=>clearTimeout(timer);menu.onpointerleave=deferClose;menu.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();owner?.focus();close();}if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const buttons=[...menu.children],i=buttons.indexOf(document.activeElement);buttons[(i+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length].focus();}};
 toolbar.addEventListener('pointerdown',close);document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!toolbar.contains(e.target))close();});window.addEventListener('resize',close);return close;
}
