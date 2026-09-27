import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_OP_TYPES,
  ERROR_CODES,
  LIMITS,
  applyBoardOp,
  decodeMessage,
  encodeMessage,
  isValidObjectId,
  isValidPlayerId,
  normalizeName,
  roleAtLeast,
  validateBoardOp,
  validateChat,
  validateClaim,
  validateHello,
  validateKick,
  validatePresence,
  validateRoleChange,
} from '../src/net/protocol.js';

const HELLO = { kind: 'hello', id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Meadow' };

test('every client kind decodes into its normalized shape', () => {
  const cases = [
    [HELLO, { kind: 'hello', id: HELLO.id, name: 'Meadow', token: undefined }],
    [{ kind: 'chat', text: '  hello   meadow  ' }, { kind: 'chat', text: 'hello meadow' }],
    [{ kind: 'boardOp', op: { type: 'add', objectId: 'form-7', data: { x: 1 } } }, { kind: 'boardOp', op: { type: 'add', objectId: 'form-7', data: { x: 1 } } }],
    [{ kind: 'boardOp', op: { type: 'remove', objectId: 'form-7' } }, { kind: 'boardOp', op: { type: 'remove', objectId: 'form-7' } }],
    [{ kind: 'claim', passphrase: 'open sesame' }, { kind: 'claim', passphrase: 'open sesame' }],
    [{ kind: 'roleChange', playerId: HELLO.id, role: 'editor' }, { kind: 'roleChange', playerId: HELLO.id, role: 'editor' }],
    [{ kind: 'kick', playerId: HELLO.id }, { kind: 'kick', playerId: HELLO.id }],
    [{ kind: 'ban', playerId: HELLO.id }, { kind: 'ban', playerId: HELLO.id }],
    [{ kind: 'presence', pose: { x: 1.5, y: 0, z: -2 } }, { kind: 'presence', pose: { x: 1.5, y: 0, z: -2 } }],
    [{ kind: 'presence', pose: { x: 0, y: 0, z: 0, yaw: Math.PI } }, { kind: 'presence', pose: { x: 0, y: 0, z: 0, yaw: Math.PI } }],
  ];
  for (const [raw, expected] of cases) {
    const decoded = decodeMessage(JSON.stringify(raw));
    assert.deepEqual(decoded, { ok: true, message: expected }, JSON.stringify(raw));
  }
});

test('decodeMessage works on bytes as well as strings', () => {
  const bytes = new TextEncoder().encode(JSON.stringify(HELLO));
  assert.equal(decodeMessage(bytes).ok, true);
  assert.equal(decodeMessage(new TextEncoder().encode('not json')).code, ERROR_CODES.MALFORMED);
});

test('malformed frames are rejected as MALFORMED', () => {
  for (const raw of ['not json', 'null', '42', '"a string"', '[]', '{}', JSON.stringify({ id: HELLO.id }), JSON.stringify({ kind: 7 })]) {
    const decoded = decodeMessage(raw);
    assert.deepEqual({ ok: decoded.ok, code: decoded.code }, { ok: false, code: ERROR_CODES.MALFORMED }, raw);
  }
  assert.deepEqual(decodeMessage(42), { ok: false, code: ERROR_CODES.MALFORMED, error: 'frame must be a string or bytes' });
});

test('oversized frames are rejected as OVERSIZE before parsing', () => {
  const big = 'x'.repeat(LIMITS.MAX_MESSAGE_BYTES + 1);
  assert.equal(decodeMessage(big).code, ERROR_CODES.OVERSIZE);
  const atLimit = JSON.stringify({ kind: 'chat', text: 'y'.repeat(LIMITS.MAX_MESSAGE_BYTES - 20) });
  assert.equal(decodeMessage(atLimit).code, ERROR_CODES.OVERSIZE);
});

test('unknown kinds are rejected as UNKNOWN_KIND', () => {
  for (const kind of ['teleport', 'Hello', '', 'welcome']) {
    assert.equal(decodeMessage(JSON.stringify({ kind })).code, ERROR_CODES.UNKNOWN_KIND, kind);
  }
});

test('hello validation: id shape, name hygiene, token type', () => {
  assert.equal(validateHello({ kind: 'hello', id: 'short' }).ok, false);
  assert.equal(validateHello({ kind: 'hello', id: 'has spaces!' }).ok, false);
  assert.equal(validateHello({ kind: 'hello', id: 'a'.repeat(65) }).ok, false);
  assert.equal(validateHello({ kind: 'hello', id: HELLO.id, name: '   ' }).ok, false); // blank after trim
  assert.equal(validateHello({ kind: 'hello', id: HELLO.id, name: '\u0007\u0008' }).ok, false); // control-only name
  assert.equal(validateHello({ kind: 'hello', id: HELLO.id, token: 42 }).ok, false);
  assert.equal(validateHello({ kind: 'hello', id: HELLO.id, extra: 1 }).ok, false);
  const normalized = validateHello({ kind: 'hello', id: HELLO.id, name: '  Ana   Bell \u0007 ' });
  assert.ok(normalized.ok);
  assert.equal(normalized.value.name, 'Ana Bell');
  assert.equal(validateHello({ kind: 'hello', id: HELLO.id, name: 'x'.repeat(33) }).ok, false);
});

test('chat validation clamps to the bubble budget', () => {
  assert.equal(validateChat({ kind: 'chat', text: '' }).ok, false);
  assert.equal(validateChat({ kind: 'chat', text: '   ' }).ok, false);
  assert.equal(validateChat({ kind: 'chat', text: 'x'.repeat(281) }).ok, false);
  assert.equal(validateChat({ kind: 'chat', text: 'x'.repeat(280) }).ok, true);
  assert.equal(validateChat({ kind: 'chat', text: 42 }).ok, false);
  assert.equal(validateChat({ kind: 'chat', text: 'ok', extra: 1 }).ok, false);
});

test('boardOp validation: verbs, object ids, data shape', () => {
  assert.equal(validateBoardOp({ kind: 'boardOp', op: { type: 'teleport', objectId: 'a' } }).ok, false);
  for (const verb of ['add', 'update']) {
    assert.equal(validateBoardOp({ kind: 'boardOp', op: { type: verb, objectId: 'a', data: {} } }).ok, true, verb);
  }
  assert.equal(validateBoardOp({ kind: 'boardOp', op: { type: 'remove', objectId: 'a' } }).ok, true); // remove carries no data
  assert.equal(validateBoardOp({ kind: 'boardOp', op: { type: 'add', objectId: 'a' } }).ok, false); // data required on add
  assert.equal(validateBoardOp({ kind: 'boardOp', op: { type: 'add', objectId: 'a', data: [] } }).ok, false);
  assert.equal(validateBoardOp({ kind: 'boardOp', op: { type: 'add', objectId: 'a', data: 42 } }).ok, false);
  assert.equal(validateBoardOp({ kind: 'boardOp', op: { type: 'remove', objectId: 'a', data: {} } }).ok, false); // data forbidden on remove
  assert.equal(validateBoardOp({ kind: 'boardOp', op: { type: 'add', objectId: 'a b' } }).ok, false);
  assert.equal(validateBoardOp({ kind: 'boardOp', op: 'nope' }).ok, false);
  assert.equal(validateBoardOp({ kind: 'boardOp', op: { type: 'add', objectId: 'a', data: {}, sneaky: 1 } }).ok, false);
});

test('claim, roleChange, kick and ban validate their targets', () => {
  assert.equal(validateClaim({ kind: 'claim', passphrase: '' }).ok, false);
  assert.equal(validateClaim({ kind: 'claim', passphrase: 'p'.repeat(129) }).ok, false);
  assert.equal(validateClaim({ kind: 'claim', passphrase: 'p'.repeat(128) }).ok, true);
  assert.equal(validateRoleChange({ kind: 'roleChange', playerId: HELLO.id, role: 'admin' }).ok, false); // admin only via claim
  assert.equal(validateRoleChange({ kind: 'roleChange', playerId: HELLO.id, role: 'owner' }).ok, false);
  assert.equal(validateRoleChange({ kind: 'roleChange', playerId: 'short', role: 'editor' }).ok, false);
  assert.equal(validateKick({ kind: 'kick', playerId: HELLO.id }).ok, true); // kind-agnostic: the envelope checks kind
  assert.equal(validateKick({ kind: 'kick', playerId: 'nope!' }).ok, false);
});

test('presence poses must be finite and bounded', () => {
  assert.equal(validatePresence({ kind: 'presence', pose: { x: 1e999, y: 0, z: 0 } }).ok, false); // Infinity
  assert.equal(validatePresence({ kind: 'presence', pose: { x: 0, y: 0, z: '0' } }).ok, false);
  assert.equal(validatePresence({ kind: 'presence', pose: { x: 0, y: 0, z: 0, yaw: NaN } }).ok, false);
  assert.equal(validatePresence({ kind: 'presence', pose: { x: 0, y: 0, z: 0, w: 1 } }).ok, false);
  assert.equal(validatePresence({ kind: 'presence', pose: [0, 0, 0] }).ok, false);
  assert.equal(validatePresence({ kind: 'presence', pose: { x: LIMITS.MAX_POSE_RANGE + 1, y: 0, z: 0 } }).ok, false);
});

test('id helpers accept uuids and reject junk', () => {
  assert.ok(isValidPlayerId('a1b2c3d4-0000-4000-8000-000000000001'));
  assert.ok(!isValidPlayerId('abc'));
  assert.ok(isValidObjectId('form-17'));
  assert.ok(!isValidObjectId('with space'));
  assert.ok(!isValidObjectId(''));
});

test('names are stripped of control characters and clamped', () => {
  assert.equal(normalizeName('  Ana\u0007Bell  '), 'AnaBell');
  assert.equal(normalizeName('a '.repeat(40)).length, LIMITS.MAX_NAME_CHARS);
  assert.equal(normalizeName(42), '');
});

test('encodeMessage serializes server kinds and refuses client kinds', () => {
  const text = encodeMessage({ kind: 'welcome', id: 'x', name: 'x', role: 'guest', token: 't', snapshot: { board: { objects: {}, revision: 0 }, players: [] } });
  assert.deepEqual(JSON.parse(text).kind, 'welcome');
  assert.throws(() => encodeMessage({ kind: 'hello' }), TypeError);
  assert.throws(() => encodeMessage({ kind: 'nope' }), TypeError);
  assert.throws(() => encodeMessage('hello'), TypeError);
});

test('role ranking gates editor and admin powers', () => {
  assert.ok(roleAtLeast('admin', 'editor'));
  assert.ok(roleAtLeast('editor', 'editor'));
  assert.ok(!roleAtLeast('guest', 'editor'));
  assert.ok(!roleAtLeast(undefined, 'guest'));
});

test('applyBoardOp is a pure last-write-wins reduce', () => {
  const empty = { objects: {}, revision: 0 };
  const added = applyBoardOp(empty, { type: 'add', objectId: 'form-1', data: { hue: 1 } });
  assert.ok(added.applied);
  assert.deepEqual(added.board, { objects: { 'form-1': { hue: 1 } }, revision: 1 });
  const updated = applyBoardOp(added.board, { type: 'update', objectId: 'form-1', data: { hue: 2 } });
  assert.deepEqual(updated.board.objects['form-1'], { hue: 2 });
  const removed = applyBoardOp(updated.board, { type: 'remove', objectId: 'form-1' });
  assert.deepEqual(removed.board.objects, {});
  assert.equal(removed.board.revision, 3);
  // purity: the input board is never mutated
  assert.deepEqual(added.board, { objects: { 'form-1': { hue: 1 } }, revision: 1 });
  // removing a missing object is a no-op
  const ghost = applyBoardOp(removed.board, { type: 'remove', objectId: 'form-1' });
  assert.equal(ghost.applied, false);
  assert.equal(ghost.board.revision, 3);
});

test('applyBoardOp defends against nullish boards', () => {
  const first = applyBoardOp(null, { type: 'add', objectId: 'x', data: {} });
  assert.ok(first.applied);
  assert.equal(first.board.revision, 1);
});
