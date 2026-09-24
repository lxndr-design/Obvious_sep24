import {defineConfig} from 'vite';
import {resolve} from 'node:path';

// Both pages must be declared here: Vite's default build input is only the root
// index.html, and a second .html left out of this map is silently dropped from dist/.
export default defineConfig({
 worker:{format:'es'}, // module worker with top-level await (RAPIER.init) — iife can't carry it
 build:{rollupOptions:{input:{
  main:resolve(import.meta.dirname,'index.html'),
  splash:resolve(import.meta.dirname,'splash.html'),
 }}},
});
