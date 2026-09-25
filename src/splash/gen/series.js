// Seeded series + layout math for the editor's generators. Pure functions:
// same seed in, same banner out — asserted by tests, relied on by the editor
// so every re-run of a control reproduces the exact arrangement.

export function mulberry32(seed){
 let t=seed>>>0;
 return function(){
  t+=0x6D2B79F5;
  let r=Math.imul(t^t>>>15,1|t);
  r^=r+Math.imul(r^r>>>7,61|r);
  return((r^r>>>14)>>>0)/4294967296;
 };
}

// A zero-size instance is an invisible bug, never a valid one — every scale
// passes this floor.
export const SCALE_FLOOR=.05;
export function sineSeries({count=16,spacing=1.2,base=1,amplitude=.4,frequency=1,phase=0,volatility=.15,seed=7}={}){
 const rng=mulberry32(seed);
 return Array.from({length:count},(_,i)=>{
  const wave=base+amplitude*Math.sin(frequency*i*spacing+phase);
  const jitter=volatility*(rng()*2-1);
  return{scale:Math.max(SCALE_FLOOR,wave+jitter),x:i*spacing,seedPhase:rng()*Math.PI*2};
 });
}

export const LAYOUT_SHAPES=['row','grid','ring','arc'];

// Maps the series' along-coordinate (x = arc length) onto a banner layout:
// straight row, filled grid, closed ring, or a camera-facing arc.
export function layoutPositions({shape='row',count=16,spacing=1.2,cols=8,radius}={}){
 const positions=[];
 for(let i=0;i<count;i++){
  const along=i*spacing;
  let x=along,y=0,z=0;
  if(shape==='grid'){
   const c=Math.max(1,cols|0);
   x=(i%c)*spacing;
   z=Math.floor(i/c)*spacing;
  }else if(shape==='ring'){
   const r=radius??Math.max(spacing,spacing*count/(2*Math.PI));
   const t=along/r;
   x=Math.cos(t)*r;
   z=Math.sin(t)*r;
  }else if(shape==='arc'){
   const r=radius??Math.max(spacing,spacing*count/2.4);
   const t=(along-(count-1)*spacing/2)/r;
   x=Math.sin(t)*r;
   z=-Math.cos(t)*r+r*.4;
  }
  positions.push({x,y,z});
 }
 return positions;
}

// Stochastic scatter around the layout points, seeded so an edit replays
// exactly. Zero jitter returns plain copies so callers may mutate freely.
export function applyJitter(positions,{jitter=0,seed=7}={}){
 const rng=jitter>0?mulberry32(seed):null;
 return positions.map(p=>rng?{
  x:p.x+(rng()*2-1)*jitter,
  y:p.y+(rng()*2-1)*jitter,
  z:p.z+(rng()*2-1)*jitter,
 }:{x:p.x,y:p.y,z:p.z});
}
