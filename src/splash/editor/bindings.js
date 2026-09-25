import {PRESET_NAMES} from '../presets.js';
import {MATERIAL_KINDS} from '../materials/index.js';
import {BEHAVIORS} from '../sim/protocol.js';
import {LAYOUT_SHAPES} from '../gen/series.js';

// Editor bindings: control metadata plus the exact SplashKit call each control
// makes. Pure module — the rail builders consume the metadata, node --test
// asserts the calls, and neither side owns hidden state.

export const GENERATOR_MODES=['series','array'];

// Tool-local (non-banner) state: array-fill geometry and bump generation.
// Bump keys mirror BUMP_RANGES (gen/bump3d.js) so a slider cannot overshoot;
// the kit still validates through resolveBumpParams — belt and suspenders.
// bumpFrequency/bumpAmplitude are deliberately suffixed: banner.frequency and
// banner.amplitude are the series wave, not the noise field.
export const TOOL_DEFAULTS=Object.freeze({
 cols:6,rows:6,jitter:0,
 octaves:5,bumpFrequency:1.6,bumpAmplitude:.35,lacunarity:2.1,gain:.5,
});
export const TOOL_LIMITS=Object.freeze({
 cols:{min:1,max:64,step:1},rows:{min:1,max:64,step:1},jitter:{min:0,max:3,step:.1},
 octaves:{min:1,max:8,step:1},bumpFrequency:{min:.05,max:16,step:.05},
 bumpAmplitude:{min:0,max:1,step:.01},lacunarity:{min:1,max:4,step:.1},gain:{min:0,max:1,step:.01},
});

// Rail control metadata: one truth shared by the DOM builder and tests.
// Ranges must stay within BANNER_RANGES (banner-config.js) — patch clamps,
// but the sliders should never offer an out-of-range value in the first place.
export const RAIL_CONTROLS=[
 {key:'preset',label:'Preset',type:'select',choices:PRESET_NAMES},
 {key:'material',label:'Material',type:'select',choices:MATERIAL_KINDS},
 {key:'color',label:'Palette',type:'color'},
 {key:'behavior',label:'Physics',type:'behavior'}, // select; empty value = null (preset default)
 {key:'count',label:'Count',type:'range',min:1,max:5000,step:1},
 {key:'shape',label:'Layout',type:'select',choices:LAYOUT_SHAPES},
 {key:'base',label:'Scale base',type:'range',min:.1,max:4,step:.05},
 {key:'amplitude',label:'Amplitude',type:'range',min:0,max:2,step:.05},
 {key:'frequency',label:'Frequency',type:'range',min:0,max:8,step:.1},
 {key:'phase',label:'Phase',type:'range',min:-3.15,max:3.15,step:.05},
 {key:'volatility',label:'Volatility',type:'range',min:0,max:1,step:.05},
 {key:'spacing',label:'Spacing',type:'range',min:.2,max:6,step:.1},
 {key:'seed',label:'Seed',type:'range',min:0,max:9999,step:1},
];

function valuesOf(banner){
 return typeof banner?.all==='function'?banner.all():{...banner};
}

// The generator param objects are built explicitly (not spread) so the binding
// is assertable: a control change maps to exactly these kit args.

// banner IS the state for the sine-series tool — kit.spawnSeries would default
// from banner anyway; passing the full set makes the call inspectable.
export function seriesCall(banner){
 const v=valuesOf(banner);
 return{
  preset:v.preset,material:v.material,color:v.color,behavior:v.behavior,
  count:v.count,shape:v.shape,spacing:v.spacing,base:v.base,
  amplitude:v.amplitude,frequency:v.frequency,phase:v.phase,
  volatility:v.volatility,seed:v.seed,
 };
}

// Array/ring/arc fill: cols/rows/jitter are tool locals, the rest is banner.
// fillGrid takes the layout shape from params — same key as the series tool.
export function arrayCall(banner,tool){
 const v=valuesOf(banner);
 return{
  preset:v.preset,material:v.material,color:v.color,behavior:v.behavior,
  count:v.count,shape:v.shape,spacing:v.spacing,scale:v.base,seed:v.seed,
  cols:tool.cols,rows:tool.rows,jitter:tool.jitter,
 };
}

// True-3D bump: tool owns the noise field, banner owns the seed so every
// arrangement control (and the bump) stays deterministic per rail state.
export function bumpCall(banner,tool){
 return{
  octaves:tool.octaves,frequency:tool.bumpFrequency,amplitude:tool.bumpAmplitude,
  lacunarity:tool.lacunarity,gain:tool.gain,seed:valuesOf(banner).seed,
 };
}

// Gallery drop / tile placement: spawn one body of the dragged preset at the
// drop point, styled by the current banner.
export function spawnCall(preset,point,banner){
 const v=valuesOf(banner);
 return{preset,position:[...point],scale:v.base,material:v.material,color:v.color,behavior:v.behavior,seed:v.seed};
}

// --- drag payload -----------------------------------------------------------

export const PRESET_DRAG_TYPE='application/x-splash-preset';

export function dragPayload(preset){
 return JSON.stringify({kind:'splash-preset',preset});
}

// Unknown drags (foreign tabs, dropped files) are not errors — they simply
// don't spawn anything; malformed payloads read as null by design.
export function readDragPayload(dataTransfer){
 try{
  const raw=dataTransfer?.getData?.(PRESET_DRAG_TYPE)??'';
  if(!raw)return null;
  const parsed=JSON.parse(raw);
  return parsed?.kind==='splash-preset'&&typeof parsed.preset==='string'?parsed.preset:null;
 }catch{
  return null;
 }
}

// --- HUD formatting ---------------------------------------------------------

// The perf governor publishes its tier through kit.stats() when its slice
// lands; until then there is no tier and the HUD shows a dash — never an
// invented number.
export function readTier(stats){
 if(!stats||typeof stats!=='object')return null;
 if(Number.isInteger(stats.tier))return stats.tier;
 if(Number.isInteger(stats.governorTier))return stats.governorTier;
 return null;
}

export function formatCount(n){
 return Number(n).toLocaleString('en-US');
}

export function formatValue(n){
 const v=Number(n);
 if(!Number.isFinite(v))return'—';
 return String(Math.round(v*100)/100);
}
