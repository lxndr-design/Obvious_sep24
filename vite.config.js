import {defineConfig} from 'vite';
import {resolve} from 'node:path';

// Both pages must be declared here: Vite's default build input is only the root
// index.html, and a second .html left out of this map is silently dropped from dist/.
//
// Chunk-size decision (resolves the >500kB build warning by decision, not by
// splitting further): the large chunks each carry one irreducible payload.
// `physics-rapier` and `sim-worker` embed the Rapier WASM — the compat package
// inlines it as base64 inside a single JS module, so no bundler can split it.
// `three` is the shared three.js vendor chunk. manualChunks names the
// main-thread physics chunk explicitly so birdbath app-code edits keep the
// multi-MB rapier chunk cached instead of re-hashing it. None of this sits on
// the splash critical path: the splash page loads three + the splash chunk
// only; Rapier ships exclusively inside the async sim-worker chunk behind the
// preloader; the birdbath entries load physics-rapier as before.
export default defineConfig({
 worker:{format:'es'}, // module worker with top-level await (RAPIER.init) — iife can't carry it
 build:{
  chunkSizeWarningLimit:2600, // WASM-embedded rapier chunks; see the decision note above
  rollupOptions:{
   input:{
    main:resolve(import.meta.dirname,'index.html'),
    splash:resolve(import.meta.dirname,'splash.html'),
   },
   output:{
    manualChunks:{
     three:['three'],
     'physics-rapier':['@dimforge/rapier3d-compat'],
    },
   },
  },
 },
});
