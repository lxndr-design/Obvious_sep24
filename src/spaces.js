import {validAction,actionURL} from './message-actions.js';
import {validLetter} from './letters.js';
const KEY='eternity.spaces.v1';
export const objectRecord=o=>({id:o.id,type:o.type,gridSize:o.gridSize??null,size:o.size??null,position:o.mesh.position.toArray(),rotation:o.mesh.quaternion.toArray(),hanging:o.hanging,cableLength:o.cableLength,anchor:o.anchor?.toArray()??null,properties:structuredClone(o.properties),support:o.support?.id??null,seated:!!o.seated,sign:o.sign?structuredClone(o.sign):null,signSlot:o.signSlot??null,letter:o.letter?{...o.letter}:null,board:o.board?{...o.board}:null});
export function validateSpace(value,types){
 if(!value||value.version!==1||!Array.isArray(value.objects)||value.objects.length>40)throw Error('This is not a valid Eternity space.');
 const finite=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(v=>Number.isFinite(v)&&Math.abs(v)<10000),ids=new Set();
 for(const o of value.objects){if(!Number.isInteger(o.id)||ids.has(o.id)||!types.has(o.type)||!finite(o.position,3)||!finite(o.rotation,4)||Math.hypot(...o.rotation)<.5)throw Error('Invalid object in space.');ids.add(o.id);if(o.gridSize!==null&&o.gridSize!==undefined&&![1,2,3].includes(o.gridSize))throw Error('Invalid object size.');if(o.type==='pool'&&(!Number.isFinite(o.size)||o.size<.5||o.size>20))throw Error('Invalid pool size.');if(o.hanging&&(!finite(o.anchor,3)||!Number.isFinite(o.cableLength)||o.cableLength<1||o.cableLength>7))throw Error('Invalid cable.');const p=o.properties;
  if(p!==undefined){
   if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid object properties.');
   for(const key of ['tone','reflectance','emittance'])if(p[key]!==undefined&&(!Number.isFinite(p[key])||p[key]<0||p[key]>1))throw Error('Invalid material.');
   if(p.messageMode!==undefined&&!['ordered','random','branching'].includes(p.messageMode))throw Error('Invalid message mode.');
   if(p.messages!==undefined&&(!Array.isArray(p.messages)||p.messages.length>100||p.messages.some(m=>!m||typeof m.text!=='string'||m.text.length>500||!Array.isArray(m.choices)||m.choices.some(c=>!c||typeof c.label!=='string'||!Number.isInteger(c.target)))))throw Error('Invalid messages.');
  }
  if(o.type==='letter'&&o.letter&&!validLetter(o.letter))throw Error('Invalid letter.');
  if(o.type==='board'&&o.board&&(typeof o.board.title!=='string'||o.board.title.length>80||!actionURL(o.board.url)))throw Error('Invalid board.');
  for(const m of p?.messages??[])if(m.action&&!validAction(m.action))throw Error('Invalid message action.');
  if(o.sign&&(!['arrow','plaque','pennant'].includes(o.sign.variant)||!['text','icon'].includes(o.sign.mode)||typeof o.sign.label!=='string'||o.sign.label.length>32||!['left','right'].includes(o.sign.arrow)||!Number.isFinite(o.sign.width)))throw Error('Invalid sign.');
 }

 for(const o of value.objects){let current=o;const seen=new Set([o.id]);while(current.support!=null){if(seen.has(current.support))throw Error('Invalid support cycle.');seen.add(current.support);current=value.objects.find(v=>v.id===current.support);if(!current)throw Error('Missing support.');}}
 if(!finite(value.camera?.position,3)||!finite(value.camera?.target,3)||!Number.isFinite(value.camera?.zoom)||value.camera.zoom<.1||value.camera.zoom>20)throw Error('Invalid camera.');
 return value;
}
export function readSpaces(storage=localStorage){try{const a=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(a)?a:[];}catch{return [];}}
export function saveSpace(name,space,storage=localStorage){const all=readSpaces(storage),record={id:crypto.randomUUID(),name:name.trim().slice(0,80)||'Untitled space',savedAt:new Date().toISOString(),space};all.unshift(record);storage.setItem(KEY,JSON.stringify(all));return record;}
export function downloadSpace(space,name='eternity-space.json'){const url=URL.createObjectURL(new Blob([JSON.stringify(space,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function presentationURL(space){const url=new URL(location.href);url.search='?view=1';url.hash='space='+encodeURIComponent(JSON.stringify(space));return url.href;}
export function installSpaces({capture,load,notify}){
 const button=document.createElement('button');button.id='spaces';button.className='text-button';button.textContent='Spaces';document.querySelector('.header-right').prepend(button);
 const dialog=document.createElement('dialog');dialog.id='spaces-dialog';dialog.innerHTML='<div class="picker-heading"><h2>Spaces</h2><button type="button" aria-label="Close spaces">×</button></div><label for="space-name">Name</label><input id="space-name" maxlength="80" placeholder="My quiet corner"><div class="space-actions"><button id="save-space">Save space</button><button id="export-space">Export file</button><button id="import-space">Import file</button><button id="present-space">Presentation link</button></div><p class="hint">Saved on this browser. Export a file to keep a portable copy. Presentation links open a locked, clean view of your current space.</p><div id="saved-spaces"></div><input type="file" id="space-file" accept="application/json,.json" hidden>';document.body.append(dialog);
 const list=dialog.querySelector('#saved-spaces'),render=()=>{list.replaceChildren();for(const record of readSpaces()){const row=document.createElement('button');row.textContent=record.name;row.onclick=()=>{try{load(record.space);dialog.close();notify('Space loaded');}catch(e){notify(e.message);}};list.append(row);}};
 button.onclick=()=>{render();dialog.showModal();};dialog.querySelector('[aria-label="Close spaces"]').onclick=()=>dialog.close();
 dialog.querySelector('#save-space').onclick=()=>{try{saveSpace(dialog.querySelector('#space-name').value,capture());render();notify('Space saved');}catch{notify('Browser storage is full or unavailable. Export a file instead.');}};
 dialog.querySelector('#export-space').onclick=()=>downloadSpace(capture());const file=dialog.querySelector('#space-file');dialog.querySelector('#import-space').onclick=()=>file.click();file.onchange=async()=>{try{load(JSON.parse(await file.files[0].text()));dialog.close();notify('Space imported');}catch(e){notify(e.message);}finally{file.value='';}};
 dialog.querySelector('#present-space').onclick=()=>{const url=presentationURL(capture());let output=dialog.querySelector('.presentation-link');if(!output){output=document.createElement('div');output.className='presentation-link';dialog.append(output);}output.replaceChildren();const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent='Open presentation';const input=document.createElement('input');input.readOnly=true;input.value=url;input.setAttribute('aria-label','Presentation link');input.onclick=()=>input.select();output.append(a,input);};return dialog;
}
