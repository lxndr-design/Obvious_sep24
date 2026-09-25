// True-3D fractal bump — the noise core. Seeded 3D value-noise fBm over
// object-space position, a radial displacer for closed forms, and the GLSL
// mirror of the same field for the fragment shader tier.
//
// ONE NOISE DEFINITION, TWO RUNTIMES: the JS side displaces geometry (it runs
// in the noise worker so the render thread never waits on it); FBM3_GLSL is
// inlined into the fractal-bump material by materials/index.js and re-evaluates
// the identical field per fragment, so micro-detail shades from the same noise
// the silhouettes were cut with. The lattice hash is integer math with 32-bit
// wraparound — Math.imul here, uint ops in GLSL — with identical constants and
// shift order, so both runtimes agree to float precision (JS is float64, GPUs
// are float32; bit-exactness across runtimes is not claimed anywhere).
// tests/splash-bump3d.test.js pins JS determinism, bounds, and the
// constant-level parity between hash3u and FBM3_GLSL.
//
// This module deliberately imports nothing: the noise worker bundles it alone,
// keeping the worker chunk tiny; the three.js-aware geometry assembly lives in
// bump-geometry.js on the main thread.

// The bump tier's single field configuration. frequency/lacunarity/gain/seed
// define the noise FIELD (shared by geometry displacement and fragment
// shading so they cannot disagree); amplitude is application gain. The
// fragment tier reads the same field through material defines (see
// bumpDefines in materials/index.js).
export const BUMP_DEFAULTS=Object.freeze({
 octaves:5,frequency:1.6,amplitude:.35,lacunarity:2.1,gain:.5,seed:7,
});

// Seed must stay under 2^31 so seed+octave is exact in uint32 on both sides.
export const BUMP_RANGES=Object.freeze({
 octaves:[1,8],frequency:[.05,16],amplitude:[0,1],lacunarity:[1,4],gain:[0,1],seed:[0,2147483647],
});

const INTEGER_KEYS=new Set(['octaves','seed']);

// Validates + clamps a bump params patch into a complete config. Loud on
// non-finite garbage (like banner-config), clamping is for slider-style
// callers that can overshoot a range. Frozen: configs are shared across
// threads and cached by the kit.
export function resolveBumpParams(params={}){
 if(typeof params!=='object'||params===null||Array.isArray(params))throw new TypeError('bump params must be an object');
 const out={};
 for(const key of Object.keys(BUMP_DEFAULTS)){
  const raw=params[key]===undefined?BUMP_DEFAULTS[key]:params[key];
  if(typeof raw!=='number'||!Number.isFinite(raw))throw new TypeError(`bump.${key} must be a finite number`);
  const[min,max]=BUMP_RANGES[key];
  if(INTEGER_KEYS.has(key)){
   if(!Number.isInteger(raw))throw new TypeError(`bump.${key} must be an integer`);
   out[key]=Math.min(max,Math.max(min,raw));
  }else{
   out[key]=Math.min(max,Math.max(min,raw));
  }
 }
 return Object.freeze(out);
}

// --- the field ------------------------------------------------------------

const LATTICE_OFFSET=1048576; // pushes lattice coords positive before the uint cast — see FBM3_GLSL

// 32-bit integer lattice hash (a,b,c = non-negative uint32 lattice coords).
// Mirrored EXACTLY in splashHash() in FBM3_GLSL: Math.imul is uint multiply
// mod 2^32, >>> is the uint right shift. Changing a constant or shift here
// MUST be mirrored there (the parity test enforces it).
export function hash3u(a,b,c,seed){
 let h=(seed^a)>>>0;
 h=Math.imul(h,0x85EBCA6B)>>>0;h=(h^(h>>>13))>>>0;
 h=(h^b)>>>0;
 h=Math.imul(h,0xC2B2AE35)>>>0;h=(h^(h>>>15))>>>0;
 h=(h^c)>>>0;
 h=Math.imul(h,0x27D4EB2F)>>>0;h=(h^(h>>>16))>>>0;
 return h>>>0;
}

function corner(xi,yi,zi,seed){
 // Top 24 bits only: exactly representable in float32, so the GPU mirror
 // (float(h >> 8u) / 2^24) loses nothing to quantization.
 return (hash3u((xi+LATTICE_OFFSET)>>>0,(yi+LATTICE_OFFSET)>>>0,(zi+LATTICE_OFFSET)>>>0,seed)>>>8)/16777216*2-1;
}

function fade(t){return t*t*t*(t*(t*6-15)+10);}

// Seeded 3D value noise in [-1,1). Quintic-smooth, C2 across cell borders.
export function noise3(x,y,z,seed){
 const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);
 const tx=x-xi,ty=y-yi,tz=z-zi;
 const fx=fade(tx),fy=fade(ty),fz=fade(tz);
 const v000=corner(xi,yi,zi,seed),v100=corner(xi+1,yi,zi,seed);
 const v010=corner(xi,yi+1,zi,seed),v110=corner(xi+1,yi+1,zi,seed);
 const v001=corner(xi,yi,zi+1,seed),v101=corner(xi+1,yi,zi+1,seed);
 const v011=corner(xi,yi+1,zi+1,seed),v111=corner(xi+1,yi+1,zi+1,seed);
 const x00=v000+fx*(v100-v000),x10=v010+fx*(v110-v010);
 const x01=v001+fx*(v101-v001),x11=v011+fx*(v111-v011);
 const y0=x00+fy*(x10-x00),y1=x01+fy*(x11-x01);
 return y0+fz*(y1-y0);
}

