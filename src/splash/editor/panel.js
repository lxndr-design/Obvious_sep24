import {BEHAVIORS} from '../sim/protocol.js';
import {bumpCall,formatValue,GENERATOR_MODES,RAIL_CONTROLS,TOOL_LIMITS} from './bindings.js';
import {createSeriesTool} from './series-tool.js';
import {createGallery} from './gallery.js';
import {createHud} from './hud.js';
import './editor.css';

// The banner rail: hand-rolled DOM (repo convention — no framework), every
// control binding to kit.banner or a tool local, so the generators and tests
// stay DOM-free. Also composes the full editor surface for the entry.

const TOOL_LABELS={
 cols:'Cols',rows:'Rows',jitter:'Jitter',
 octaves:'Octaves',bumpFrequency:'Noise freq',bumpAmplitude:'Noise amp',
 lacunarity:'Lacunarity',gain:'Gain',
};

function section(root,doc,title){
 const h=doc.createElement('h2');
 h.textContent=title;
 root.append(h);
}

function rangeRow({doc,key,min,max,step,value,onInput}){
 const row=doc.createElement('div');
 row.className='rail-row';
 const label=doc.createElement('label');
 label.textContent=TOOL_LABELS[key]??key;
 label.htmlFor=`rail-${key}`;
 const input=doc.createElement('input');
 input.type='range';
 input.id=`rail-${key}`;
 input.min=String(min);
 input.max=String(max);
 input.step=String(step);
 input.value=String(value);
 const out=doc.createElement('output');
 out.htmlFor=input.id;
 out.textContent=formatValue(value);
 input.addEventListener('input',()=>{
  const n=Number(input.value);
  out.textContent=formatValue(n);
  onInput(n);
 });
 row.append(label,input,out);
 return row;
}

function selectRow({doc,key,label,value,options,onInput}){
 const row=doc.createElement('div');
 row.className='rail-row';
 const labelEl=doc.createElement('label');
 labelEl.textContent=label;
 labelEl.htmlFor=`rail-${key}`;
 const input=doc.createElement('select');
 input.id=`rail-${key}`;
 for(const o of options){
  const opt=doc.createElement('option');
  opt.value=o.value;
  opt.textContent=o.label;
  input.append(opt);
 }
 input.value=value;
 input.addEventListener('change',()=>onInput(input.value));
 row.append(labelEl,input);
 return row;
}

export function createBannerRail({kit,seriesTool,doc=document}={}){
 const root=doc.createElement('aside');
 root.id='splash-rail';
 root.className='splash-panel';
 section(root,doc,'Banner');
 for(const ctrl of RAIL_CONTROLS){
  if(ctrl.type==='select'){
   root.append(selectRow({
    doc,key:ctrl.key,label:ctrl.label,value:kit.banner.get(ctrl.key),
    options:ctrl.choices.map(c=>({value:c,label:c})),
    onInput:v=>kit.banner.patch({[ctrl.key]:v}),
   }));
  }else if(ctrl.type==='behavior'){
   root.append(selectRow({
    doc,key:ctrl.key,label:ctrl.label,value:kit.banner.get('behavior')??'',
    options:[{value:'',label:'Default (preset)'},...BEHAVIORS.map(b=>({value:b,label:b}))],
    onInput:v=>kit.banner.patch({behavior:v||null}),
   }));
  }else if(ctrl.type==='color'){
   const row=doc.createElement('div');
   row.className='rail-row';
   const label=doc.createElement('label');
   label.textContent=ctrl.label;
   label.htmlFor=`rail-${ctrl.key}`;
   const input=doc.createElement('input');
   input.type='color';
   input.id=`rail-${ctrl.key}`;
   input.value=kit.banner.get(ctrl.key);
   input.addEventListener('input',()=>kit.banner.patch({[ctrl.key]:input.value}));
   row.append(label,input);
   root.append(row);
  }else{
   root.append(rangeRow({
    doc,key:ctrl.key,min:ctrl.min,max:ctrl.max,step:ctrl.step,
    value:kit.banner.get(ctrl.key),
    onInput:n=>kit.banner.patch({[ctrl.key]:n}),
   }));
  }
 }

 // --- generators ------------------------------------------------------------
 section(root,doc,'Generators');
 const modes=doc.createElement('div');
 modes.className='mode-group';
 modes.setAttribute('role','group');
 modes.setAttribute('aria-label','Generator mode');
 const modeButtons=[];
 for(const m of GENERATOR_MODES){
  const b=doc.createElement('button');
  b.type='button';
  b.dataset.mode=m;
  b.textContent=m==='series'?'Sine series':'Array fill';
  b.setAttribute('aria-pressed',String(seriesTool.mode===m));
  b.addEventListener('click',()=>{
   seriesTool.setMode(m);
   for(const x of modeButtons)x.setAttribute('aria-pressed',String(x.dataset.mode===seriesTool.mode));
  });
  modeButtons.push(b);
  modes.append(b);
 }
 root.append(modes);
 for(const key of['cols','rows','jitter']){
  const lim=TOOL_LIMITS[key];
  root.append(rangeRow({
   doc,key,min:lim.min,max:lim.max,step:lim.step,value:seriesTool.tool[key],
   onInput:n=>{
    seriesTool.tool[key]=n;
    seriesTool.requestRegen();
   },
  }));
 }

 // --- bump ------------------------------------------------------------------
 section(root,doc,'Fractal bump');
 for(const key of['octaves','bumpFrequency','bumpAmplitude','lacunarity','gain']){
  const lim=TOOL_LIMITS[key];
  root.append(rangeRow({
   doc,key,min:lim.min,max:lim.max,step:lim.step,value:seriesTool.tool[key],
   onInput:n=>{seriesTool.tool[key]=n;},
  }));
 }
 const apply=doc.createElement('button');
 apply.type='button';
 apply.className='rail-button';
 apply.textContent='Apply fractal bump';
 const status=doc.createElement('div');
 status.className='rail-status';
 status.setAttribute('role','status');
 apply.addEventListener('click',()=>{
  status.textContent='Generating…';
  kit.fractalBump(kit.banner.get('preset'),bumpCall(kit.banner,seriesTool.tool))
   .then(r=>{status.textContent=`Applied · ${r.vertices.toLocaleString('en-US')} vertices · ${r.transport} · seed ${r.seed}`;})
   .catch(err=>{
    // Visible failure in the tool it belongs to; the console keeps the stack.
    status.textContent=`Bump failed: ${err.message}`;
    console.error(err);
   });
 });
 root.append(apply,status);

 const clear=doc.createElement('button');
 clear.type='button';
 clear.className='rail-button';
 clear.textContent='Clear stage';
 clear.addEventListener('click',()=>seriesTool.clear());
 root.append(clear);
 return root;
}

// Composes the editor surface: rail, gallery, HUD. The entry passes the stage
// and kit; everything else wires itself.
export function createEditor({kit,stage,doc=document}={}){
 const seriesTool=createSeriesTool(kit);
 const rail=createBannerRail({kit,seriesTool,doc});
 const gallery=createGallery({kit,doc});
 const hud=createHud({kit,doc});
 stage?.append(rail,gallery,hud.root);
 hud.start();
 seriesTool.requestRegen();
 return{
  seriesTool,hud,
  dispose(){
   hud.dispose();
   seriesTool.dispose();
   rail.remove();
   gallery.remove();
   hud.root.remove();
  },
 };
}
