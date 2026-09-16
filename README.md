# Eternity

An open, dithered Three.js landscape with interactive water, draggable forms, pendulums and a sparse white meadow. `npm install` and `npm run dev` start it locally; `npm run build` produces the static app in `dist/`. `npm test` runs the simulation checks.

## Interaction

- The **Plant** picker offers snake plants, rubber plants and succulents, each in small, medium and large sizes (nine variants). **Table** offers round and square tops in half and full size (four variants). Full tables are 2 m wide and 1.3 m tall; half size scales every dimension by 0.5. All additions are white and support the same grid dragging, rotation, suspension and removal controls as the original forms.

- **Bench** adds a slatted park bench; **Bird bath** adds a pedestal basin. Leave an upright bath quiet for several seconds and birds land on its rim, take turns hopping into the water, dip and flap, then return to the rim. Companions gather nearby; mouse proximity scares them away. Moving, hanging or removing the bath sends its visitors away.
- Select a hanging form to reveal its ceiling ring. Drag floor forms or that ring to reposition them on an invisible 0.5 m grid. Pull a hanging form itself and release to swing it physically. Cable length ranges from 1 to 7 m, subject to floor and object clearance.
- Click the water for a raised ripple; drag through it for a continuous wake. A stroke is sampled along its world-space path, including between mouse events. Release and the disturbance propagates, reflects, interferes and decays.
- **Wind power** and **Wind direction** drive the same field across water, grass, leaves and seed pods. Zero wind creates no new disturbances; stronger wind rolls the spiky pods and moves loose leaves. Pause in the water section pauses only water.
- Grass bends around nearby forms, loose matter and the cursor, then springs back. Flowers bend on the same flexible stems.
- Leave leaf piles alone for several seconds and birds arrive, fading in while flying down. They walk, peck at the physical leaves, and attract more birds nearby (up to five). Moving the mouse near a bird scares its nearby companions too; they fly away, fade out and are removed. A disturbed area must stay quiet before birds return. Dispersed or submerged leaf piles stop attracting birds.
- Right-drag to orbit, middle-drag to pan, scroll to zoom, and Recenter to restore the orthographic view. Two fingers pan/zoom on touch screens. The ground continues far beyond the view; there is no platform edge or invisible fence around the initial arrangement.
- With the canvas focused, arrow keys move a selected form or ceiling anchor, R rotates it, Delete removes it, and Escape cancels dragging.
- Light strength scales sunlight and ambient fill together from 0–200%. Dither scale runs from 0–5 screen pixels: zero restores continuous full-resolution shading, while larger cells pixelate silhouettes and shadows as well as shading. The Ink and Paper color pickers choose the palette. Two-tone ink uses exactly those two colors; switching it off adds shades between them. At zero dither the palette is bypassed and its controls are disabled, with your choices remembered until dithering returns. Show collision shapes exposes the editable form geometry.

## Rendering and physics

**Ground and lighting.** Four white ground surfaces surround a recessed pool and extend 4,096 m in every direction. There is no raised slab. Nearby physics patches are kept small for stable contact with tiny seed spikes, with outer patches continuing the ground. All physical surfaces use pure white base color, with neutral lighting and a white-paper default palette; shading and shadows provide their definition. One hemisphere light, one directional light, one 2048² shadow map and one Bayer dithering postprocess keep rendering simple. Shadows follow panning/zooming; meadow shadows refresh at 30 Hz. No bloom, ambient-occlusion pass or image blur is used.

**Solid forms and pendulums.** Rapier narrow-phase queries use analytic balls/cylinders, oriented boxes, an exact compound arch (24 crown wedges plus two legs) and a convex organic pebble. Continuous shape casts prevent translational tunneling. Hanging forms are actual dynamic bodies with gravity, top-mounted rope joints and contacts, stepped at 120 Hz with CCD. A pointer spring pulls without moving the ceiling anchor; releasing preserves momentum. The cable follows the body's rotated attachment and fades toward the high ceiling. Editor rotations are checked in 5-degree increments.

**Furniture and potted plants.** Table tops and four legs have separate analytic colliders, preserving the open underside. Pots, stems and individual solid leaves use matching convex components with baked transforms; foliage gaps remain open. Potted plants are rigid sculptural assemblies, while the meadow stems retain their soft-body simulation. The bench has separate slats, rails, arms and legs. The bird bath uses 48 convex bowl-wall wedges around an open basin, with a solid basin floor and pedestal. The initial arrangement includes a rubber plant, a small round table, a bench and a bird bath.

**Water.** A 129 × 129 physically displaced height field integrates the damped 2D wave equation at 120 Hz with reflecting boundaries, CFL-safe propagation and volume-offset correction. Localized pressure impulses and spatially sampled pointer wakes alter velocity, not an animated texture. Actual displaced positions and normals drive lighting and white specular highlights before dithering. The ripple control produces raised crests around 0.27 m in an otherwise calm pool; gentle default wind produces millimetre-scale surface motion. Loose leaves and pods receive simple buoyant support and water drag when entering the pool, and their entry injects a ripple.

