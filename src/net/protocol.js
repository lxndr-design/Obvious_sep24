// Shared realtime protocol for the Eternity multi-user room.
// Pure module — no Node builtins, no DOM — so the browser client (U2+) and the
// server (server/index.js) validate the exact same message shapes.

export const CLIENT_KINDS = ['hello', 'chat', 'boardOp', 'claim', 'roleChange', 'kick', 'ban', 'presence', 'mintLink'];
export const SERVER_KINDS = ['welcome', 'presence', 'chat', 'boardOp', 'roleChange', 'error', 'shareLink'];
export const ROLES = ['guest', 'editor', 'admin'];
// Roles a share link can carry (U4). Admin never travels by link — it
// transfers only via passphrase claim on the server.
export const INVITE_ROLES = ['editor', 'guest'];
export const BOARD_OP_TYPES = ['add', 'update', 'remove'];

export const LIMITS = {
  MAX_MESSAGE_BYTES: 256 * 1024,
  MAX_NAME_CHARS: 32,
  MAX_CHAT_CHARS: 280,
  MAX_PASSPHRASE_CHARS: 128,
  MAX_TOKEN_CHARS: 512,
  MAX_ID_CHARS: 64,
  MAX_BOARD_OBJECTS: 4096,
  MAX_POSE_RANGE: 4096,
};

export const ERROR_CODES = {
  MALFORMED: 'MALFORMED', // not parseable JSON / not an object
  OVERSIZE: 'OVERSIZE', // frame over LIMITS.MAX_MESSAGE_BYTES
  UNKNOWN_KIND: 'UNKNOWN_KIND', // kind outside the protocol
  INVALID: 'INVALID', // envelope fine, payload failed its schema
  HELLO_REQUIRED: 'HELLO_REQUIRED', // spoke before hello
  FORBIDDEN: 'FORBIDDEN', // role matrix rejection
  CLAIM_REJECTED: 'CLAIM_REJECTED', // wrong passphrase / none configured
  KICKED: 'KICKED',
  BANNED: 'BANNED',
  REPLACED: 'REPLACED', // same identity joined from another connection
};

const ROLE_RANK = { guest: 0, editor: 1, admin: 2 };

export function roleAtLeast(role, needed) {
  return (ROLE_RANK[role] ?? -1) >= ROLE_RANK[needed];
}

// Player identity: client-minted UUID (spec) — accept UUID-shaped url-safe strings.
export function isValidPlayerId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

// Scene object ids come from the app's object records; printable, no whitespace.
export function isValidObjectId(id) {
  return typeof id === 'string' && id.length >= 1 && id.length <= LIMITS.MAX_ID_CHARS && /^[\x21-\x7E]+$/.test(id);
}

// Display names: control characters stripped, whitespace collapsed, clamped.
export function normalizeName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.MAX_NAME_CHARS);
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(error) {
  return { ok: false, error };
}

function pass(value) {
  return { ok: true, value };
}

function checkFields(message, allowed) {
  for (const key of Object.keys(message)) {
    if (!allowed.includes(key)) return `unknown field "${key}"`;
  }
  return null;
}

export function validateHello(m) {
  const bad = checkFields(m, ['kind', 'id', 'name', 'token']);
  if (bad) return fail(bad);
  if (!isValidPlayerId(m.id)) return fail('id must be 8-64 url-safe characters');
  if (m.name !== undefined && (typeof m.name !== 'string' || m.name.length > LIMITS.MAX_NAME_CHARS || normalizeName(m.name) === '')) {
    return fail(`name, when present, must be a string of 1-${LIMITS.MAX_NAME_CHARS} usable characters`);
  }
  if (m.token !== undefined && (typeof m.token !== 'string' || m.token.length === 0 || m.token.length > LIMITS.MAX_TOKEN_CHARS)) return fail('token must be a non-empty string');
  return pass({ id: m.id, name: normalizeName(m.name), token: m.token });
}

export function validateChat(m) {
  const bad = checkFields(m, ['kind', 'text']);
  if (bad) return fail(bad);
  if (typeof m.text !== 'string') return fail('text must be a string');
  const text = m.text.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  if (text.length < 1 || text.length > LIMITS.MAX_CHAT_CHARS) return fail(`text must be 1-${LIMITS.MAX_CHAT_CHARS} characters`);
  return pass({ text });
}

export function validateBoardOp(m) {
  const bad = checkFields(m, ['kind', 'op']);
  if (bad) return fail(bad);
  const op = m.op;
  if (!isPlainObject(op)) return fail('op must be an object');
  const opBad = checkFields(op, ['type', 'objectId', 'data']);
  if (opBad) return fail(`op.${opBad}`);
  if (!BOARD_OP_TYPES.includes(op.type)) return fail(`op.type must be one of ${BOARD_OP_TYPES.join(', ')}`);
  if (!isValidObjectId(op.objectId)) return fail('op.objectId must be 1-64 printable characters');
  if (op.type === 'remove') {
    if (op.data !== undefined) return fail('op.data is not allowed on remove');
    return pass({ op: { type: op.type, objectId: op.objectId } });
  }
  if (!('data' in op)) return fail(`op.data is required on ${op.type}`);
  if (!isPlainObject(op.data)) return fail('op.data must be a plain object');
  return pass({ op: { type: op.type, objectId: op.objectId, data: op.data } });
}

