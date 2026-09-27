import test from 'node:test';
import assert from 'node:assert/strict';
import {BoardReplicator, localKey, keyPrefix} from '../src/net/board-replicator.js';
import {isValidObjectId} from '../src/net/protocol.js';

const SELF = 'a1b2c3d4-0000-4000-8000-000000000001';
const OTHER = 'b2c3d4e5-0000-4000-8000-000000000002';

function op(type, objectId, data) {
  return data === undefined ? {type, objectId} : {type, objectId, data};
}

test('localKey mints printable ids within the protocol limit and prefixes round-trip', () => {
  const key = localKey(SELF, 7);
  assert.equal(key, 'a1b2c3d4-000-7'); // first 12 chars of the identity + sequence
  assert.equal(isValidObjectId(key), true);
  assert.equal(keyPrefix(key), 'a1b2c3d4-000');
  // Long, dash-heavy identities still produce valid keys with stable prefixes.
  const long = localKey('aaaaaaaaaaaaaaaa-bbbb-cccc', 42);
  assert.equal(isValidObjectId(long), true);
  assert.equal(keyPrefix(long), long.slice(0, long.lastIndexOf('-')));
  assert.equal(keyPrefix('orphan7'), 'orphan7');
});

test('a local op is tracked pending; its own echo confirms it and applies nothing', () => {
  const board = new BoardReplicator(SELF);
  board.local(op('add', 'k-1', {type: 'bench'}));
  assert.equal(board.pendingCount, 1);
  assert.equal(board.receive(op('add', 'k-1', {type: 'bench'}), SELF, 1), 'skip');
  assert.equal(board.pendingCount, 0);
});

test('own echoes confirm in FIFO order, one per op', () => {
  const board = new BoardReplicator(SELF);
  board.local(op('add', 'k-1', {type: 'bench'}));
  board.local(op('update', 'k-1', {type: 'bench'}));
  board.local(op('update', 'k-2', {type: 'rug'}));
  assert.equal(board.receive(op('add', 'k-1'), SELF, 1), 'skip');
  assert.equal(board.receive(op('update', 'k-1'), SELF, 2), 'skip');
  assert.equal(board.pendingCount, 1); // k-2 still unconfirmed
  assert.equal(board.receive(op('update', 'k-2'), SELF, 3), 'skip');
  assert.equal(board.pendingCount, 0);
});

test('a remote op with no local pending applies and advances the revision', () => {
  const board = new BoardReplicator(SELF);
  assert.equal(board.receive(op('add', 'other-1', {type: 'bench'}), OTHER, 4), 'apply');
  assert.equal(board.revision, 4);
});

test('last-write-wins: a remote op for an object with an unconfirmed local op is skipped', () => {
  const board = new BoardReplicator(SELF);
  board.local(op('add', 'k-1', {type: 'bench'}));
  board.local(op('update', 'k-1', {type: 'bench'})); // local edit not yet echoed
  // The server relays an older remote write for the same object first.
  assert.equal(board.receive(op('update', 'k-1', {type: 'bench'}), OTHER, 5), 'skip');
  // Our echoes confirm one pending at a time, still skipping.
  assert.equal(board.receive(op('update', 'k-1'), SELF, 6), 'skip');
  assert.equal(board.receive(op('update', 'k-1'), SELF, 7), 'skip');
  // With nothing unconfirmed, a newer remote write for the object applies.
  assert.equal(board.receive(op('update', 'k-1', {type: 'bench'}), OTHER, 8), 'apply');
  assert.equal(board.revision, 8);
});

test('pending on one object never blocks remote ops for another object', () => {
  const board = new BoardReplicator(SELF);
  board.local(op('add', 'k-1', {type: 'bench'}));
  assert.equal(board.receive(op('add', 'other-9', {type: 'rug'}), OTHER, 2), 'apply');
});

test('an own echo with no pending op applies — the reconnect outbox flush case', () => {
  const board = new BoardReplicator(SELF);
  // Offline op queued, snapshot adoption cleared the tracker, outbox re-flushed.
  assert.equal(board.receive(op('update', 'k-1', {type: 'bench'}), SELF, 3), 'apply');
});

test('a rejected op drops the oldest pending entry so later ops stop being skipped', () => {
  const board = new BoardReplicator(SELF);
  board.local(op('remove', 'k-1'));
  board.local(op('update', 'k-1', {type: 'bench'}));
  board.local(op('add', 'k-2', {type: 'rug'}));
  assert.deepEqual(board.rejected(), op('remove', 'k-1'));
  assert.equal(board.pendingCount, 2);
  // The update to k-1 is still unconfirmed, so a remote k-1 op is still skipped.
  assert.equal(board.receive(op('update', 'k-1', {type: 'bench'}), OTHER, 2), 'skip');
  assert.deepEqual(board.rejected(), op('update', 'k-1', {type: 'bench'}));
  // Now k-1 has nothing unconfirmed — remote ops for it apply again.
  assert.equal(board.receive(op('update', 'k-1', {type: 'bench'}), OTHER, 3), 'apply');
  assert.deepEqual(board.rejected(), op('add', 'k-2', {type: 'rug'}));
  assert.equal(board.rejected(), null); // nothing pending — safe no-op
});

test('adopting a snapshot clears unconfirmed ops; later echoes still apply harmlessly', () => {
  const board = new BoardReplicator(SELF);
  board.local(op('add', 'k-1', {type: 'bench'}));
  board.local(op('remove', 'k-2'));
  board.adoptSnapshot();
  assert.equal(board.pendingCount, 0);
  assert.equal(board.receive(op('add', 'k-1'), SELF, 9), 'apply');
  assert.equal(board.revision, 9);
});

test('revision only moves forward across out-of-order arrivals', () => {
  const board = new BoardReplicator(SELF);
  board.receive(op('add', 'x-1', {}), OTHER, 5);
  board.receive(op('add', 'x-2', {}), OTHER, 3);
  assert.equal(board.revision, 5);
});
