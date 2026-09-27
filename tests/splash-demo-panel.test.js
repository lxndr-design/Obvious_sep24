import test from 'node:test';
import assert from 'node:assert/strict';
import {PANEL_CONTROLS,panelCall,createCustomPanel} from '../src/splash/demo/custom-panel.js';
import {FILTER_PRESETS,FEEL_PRESETS,VARIANTS} from '../src/splash/demo/variants.js';

// The custom banner's binding map (spec art_WSIRxV9E): exactly eight controls,
// every change routed through panelCall into validated patch / world-config /
// rig / filter calls. The DOM is a minimal stub — the assertions are about
// routing, not layout.

test('the panel ships exactly the eight spec controls in order',()=>{
 assert.deepEqual(PANEL_CONTROLS.map(c=>c.key),['preset','material','palette','rig','count','base','feel','filter']);
 assert.equal(PANEL_CONTROLS.length,8);
});

test('panelCall maps banner controls to validated patches with respawn',()=>{
 assert.deepEqual(panelCall('preset','ring'),{kind:'banner',patch:{preset:'ring'},respawn:true});
 assert.deepEqual(panelCall('material','porcelain'),{kind:'banner',patch:{material:'porcelain'},respawn:true});
 assert.deepEqual(panelCall('palette','#58e6d9'),{kind:'banner',patch:{color:'#58e6d9'},respawn:true});
 assert.deepEqual(panelCall('count',40),{kind:'banner',patch:{count:40},respawn:true});
 assert.deepEqual(panelCall('base',1.5),{kind:'banner',patch:{base:1.5},respawn:true});
});

test('panelCall maps feel, filter and rig to their own kinds',()=>{
 const feel=panelCall('feel','chaotic');
 assert.equal(feel.kind,'feel');
 assert.equal(feel.feel,'chaotic');
 assert.deepEqual(feel.patch,FEEL_PRESETS.chaotic);
 const filter=panelCall('filter','warm');
 assert.equal(filter.kind,'filter');
 assert.equal(filter.filter,'warm');
 assert.equal(filter.css,FILTER_PRESETS.warm);
 assert.deepEqual(panelCall('rig','neon'),{kind:'rig',rig:'neon'});
 assert.throws(()=>panelCall('bogus','x'),/Unknown panel control/);
});

// --- minimal DOM stub -------------------------------------------------------
function el(tag){
 const node={
  tag,children:[],handlers:{},style:{},value:'',attributes:{},className:'',
  append(...kids){node.children.push(...kids);},
  addEventListener(type,fn){(node.handlers[type]??=[]).push(fn);},
  setAttribute(k,v){node.attributes[k]=v;},
  querySelector(){return null;},
  classList:{
   add(c){node.className=(node.className?node.className+' ':'')+c;},
   remove(c){node.className=node.className.split(' ').filter(x=>x!==c).join(' ');},
   toggle(c,force){
    const has=node.className.split(' ').includes(c);
    if(force===undefined?has:false)if(!has)node.classList.add(c);
   },
  },
 };
 return node;
}
const stubDoc={createElement:el};

function fakeRuntime(){
 const applied={patches:[],regens:0,feels:[]};
 const runtime={
  variant:VARIANTS.find(v=>v.id==='custom'),
  kit:{
   banner:{patch(p){applied.patches.push({...p});}},
   sim:{sent:[]},
  },
  tool:{requestRegen(){applied.regens++;}},
  get feel(){return 'floaty';},
  setFeel(name){applied.feels.push(name);return name;},
  applied,
 };
 return runtime;
}

function buildPanel(){
 const runtime=fakeRuntime();
 const applied={rigs:[],filters:[]};
 const panel=createCustomPanel({
  runtime,doc:stubDoc,
  applyRig:rig=>applied.rigs.push(rig),
  applyFilter:(name,css)=>applied.filters.push(name),
 });
 return{runtime,panel,applied};
}

const rowsOf=panel=>panel.root.children.filter(c=>c.tag!=='h2');

test('createCustomPanel mounts eight rows',()=>{
 const{panel}=buildPanel();
 assert.equal(rowsOf(panel).length,8);
 assert.equal(panel.controls.length,8);
});

test('preset select routes a validated patch and respawns the series',()=>{
 const{runtime,panel}=buildPanel();
 const select=rowsOf(panel)[0].children[1];
 assert.equal(select.tag,'select');
 select.value='ring';
 select.handlers.change[0]();
 assert.deepEqual(runtime.applied.patches,[{preset:'ring'}]);
 assert.equal(runtime.applied.regens,1);
});

test('density slider patches count only',()=>{
 const{runtime,panel}=buildPanel();
 const input=rowsOf(panel)[4].children[1]; // preset, material, palette, rig, count…
 assert.equal(input.tag,'input');
 input.value='40';
 input.handlers.input[0]();
 assert.deepEqual(runtime.applied.patches,[{count:40}]);
 assert.equal(runtime.applied.regens,1);
});

test('feel select goes through runtime.setFeel — it survives reseeds',()=>{
 const{runtime,panel}=buildPanel();
 const select=rowsOf(panel)[6].children[1];
 assert.equal(select.value,'floaty','feel select opens on the variant feel');
 select.value='grounded';
 select.handlers.change[0]();
 assert.deepEqual(runtime.applied.feels,['grounded']);
 assert.equal(runtime.applied.patches.length,0,'feel is a world config, not a banner patch');
});

test('filter and rig selects ride the section-scoped appliers',()=>{
 const{panel,applied}=buildPanel();
 const filterSelect=rowsOf(panel)[7].children[1];
 filterSelect.value='mono';
 filterSelect.handlers.change[0]();
 assert.deepEqual(applied.filters,['mono'],'applyFilter receives the preset NAME — the css lookup stays whitelisted');
 const rigSelect=rowsOf(panel)[3].children[1];
 rigSelect.value='porcelain';
 rigSelect.handlers.change[0]();
 assert.deepEqual(applied.rigs,['porcelain']);
});
