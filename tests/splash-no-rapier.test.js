import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WORKER_SIDE_FILES} from '../src/splash/sim/protocol.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const RAPIER=/rapier/i;
// Repo-relative paths allowed to import Rapier — the sim world lives there.
const workerSide=new Set(WORKER_SIDE_FILES);

function walk(dir,acc=[]){
 for(const e of readdirSync(dir)){
  const p=join(dir,e);
  if(statSync(p).isDirectory())walk(p,acc);
  else acc.push(p);
 }
 return acc;
}
function specifiers(source){
 const out=[];
 const patterns=[
  /import\s[^;'"]*?from\s*['"]([^'"]+)['"]/g, // import {a} from '...'
  /import\s*['"]([^'"]+)['"]/g, // bare side-effect import
  /export\s[^;'"]*?from\s*['"]([^'"]+)['"]/g, // re-exports
  /import\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import
  /new\s+URL\(\s*['"]([^'"]+)['"]/g, // worker construction edge
 ];
 for(const re of patterns){
  let m;
  while((m=re.exec(source)))out.push(m[1]);
 }
 return out;
}
// Strip /*…*/ blocks and //-line comments before text checks: the rule bans
// Rapier *code*, and doc comments naming the policy are fine. A conservative
// strip is safe for this entry's graph (no '//' inside string literals), and
// any real import still matches.
function stripComments(source){
 return source.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/(^|[^:])\/\/[^\n]*/g,'$1');
}
const relOf=file=>file.slice(root.length+1);

// The real guard: every module reachable from the splash entry — through
// static imports, dynamic imports and worker-URL edges — stays Rapier-free.
test('the splash main-thread module graph never imports Rapier',()=>{
 const workerSideAbs=new Set([...workerSide].map(rel=>join(root,rel)));
 const seen=new Set();
 const queue=[join(root,'src/splash-entry.js')];
 while(queue.length){
  const file=queue.pop();
  if(seen.has(file))continue;
  seen.add(file);
  if(workerSideAbs.has(file))continue; // worker-side modules are exempt by contract
  const rel=relOf(file);
  assert.equal(existsSync(file),true,`missing module: ${rel}`);
  const source=stripComments(readFileSync(file,'utf8'));
  assert.equal(RAPIER.test(source),false,`${rel} must not reference Rapier on the main thread`);
  for(const spec of specifiers(source)){
   if(!spec.startsWith('.'))continue; // bare packages (three) are fine
   queue.push(resolve(dirname(file),spec));
  }
 }
 // Sanity: the walk actually covered the SplashKit core, not a trivial subgraph.
 assert.ok([...seen].some(f=>f.endsWith('splashkit.js')),'module graph must include splashkit.js');
});

test('outside the worker-side allowlist, no file under src/splash touches Rapier',()=>{
 for(const file of walk(join(root,'src/splash'))){
  const rel=relOf(file);
  if(workerSide.has(rel))continue;
  assert.equal(RAPIER.test(stripComments(readFileSync(file,'utf8'))),false,`${rel} must not reference Rapier`);
 }
 // Allowlist hygiene: worker-side files live under sim/ only.
 for(const rel of workerSide)assert.ok(rel.startsWith('src/splash/sim/'),`worker-side allowlist entry out of place: ${rel}`);
});
