# Whitewater

A runnable Three.js isometric spatial playground. `npm install` and `npm run dev` start it locally; `npm run build` produces self-contained static application assets in `dist/`. `npm test` checks collision geometry and water simulation.

## Interaction

- Drag floor forms or the small ring at the top of a hanging cable: the floor form or entire suspended assembly snaps to an invisible 0.5 m grid. Occupied paths and positions are rejected.
- Pull a hanging form itself to displace it freely while its ceiling anchor stays fixed. Release to let gravity and momentum swing it naturally. Escape restores the pre-drag pose.
- Select a form to rotate it, remove it, suspend it, or adjust cable length. Cables fade between 4.8 m and 8.4 m above the floor.
- Click or drag on water to inject impulses. Adjust wave energy, pause/resume, or generate a ripple.
- Right-drag to orbit, middle-drag to pan, and scroll to zoom; Recenter restores the true isometric orthographic camera. On touch screens, use two fingers to pan/zoom.
- With canvas focused and a form selected, arrow keys move the form or its ceiling anchor one grid cell, R rotates, Delete removes, and Escape cancels dragging.
- Toggle collision shapes to inspect geometry; select Two-tone ink for the stronger one-bit appearance.

## Implementation

- **Rendering:** Three.js WebGL2, one shadow-casting directional light, one hemisphere light, a 2048² shadow map cached until a light or object changes and one ordered Bayer dithering postprocess. No bloom, ambient-occlusion pass or image blur. The display uses a restrained green-black/paper palette. The standard mode uses six luminance intervals; ink mode uses only two colors. Dither scale is adjustable in drawing-buffer pixels.
- **Collisions:** Rapier's WASM narrow-phase shape queries, independent of axis-aligned bounding boxes. Balls and cylinders are analytic; boxes use oriented cuboids. The arch is an exact compound of 24 convex crown wedges and two legs matching the render geometry, so its opening stays empty. The organic pebble is rendered as the same convex hull used for collision. Continuous shape casts prevent tunneling during translation; rotation is checked in 5-degree increments. Floor extents and the open pool are also enforced. Broad bounds only constrain the finite stage perimeter.
- **Water:** 97 × 97 height field integrating the damped 2D wave equation at 120 Hz, with a CFL-safe speed, reflecting boundaries, volume-offset correction, localized impulses and wind forcing. Actual displaced vertices and recomputed normals drive a stylized reflection treatment, then the shared dither pass. Simulation speed does not depend on rendering frame rate; a long frame is capped to avoid unstable catch-up.
- **Suspension:** Rapier dynamic rigid bodies, gravity, top-mounted rope joints and shape-matched contacts integrated at 120 Hz with CCD. A damped spring follows the pointer while a form is pulled; releasing removes the force without clearing momentum. Ceiling anchors stay at 8.5 m. Dragging their ring moves the complete assembly on the grid, temporarily holds the bob, and resumes dynamics on release. Cable geometry joins the actual rotated top attachment to the anchor and retains the upward opacity fade. Light air/angular damping makes swings settle.
- **Limits:** This is a surface-wave model, not a volumetric fluid solver; it does not model breaking waves, buoyancy or fluid-solid coupling. The supplied organic form is convex. Arbitrary imported concave solids are not supported by the current UI; add explicit convex pieces in `shapes.js` for more concave authored forms. Editor rotation uses discrete intermediate checks, not continuous angular CCD. Cable length is constrained by a rope joint; cables do not collide, wrap around objects, or simulate flexible fibers. Scene state is session-only. Max 40 forms keeps the interactive narrow-phase workload bounded.

## Layout

- `src/main.js`: scene, lighting, cables, controls and accessible UI integration.
- `src/shapes.js`: mesh and collision geometry defined together.
- `src/collision.js`: shape overlap, sweep and placement constraints.
- `src/waves.js`: pure fixed-step water simulation.
- `src/pendulums.js`: rigid bodies, rope joints, pointer spring and ceiling-anchor edits.
- `src/dither.js`: single-pass luminance quantization shader.
- `tests/simulation.test.js`: geometric and water regression checks.
- `tests/pendulums.test.js`: swing trajectories, collisions, anchor transforms, release/cancel behavior, constraint lifetime and frame-rate independence.

Three.js and Rapier are bundled locally with the app. Fonts use Google Fonts with system fallbacks. No accounts, external scene data, textures, or API keys are needed locally. Optional feature-detected WebMCP actions use the same validated scene operations as the controls.

References: [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer.html), [Rapier shapes](https://rapier.rs/docs/user_guides/javascript/colliders/), [Rapier shape queries](https://rapier.rs/docs/user_guides/javascript/scene_queries_intersection_test/).