// Normalized fBm in [-1,1): amplitude-normalized so `amplitude` alone bounds
// the displacement regardless of octave count.
export function fbm3(x,y,z,{octaves=BUMP_DEFAULTS.octaves,frequency=1,lacunarity=BUMP_DEFAULTS.lacunarity,gain=BUMP_DEFAULTS.gain,seed=BUMP_DEFAULTS.seed}={}){
 let sum=0,amp=1,freq=frequency,norm=0;
 for(let o=0;o<octaves;o++){
  sum+=amp*noise3(x*freq,y*freq,z*freq,(seed+o)>>>0);
  norm+=amp;
  freq*=lacunarity;
  amp*=gain;
 }
 return sum/norm;
}

// Radial displacement on closed forms: every vertex moves along p̂ by
// amplitude·fbm — duplicated seam vertices share p, so seams stay welded and
// the form stays closed. Returns a NEW Float32Array; input is never mutated.
export function displacePositions(positions,params){
 const cfg=resolveBumpParams(params);
 if(!(positions instanceof Float32Array))throw new TypeError('displacePositions expects a Float32Array');
 if(positions.length%3!==0)throw new TypeError('displacePositions: positions must be xyz triples');
 const out=new Float32Array(positions.length);
 for(let i=0;i<positions.length;i+=3){
  const x=positions[i],y=positions[i+1],z=positions[i+2];
  const r=Math.hypot(x,y,z)||1; // guard the origin — the spec's `|| 1`
  const d=fbm3(x,y,z,cfg)*cfg.amplitude;
  const s=(r+d)/r;
  out[i]=x*s;out[i+1]=y*s;out[i+2]=z*s;
 }
 return out;
}

// --- the GLSL mirror -------------------------------------------------------

// GLSL ES 3.00 (three.js is WebGL2-only) mirror of the field above, for the
// fragment tier of the fractal-bump material. Reads the material defines:
//   SPLASH_BUMP_OCTAVES  int    — octave count
//   SPLASH_BUMP_LACUNARITY float — per-octave frequency multiplier
//   SPLASH_BUMP_GAIN     float  — per-octave amplitude falloff
//   SPLASH_BUMP_SEED     uint   — base hash seed
// Same hash constants, same shifts, same fade, same normalization as the JS
// above — change them together (parity test enforces the hash constants).
export const FBM3_GLSL=`
uint splashHash(uint a,uint b,uint c,uint seed){
 uint h=seed^a;
 h=h*0x85EBCA6Bu;h^=h>>13u;
 h^=b;
 h=h*0xC2B2AE35u;h^=h>>15u;
 h^=c;
 h=h*0x27D4EB2Fu;h^=h>>16u;
 return h;
}
float splashCorner(int xi,int yi,int zi,uint seed){
 uint h=splashHash(uint(xi+1048576),uint(yi+1048576),uint(zi+1048576),seed);
 return float(h>>8u)*(1.0/16777216.0)*2.0-1.0;
}
float splashNoise(vec3 p,uint seed){
 vec3 c=floor(p);
 vec3 t=p-c;
 vec3 f=t*t*t*(t*(t*6.0-15.0)+10.0);
 float v000=splashCorner(int(c.x),int(c.y),int(c.z),seed);
 float v100=splashCorner(int(c.x)+1,int(c.y),int(c.z),seed);
 float v010=splashCorner(int(c.x),int(c.y)+1,int(c.z),seed);
 float v110=splashCorner(int(c.x)+1,int(c.y)+1,int(c.z),seed);
 float v001=splashCorner(int(c.x),int(c.y),int(c.z)+1,seed);
 float v101=splashCorner(int(c.x)+1,int(c.y),int(c.z)+1,seed);
 float v011=splashCorner(int(c.x),int(c.y)+1,int(c.z)+1,seed);
 float v111=splashCorner(int(c.x)+1,int(c.y)+1,int(c.z)+1,seed);
 vec3 w=vec3(f.x,f.y,f.z);
 float x00=v000+w.x*(v100-v000);
 float x10=v010+w.x*(v110-v010);
 float x01=v001+w.x*(v101-v001);
 float x11=v011+w.x*(v111-v011);
 float y0=x00+w.y*(x10-x00);
 float y1=x01+w.y*(x11-x01);
 return y0+w.z*(y1-y0);
}
float splashFbm(vec3 p,float frequency,uint seed){
 float sum=0.0,amp=1.0,freq=frequency,norm=0.0;
 for(int o=0;o<SPLASH_BUMP_OCTAVES;o++){
  sum+=amp*splashNoise(p*freq,seed+uint(o));
  norm+=amp;
  freq*=SPLASH_BUMP_LACUNARITY;
  amp*=SPLASH_BUMP_GAIN;
 }
 return sum/norm;
}
`;
