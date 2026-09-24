// The only shared contract between the main thread and the sim worker. Both
// sides and the tests import from here so the schema cannot drift. Plain data
// only: arrays and typed buffers cross the boundary, never class instances.

export const POINTER_MODES=['attract','repel','off'];
export const IMPULSE_KINDS=['radial'];
export const BEHAVIORS=['none','float','orbit','wave'];
export const POSITION_STRIDE=3;
export const QUATERNION_STRIDE=4;
export const BYTES_PER_FLOAT=4;

const finite=n=>typeof n==='number'&&Number.isFinite(n);
const vec3=v=>Array.isArray(v)&&v.length===3&&v.every(finite);
const uint=n=>Number.isInteger(n)&&n>=0;

function fail(msg){throw new TypeError(`protocol: ${msg}`);}

function body(desc,index){
 if(typeof desc!=='object'||desc===null)fail(`bodies[${index}] must be an object`);
 const{id,preset,r,p,behavior}=desc;
 if(!uint(id))fail(`bodies[${index}].id must be a non-negative integer`);
 if(typeof preset!=='string'||!preset)fail(`bodies[${index}].preset must be a non-empty string`);
 if(!finite(r)||r<=0)fail(`bodies[${index}].r must be a positive number`);
 if(!vec3(p))fail(`bodies[${index}].p must be [x,y,z]`);
 if(behavior!==undefined&&!BEHAVIORS.includes(behavior))fail(`bodies[${index}].behavior must be one of ${BEHAVIORS.join('|')}`);
 return desc;
}

const CHECKS={
 init(msg){
  if(!Array.isArray(msg.bodies))fail('init.bodies must be an array');
  msg.bodies.forEach(body);
  if(msg.config!==undefined&&(typeof msg.config!=='object'||msg.config===null||Array.isArray(msg.config)))fail('init.config must be a plain object');
 },
 spawn(msg){
  if(!Array.isArray(msg.bodies)||msg.bodies.length===0)fail('spawn.bodies must be a non-empty array');
  msg.bodies.forEach(body);
 },
 despawn(msg){
  if(!Array.isArray(msg.ids)||msg.ids.length===0||!msg.ids.every(uint))fail('despawn.ids must be a non-empty array of non-negative integers');
 },
 config(msg){
  if(typeof msg.patch!=='object'||msg.patch===null||Array.isArray(msg.patch))fail('config.patch must be a plain object');
 },
 pointer(msg){
  if(!POINTER_MODES.includes(msg.mode))fail(`pointer.mode must be one of ${POINTER_MODES.join('|')}`);
  if(!vec3(msg.p))fail('pointer.p must be [x,y,z]');
  if(!finite(msg.strength))fail('pointer.strength must be a finite number');
  if(!finite(msg.radius)||msg.radius<=0)fail('pointer.radius must be positive');
 },
 impulse(msg){
  if(!IMPULSE_KINDS.includes(msg.kind))fail(`impulse.kind must be one of ${IMPULSE_KINDS.join('|')}`);
  if(!vec3(msg.p))fail('impulse.p must be [x,y,z]');
  if(!finite(msg.strength))fail('impulse.strength must be a finite number');
  if(!finite(msg.radius)||msg.radius<=0)fail('impulse.radius must be positive');
 },
 poses(msg){
  const{frame,count,positions,quaternions,sleep}=msg;
  if(!uint(frame))fail('poses.frame must be a non-negative integer');
  if(!uint(count))fail('poses.count must be a non-negative integer');
  const posBytes=count*POSITION_STRIDE*BYTES_PER_FLOAT;
  const quatBytes=count*QUATERNION_STRIDE*BYTES_PER_FLOAT;
  if(!(positions instanceof ArrayBuffer)||positions.byteLength!==posBytes)fail(`poses.positions must be an ArrayBuffer of ${posBytes} bytes`);
  if(!(quaternions instanceof ArrayBuffer)||quaternions.byteLength!==quatBytes)fail(`poses.quaternions must be an ArrayBuffer of ${quatBytes} bytes`);
  if(!(sleep instanceof Uint8Array)||sleep.length!==count)fail(`poses.sleep must be a Uint8Array of ${count} bytes`);
 },
 ready(){},
 error(msg){
  if(typeof msg.message!=='string'||!msg.message)fail('error.message must be a non-empty string');
 },
};

// Validates one protocol message in either direction; throws TypeError on a
// schema violation so a bad caller fails loudly at the boundary, not silently
// three frames later.
export function validateMessage(msg){
 if(typeof msg!=='object'||msg===null||typeof msg.type!=='string')fail('message must be an object with a type');
 const check=CHECKS[msg.type];
 if(!check)fail(`unknown message type: ${msg.type}`);
 check(msg);
 return msg;
}

// Repo-relative files allowed to import Rapier — the sim world lives there.
// The module-graph walk test asserts nothing else in the splash layer ever
// does. The sim slice lands these files; until then the allowlist is empty.
export const WORKER_SIDE_FILES=[
 'src/splash/sim/sim-worker.js',
 'src/splash/sim/splash-world.js',
];
