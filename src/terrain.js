// A continuous landscape surrounding one recessed patch of water. No platform rim
// or invisible editor fences. Extent is well beyond the orthographic far plane.
export const TERRAIN_EXTENT=4096;
export const GROUND_PATCHES=[
  {w:TERRAIN_EXTENT+.5,d:TERRAIN_EXTENT*2,x:(.5-TERRAIN_EXTENT)/2,z:0},
  {w:TERRAIN_EXTENT-5.5,d:TERRAIN_EXTENT*2,x:(TERRAIN_EXTENT+5.5)/2,z:0},
  {w:5,d:TERRAIN_EXTENT-4,x:3,z:(-4-TERRAIN_EXTENT)/2},
  {w:5,d:TERRAIN_EXTENT-1,x:3,z:(1+TERRAIN_EXTENT)/2},
];
export function inWater(x,z){return x>.5&&x<5.5&&z> -4&&z<1;}
// Keep contact geometry near the small loose objects numerically well-scaled.
// Larger outer patches continue the same ground without a physical fence.
const LOCAL=32;
export const PHYSICS_GROUND_PATCHES=[
 {w:LOCAL+.5,d:LOCAL*2,x:(.5-LOCAL)/2,z:0},
 {w:LOCAL-5.5,d:LOCAL*2,x:(LOCAL+5.5)/2,z:0},
 {w:5,d:LOCAL-4,x:3,z:(-4-LOCAL)/2},
 {w:5,d:LOCAL-1,x:3,z:(1+LOCAL)/2},
 {w:TERRAIN_EXTENT-LOCAL,d:TERRAIN_EXTENT*2,x:-(LOCAL+TERRAIN_EXTENT)/2,z:0},
 {w:TERRAIN_EXTENT-LOCAL,d:TERRAIN_EXTENT*2,x:(LOCAL+TERRAIN_EXTENT)/2,z:0},
 {w:LOCAL*2,d:TERRAIN_EXTENT-LOCAL,x:0,z:-(LOCAL+TERRAIN_EXTENT)/2},
 {w:LOCAL*2,d:TERRAIN_EXTENT-LOCAL,x:0,z:(LOCAL+TERRAIN_EXTENT)/2},
];