export function validateClaim(m) {
  const bad = checkFields(m, ['kind', 'passphrase']);
  if (bad) return fail(bad);
  if (typeof m.passphrase !== 'string' || m.passphrase.length < 1 || m.passphrase.length > LIMITS.MAX_PASSPHRASE_CHARS) {
    return fail(`passphrase must be 1-${LIMITS.MAX_PASSPHRASE_CHARS} characters`);
  }
  return pass({ passphrase: m.passphrase });
}

export function validateRoleChange(m) {
  const bad = checkFields(m, ['kind', 'playerId', 'role']);
  if (bad) return fail(bad);
  if (!isValidPlayerId(m.playerId)) return fail('playerId must be 8-64 url-safe characters');
  if (!['editor', 'guest'].includes(m.role)) return fail('role must be "editor" or "guest" — admin transfers only via claim');
  return pass({ playerId: m.playerId, role: m.role });
}

function validatePlayerTarget(m) {
  const bad = checkFields(m, ['kind', 'playerId']);
  if (bad) return fail(bad);
  if (!isValidPlayerId(m.playerId)) return fail('playerId must be 8-64 url-safe characters');
  return pass({ playerId: m.playerId });
}

export const validateKick = validatePlayerTarget;
export const validateBan = validatePlayerTarget;

// Share-link minting (U4): admins only (server enforces), role constrained to
// INVITE_ROLES. mintLink has no fields beyond kind+role — links are identical
// for everyone, revocation is the role matrix, not per-link secrets.
export function validateMintLink(m) {
  const bad = checkFields(m, ['kind', 'role']);
  if (bad) return fail(bad);
  if (!INVITE_ROLES.includes(m.role)) return fail(`role must be one of ${INVITE_ROLES.join(', ')} — admin transfers only via passphrase claim`);
  return pass({ role: m.role });
}

function isValidPoseNumber(v, limit) {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
}

// Client → server presence carries the sender's own avatar pose.
export function validatePresence(m) {
  const bad = checkFields(m, ['kind', 'pose']);
  if (bad) return fail(bad);
  const pose = m.pose;
  if (!isPlainObject(pose)) return fail('pose must be an object');
  const poseBad = checkFields(pose, ['x', 'y', 'z', 'yaw']);
  if (poseBad) return fail(`pose.${poseBad}`);
  for (const axis of ['x', 'y', 'z']) {
    if (!isValidPoseNumber(pose[axis], LIMITS.MAX_POSE_RANGE)) return fail(`pose.${axis} must be a finite number`);
  }
  if (pose.yaw !== undefined && !isValidPoseNumber(pose.yaw, Math.PI * 4)) return fail('pose.yaw must be a finite number');
  return pass({ pose: { x: pose.x, y: pose.y, z: pose.z, ...(pose.yaw === undefined ? {} : { yaw: pose.yaw }) } });
}

const CLIENT_VALIDATORS = {
  hello: validateHello,
  chat: validateChat,
  boardOp: validateBoardOp,
  claim: validateClaim,
  roleChange: validateRoleChange,
  kick: validateKick,
  ban: validateBan,
  presence: validatePresence,
  mintLink: validateMintLink,
};

// Wire gate for the server: raw frame → validated message.
// Envelope failures (oversize/malformed/unknown kind) carry a `code`;
// payload failures are INVALID with a human-readable `error`.
export function decodeMessage(data) {
  let text;
  if (typeof data === 'string') text = data;
  else if (data instanceof Uint8Array) text = new TextDecoder().decode(data);
  else return { ok: false, code: ERROR_CODES.MALFORMED, error: 'frame must be a string or bytes' };
  if (new TextEncoder().encode(text).length > LIMITS.MAX_MESSAGE_BYTES) {
    return { ok: false, code: ERROR_CODES.OVERSIZE, error: `frame exceeds ${LIMITS.MAX_MESSAGE_BYTES} bytes` };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: ERROR_CODES.MALFORMED, error: 'frame is not valid JSON' };
  }
  if (!isPlainObject(parsed)) return { ok: false, code: ERROR_CODES.MALFORMED, error: 'message must be a JSON object' };
  if (typeof parsed.kind !== 'string') return { ok: false, code: ERROR_CODES.MALFORMED, error: 'message.kind must be a string' };
  if (!CLIENT_KINDS.includes(parsed.kind)) return { ok: false, code: ERROR_CODES.UNKNOWN_KIND, error: `unknown kind "${parsed.kind}"` };
  const result = CLIENT_VALIDATORS[parsed.kind](parsed);
  if (!result.ok) return { ok: false, code: ERROR_CODES.INVALID, error: result.error };
  return { ok: true, message: { kind: parsed.kind, ...result.value } };
}

// Server-side builder: rejects unknown kinds loudly rather than sending junk.
export function encodeMessage(message) {
  if (!isPlainObject(message) || typeof message.kind !== 'string') throw new TypeError('message must be an object with a kind');
  if (!SERVER_KINDS.includes(message.kind)) throw new TypeError(`cannot encode non-server kind "${message.kind}"`);
  return JSON.stringify(message);
}

// Pure last-write-wins board reduce. Input is never mutated.
export function applyBoardOp(board, op) {
  const objects = board?.objects ?? {};
  if (op.type === 'remove' && !(op.objectId in objects)) return { board, applied: false };
  if (Object.keys(objects).length >= LIMITS.MAX_BOARD_OBJECTS && !(op.objectId in objects) && op.type !== 'remove') {
    return { board, applied: false };
  }
  const nextObjects = { ...objects };
  if (op.type === 'remove') delete nextObjects[op.objectId];
  else nextObjects[op.objectId] = op.data;
  return { board: { objects: nextObjects, revision: (board?.revision ?? 0) + 1 }, applied: true };
}
