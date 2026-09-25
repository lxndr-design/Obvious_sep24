import {formatCount,readTier} from './bindings.js';

// Stats HUD — the evidence channel for the performance model. Polls kit.stats()
// (the kit has no change events) and renders one line per metric plus the
// governor tier. Values render from whatever stats says; absent metrics are
// dashes, never invented numbers.

export function formatStats(stats){
 const s=stats??{};
 return[
  `FPS ${s.fps??'—'}`,
  `Draw calls ${s.drawCalls??'—'}`,
  `Instances ${formatCount(s.instances??0)}`,
  `Active ${s.active===undefined?'—':formatCount(s.active)}`,
  `Sleeping ${s.sleeping===undefined?'—':formatCount(s.sleeping)}`,
  `Batches ${s.batches??'—'}`,
  `Queue ${s.queued??'—'}`,
  `Bump ${s.bumpTransport??'—'}`,
  `Sim ${s.simHz?`${s.simHz} Hz`:'—'}`,
  `Tier ${readTier(s)??'—'}`,
 ];
}

export function createHud({kit,doc=document,interval=500}={}){
 const root=doc.createElement('div');
 root.id='splash-hud';
 root.className='splash-panel';
 root.setAttribute('role','status');
 let timer=null;

 // Returns the formatted lines so tests and callers can assert on values
 // without poking at DOM internals.
 function render(stats){
  const lines=formatStats(stats);
  root.replaceChildren(...lines.map(line=>{
   const el=doc.createElement('div');
   el.className='hud-line';
   el.textContent=line;
   return el;
  }));
  const fps=stats?.fps;
  root.classList.toggle('hud-warn',typeof fps==='number'&&fps<50);
  return lines;
 }
 function start(){
  if(timer)return;
  timer=setInterval(()=>render(kit.stats()),interval);
  render(kit.stats());
 }
 function dispose(){
  if(timer)clearInterval(timer);
  timer=null;
 }

 return{root,render,start,dispose};
}
