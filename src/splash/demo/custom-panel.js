import {PRESET_NAMES} from '../presets.js';
import {MATERIAL_KINDS} from '../materials/index.js';
import {FILTER_PRESETS,FEEL_PRESETS,LIGHT_RIGS,PANEL_PALETTE} from './variants.js';

// The custom banner's compact option panel — exactly eight live controls:
// preset, material, palette, lighting rig, density, scale, physics feel and
// filter. Reuses the editor's binding discipline (control metadata + explicit
// call mapping, DOM-free and assertable) but not the editor itself: the full
// studio rail/gallery/HUD never mounts on this page.

// The eight controls, in display order. Ranges stay inside BannerConfig's
// RANGES so patch() never has to rescue a UI value.
export const PANEL_CONTROLS=[
 {key:'preset',label:'Preset',type:'select',choices:PRESET_NAMES},
 {key:'material',label:'Material',type:'select',choices:MATERIAL_KINDS},
 {key:'palette',label:'Palette',type:'swatches',choices:PANEL_PALETTE},
 {key:'rig',label:'Lighting',type:'select',choices:Object.keys(LIGHT_RIGS)},
 {key:'count',label:'Density',type:'range',min:4,max:160,step:2},
 {key:'base',label:'Scale',type:'range',min:.3,max:3,step:.05},
 {key:'feel',label:'Feel',type:'select',choices:Object.keys(FEEL_PRESETS).filter(k=>['floaty','grounded','chaotic'].includes(k))},
 {key:'filter',label:'Filter',type:'select',choices:Object.keys(FILTER_PRESETS)},
];

// The exact effect of each control, as data — the panel's test surface. Every
// named value resolves through the whitelist enums in variants.js; raw strings
// from the DOM never reach a patch, a style or the scene.
export function panelCall(key,value){
 switch(key){
  case 'preset':return{kind:'banner',patch:{preset:value},respawn:true};
  case 'material':return{kind:'banner',patch:{material:value},respawn:true};
  case 'palette':return{kind:'banner',patch:{color:value},respawn:true};
  case 'count':return{kind:'banner',patch:{count:value},respawn:true};
  case 'base':return{kind:'banner',patch:{base:value},respawn:true};
  case 'feel':return{kind:'feel',feel:value,patch:FEEL_PRESETS[value]};
  case 'filter':return{kind:'filter',filter:value,css:FILTER_PRESETS[value]};
  case 'rig':return{kind:'rig',rig:value};
  default:throw new TypeError(`Unknown panel control: ${key}`);
 }
}

// Row builders mirror editor/panel.js's rail rows, scoped to the demo panel.
function selectRow({id,label,value,choices,onInput,doc}){
 const row=doc.createElement('div');
 row.className='panel-row';
 const labelEl=doc.createElement('label');
 labelEl.textContent=label;
 labelEl.htmlFor=id;
 const input=doc.createElement('select');
 input.id=id;
 for(const choice of choices){
  const opt=doc.createElement('option');
  opt.value=choice;
  opt.textContent=choice;
  input.append(opt);
 }
 input.value=value;
 input.addEventListener('change',()=>onInput(input.value));
 row.append(labelEl,input);
 return row;
}

function rangeRow({id,label,value,min,max,step,onInput,doc}){
 const row=doc.createElement('div');
 row.className='panel-row';
 const labelEl=doc.createElement('label');
 labelEl.textContent=label;
 labelEl.htmlFor=id;
 const input=doc.createElement('input');
 input.type='range';
 input.id=id;
 input.min=String(min);
 input.max=String(max);
 input.step=String(step);
 input.value=String(value);
 const out=doc.createElement('output');
 out.htmlFor=id;
 out.textContent=String(value);
 input.addEventListener('input',()=>{
  const n=Number(input.value);
  out.textContent=String(n);
  onInput(n);
 });
 row.append(labelEl,input,out);
 return row;
}

function swatchRow({label,value,choices,onInput,doc}){
 const row=doc.createElement('div');
 row.className='panel-row';
 const labelEl=doc.createElement('label');
 labelEl.textContent=label;
 const swatches=doc.createElement('div');
 swatches.className='swatch-row';
 swatches.setAttribute('role','radiogroup');
 swatches.setAttribute('aria-label',label);
 for(const choice of choices){
  const swatch=doc.createElement('button');
  swatch.type='button';
  swatch.className='swatch'+(choice===value?' active':'');
  swatch.style.background=choice;
  swatch.setAttribute('role','radio');
  swatch.setAttribute('aria-label',choice);
  swatch.setAttribute('aria-checked',String(choice===value));
  swatch.addEventListener('click',()=>{
   for(const other of swatches.children){
    other.classList.remove('active');
    other.setAttribute('aria-checked','false');
   }
   swatch.classList.add('active');
   swatch.setAttribute('aria-checked','true');
   onInput(choice);
  });
  swatches.append(swatch);
 }
 row.append(labelEl,swatches);
 return row;
}

// Builds the panel. The runtime owns the kit (created lazily); applyRig and
// applyFilter are section-scoped closures from the mount. Every control applies
// through panelCall, so tests can assert the map while the DOM stays thin.
export function createCustomPanel({runtime,doc=document,applyRig,applyFilter}){
 const root=doc.createElement('aside');
 root.className='splash-panel';
 root.setAttribute('aria-label','Custom banner options');
 const title=doc.createElement('h2');
 title.textContent='Make it yours';
 root.append(title);

 const apply=key=>value=>{
  const call=panelCall(key,value);
  switch(call.kind){
   case 'banner':{
    const kit=runtime.kit;
    if(!kit)break;
    kit.banner.patch(call.patch);
    if(call.respawn)runtime.tool?.requestRegen();
    break;
   }
   case 'feel':runtime.setFeel(call.feel);break;
   case 'filter':applyFilter?.(call.filter,call.css);break;
   case 'rig':applyRig?.(call.rig);break;
  }
 };

 for(const control of PANEL_CONTROLS){
  const id=`panel-${control.key}`;
  if(control.type==='select'){
   root.append(selectRow({
    doc,id,label:control.label,
    value:control.key==='feel'?runtime.feel:control.choices[0],
    choices:control.choices,
    onInput:apply(control.key),
   }));
  }else if(control.type==='range'){
   const banner=runtime.variant.banner;
   root.append(rangeRow({
    doc,id,label:control.label,
    value:banner[control.key],
    min:control.min,max:control.max,step:control.step,
    onInput:apply(control.key),
   }));
  }else if(control.type==='swatches'){
   root.append(swatchRow({
    doc,label:control.label,value:runtime.variant.banner.color,
    choices:control.choices,onInput:apply(control.key),
   }));
  }
 }
 return{root,controls:PANEL_CONTROLS};
}