**Bird-bath water.** Each upright basin has its own 33 × 33 circular masked wave solver with reflecting shoreline boundaries and damping. Wing flaps inject localized impulses into its displaced mesh and emit bounded, short-lived ballistic droplets. Bath water shares the global wind field. Hanging baths become inactive; moving or deleting a bath clears its visitors and water effects.

**Wind and soft foliage.** A coherent spatial wind field combines a direction with slow gusts. The meadow contains 18 sparse grass ribbons, two small daisies and one small dandelion. Each stem uses a single five-triangle tapered ribbon and four inertial nodes, a pinned root, rest-shape elasticity, damping and seven length-constraint iterations at 60 Hz. Shape-based contact projection bends it around solids; flower heads use larger tip contact radii. Broad-phase bounds reduce contact-query workload while Rapier supplies narrow-phase contact normals. Flower heads are small flat silhouettes anchored to the simulated tips (21–27 triangles), rather than spheres and individual volumetric petals. These are flexible simulated stems, not sine-wave vertex animations.

**Loose matter.** Four sparse patches each contain four individually spaced white leaves, about 0.13–0.20 m long, without stacking. Leaves use convex colliders. Three small spiky seed pods are about 0.21 m across, each with a 20-triangle core and eight triangular spikes (68 triangles total). Matching convex colliders follow the core and each spike. Air-relative drag is applied above the center of mass to produce rolling torque; friction and damping let the pods settle when wind stops.

**Birds.** Small white birds use one continuous extruded beak/head/body/tail silhouette, two simple flapping wings and flat legs, under 60 triangles per bird instead of multiple spheres. A seeded behavior system tracks quiet time around the actual physical leaf clusters. Birds prefer occupied calm piles, choose separated landing/walking targets, peck leaves with small physical impulses, and avoid solid forms. Arrival/departure paths and wingbeats are animated; opacity controls their fade, and departed meshes/materials are freed. Both ground-space and screen-space cursor proximity can trigger flight, including at elevated baths. Baths attract up to three visitors within the global five-bird limit; one bathes at a time while companions perch. Bathing, hops and wingbeats are behavioral animation, coupled to simulated ripples and droplets.

## Scope and limits

- Water is a surface-wave solver, not a volumetric fluid or breaking-wave solver. Loose-object buoyancy is an approximate coupling, not a full displaced-volume fluid solve.
- Grass uses segmented position-based dynamics with contact projection, not continuum finite elements. It does not model tearing or blade-to-blade self-collision. Leaves are lightweight rigid pieces, not deforming sheets.
- Bird flight and foraging are behavioral animation, not an aerodynamic simulation. Their ground navigation uses a small body clearance region, not per-feather collision geometry.
- Cable joints constrain length; the cable fibers do not collide, wrap around obstacles or bend independently.
- The organic form is convex; arbitrary imported concave assets are not supported by the current UI. Add explicit convex parts in `shapes.js` for new concave forms.
- Scene state is session-only. The editor caps forms at 40 and the bird colony at five.

## Source map

- `src/main.js`: rendering, controls, water mesh and integration.
- `src/shapes.js`, `src/furnishings.js`, `src/collision.js`: editable meshes, the plant/table catalog, and matching placement colliders.
- `src/pendulums.js`: Rapier world, solid ground, rope constraints and pointer pulling.
- `src/terrain.js`: open ground layout and stable physics patches.
- `src/waves.js`, `src/wind.js`: surface simulation and shared wind field.
- `src/grass.js`: elastic strands and shape contact projection.
- `src/birds.js`: flock behavior, foraging, rim perching, bathing, quiet-area timing and fade lifecycle.
- `src/birdbath.js`: circular basin water, splash impulses and ballistic droplets.
- `src/ecology.js`: meadow meshes, loose rigid bodies, foliage, flowers and birds.
- `src/nature-shapes.js`: minimal white grass, flower, bird and seed-pod geometry.
- `src/dither.js`: shared screen-pixel sampling and ordered luminance quantization, with a full-resolution bypass.
- `tests/`: collision, pendulum, wave, foliage, seed stability and bird lifecycle checks.

Three.js and Rapier are bundled locally. Fonts use Google Fonts with system fallbacks. No accounts, external scene data, textures or API keys are needed locally. Feature-detected WebMCP actions use the same validated scene operations as the controls.

References: [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer.html), [Rapier shapes](https://rapier.rs/docs/user_guides/javascript/colliders/), [Rapier scene queries](https://rapier.rs/docs/user_guides/javascript/scene_queries_intersection_test/).
