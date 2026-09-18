import {MessagePlayer} from './object-properties.js';
import * as THREE from 'three';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export class ObjectInspector {
 constructor(root,onChange){
  this.object=null;this.onChange=onChange;this.root=el('div');this.root.className='object-properties';root.append(this.root);
  this.root.innerHTML='<div class="switch-row"><label for="object-locked">Lock object</label><input id="object-locked" type="checkbox" role="switch"></div><div id="object-materials"></div><details><summary>Hover messages</summary><label for="message-mode">Playback</label><select id="message-mode"><option value="ordered">Ordered</option><option value="random">Random</option><option value="branching">Branching</option></select><div id="message-editor"></div><button type="button" id="add-message">Add message</button></details>';
  this.lock=this.root.querySelector('#object-locked');this.lock.onchange=()=>{if(this.object){this.object.properties.locked=this.lock.checked;onChange(this.object,'locked');}};
  this.sliders={};for(const name of ['tone','reflectance','emittance']){
   const label=el('label',name[0].toUpperCase()+name.slice(1)),output=el('output'),input=el('input');input.type='range';input.min=0;input.max=100;input.step=1;input.id=`object-${name}`;input.setAttribute('aria-label',name[0].toUpperCase()+name.slice(1));label.htmlFor=input.id;label.append(output);this.root.querySelector('#object-materials').append(label,input);this.sliders[name]={input,output};
   input.oninput=()=>{if(!this.object)return;this.object.properties[name]=+input.value/100;output.textContent=input.value+'%';onChange(this.object,name);};
  }
  this.mode=this.root.querySelector('#message-mode');this.mode.onchange=()=>{if(this.object){this.object.properties.messageMode=this.mode.value;this.renderMessages();onChange(this.object,'messages');}};
  this.editor=this.root.querySelector('#message-editor');this.root.querySelector('#add-message').onclick=()=>{if(!this.object)return;this.object.properties.messages.push({text:'',choices:[]});this.renderMessages();onChange(this.object,'messages');};
 }
 select(object){this.object=object;if(!object)return;const p=object.properties;this.lock.checked=p.locked;for(const [key,{input,output}]of Object.entries(this.sliders)){input.value=Math.round(p[key]*100);output.textContent=input.value+'%';}this.mode.value=p.messageMode;this.renderMessages();}
 renderMessages(){
  this.editor.replaceChildren();const p=this.object.properties;
  p.messages.forEach((message,index)=>{
   const row=el('div');row.className='message-row';const label=el('label',`Message ${index+1}`),text=el('textarea');text.rows=2;text.maxLength=500;text.value=message.text;text.setAttribute('aria-label',`Message ${index+1}`);text.oninput=()=>{message.text=text.value;this.onChange(this.object,'message-text');};
   const remove=el('button','Remove message');remove.type='button';remove.onclick=()=>{p.messages.splice(index,1);for(const m of p.messages)m.choices=m.choices.filter(c=>c.target!==index).map(c=>({...c,target:c.target>index?c.target-1:c.target}));this.renderMessages();this.onChange(this.object,'messages');};row.append(label,text);
   if(p.messageMode==='branching'){
    message.choices.forEach((choice,choiceIndex)=>{
     const line=el('div');line.className='message-choice';const name=el('input'),target=el('select'),del=el('button','×');name.value=choice.label;name.placeholder='Choice label';name.maxLength=80;name.setAttribute('aria-label',`Choice ${choiceIndex+1} for message ${index+1}`);name.oninput=()=>{choice.label=name.value;this.onChange(this.object,'message-text');};
     target.setAttribute('aria-label',`Destination for choice ${choiceIndex+1} of message ${index+1}`);p.messages.forEach((m,i)=>target.add(new Option(`Message ${i+1}`,i)));target.value=choice.target;target.onchange=()=>{choice.target=+target.value;this.onChange(this.object,'messages');};del.type='button';del.setAttribute('aria-label','Remove choice');del.onclick=()=>{message.choices.splice(choiceIndex,1);this.renderMessages();this.onChange(this.object,'messages');};line.append(name,target,del);row.append(line);
    });
    const add=el('button','Add choice');add.type='button';add.onclick=()=>{message.choices.push({label:'Continue',target:(index+1)%p.messages.length});this.renderMessages();this.onChange(this.object,'messages');};row.append(add);
   }
   row.append(remove);this.editor.append(row);
  });
 }
}
export class ObjectMessages {
 constructor(stage){this.player=new MessagePlayer();this.bubble=el('div');this.bubble.id='object-message';this.bubble.hidden=true;this.bubble.setAttribute('role','status');stage.append(this.bubble);this.over=false;this.grace=0;this.bubble.onpointerenter=()=>{this.over=true;};this.bubble.onpointerleave=()=>{this.over=false;this.grace=.18;};}
 clear(){this.over=false;this.player.enter(null);this.grace=0;this.render();}
 target(object){if(object?.properties.locked||!object?.properties.messages.some(m=>m.text.trim()))object=null;if(!object){if(this.player.object&&!this.over&&!this.grace)this.grace=.35;return;}if(object!==this.player.object){this.player.enter(object);this.render();}this.grace=0;}
 leave(){this.grace=.18;}
 render(){const m=this.player.current();this.bubble.replaceChildren();this.bubble.hidden=!m;if(!m)return;this.bubble.append(el('p',m.text));if(this.player.object.properties.messageMode==='branching'){
  const choices=m.choices.length?m.choices:[{label:'Start again',target:0}];for(const choice of choices){const b=el('button',choice.label||'Continue');b.onclick=()=>{this.player.choose(choice.target);this.render();};this.bubble.append(b);}
 }}
 step(dt,camera,canvas){if(this.grace>0&&!this.over){this.grace-=dt;if(this.grace<=0)this.clear();}if(this.player.step(dt))this.render();const o=this.player.object;if(!o)return;const p=o.mesh.localToWorld(new THREE.Vector3(0,o.height/2+.25,0)).project(camera),r=canvas.getBoundingClientRect();this.bubble.style.left=Math.max(12,Math.min(r.width-this.bubble.offsetWidth-12,(p.x+1)*r.width/2-this.bubble.offsetWidth/2))+'px';this.bubble.style.top=Math.max(85,(1-p.y)*r.height/2-this.bubble.offsetHeight-10)+'px';}
}
