import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomServer } from '../server/index.js';
import { TestClient } from './ws-client-helper.js';

const A = 'a1b2c3d4-0000-4000-8000-000000000001';
const B = 'b2c3d4e5-0000-4000-8000-000000000002';
const PASSPHRASE = 'meadow-keeper';

test('two clients see each other, chat, replicate board ops, and the admin governs', async () => {
  const room = await createRoomServer({ adminPassphrase: PASSPHRASE, persistDelayMs: 500 }).init();
  await room.listen(0, '127.0.0.1');
  const url = `ws://127.0.0.1:${room.address().port}/ws`;
  try {
    // ---- both join; each gets a welcome with role + snapshot ----
    const ana = await TestClient.connect(url);
    const anaWelcome = await ana.hello({ id: A, name: 'Ana' });
    assert.equal(anaWelcome.role, 'guest');
    assert.deepEqual(anaWelcome.snapshot.players, [{ id: A, name: 'Ana', role: 'guest' }]);
    assert.deepEqual(anaWelcome.snapshot.board, { objects: {}, revision: 0 });

    const bo = await TestClient.connect(url);
    const boWelcome = await bo.hello({ id: B, name: 'Bo' });
    assert.equal(boWelcome.role, 'guest');
    assert.deepEqual(boWelcome.snapshot.players.map((p) => p.id).sort(), [A, B]);

    // ---- presence: ana sees bo join; bo saw ana already in the snapshot ----
    const join = await ana.next((m) => m.kind === 'presence' && m.event === 'join');
    assert.deepEqual(join.player, { id: B, name: 'Bo', role: 'guest' });

    // ---- ana claims admin ----
    ana.send({ kind: 'claim', passphrase: PASSPHRASE });
    await ana.next((m) => m.kind === 'roleChange' && m.role === 'admin');
    const anaRoleBroadcast = await bo.next((m) => m.kind === 'presence' && m.event === 'update');
    assert.equal(anaRoleBroadcast.player.role, 'admin');

    // ---- guest boardOp refused, then promoted and accepted ----
    bo.send({ kind: 'boardOp', op: { type: 'add', objectId: 'form-1', data: { kind: 'bench' } } });
    await bo.expectError('FORBIDDEN');
    ana.send({ kind: 'roleChange', playerId: B, role: 'editor' });
    await bo.next((m) => m.kind === 'roleChange' && m.role === 'editor');
    await ana.next((m) => m.kind === 'presence' && m.event === 'update' && m.player.id === B);

    // ---- board op replicates ----
    bo.send({ kind: 'boardOp', op: { type: 'add', objectId: 'form-1', data: { kind: 'bench', x: 3, z: -1 } } });
    const op = await ana.next((m) => m.kind === 'boardOp');
    assert.equal(op.by, B);
    assert.equal(op.revision, 1);
    assert.deepEqual(op.op.data, { kind: 'bench', x: 3, z: -1 });

    // ---- chat bubbles to the other client ----
    ana.send({ kind: 'chat', text: 'lovely meadow' });
    const chat = await bo.next((m) => m.kind === 'chat');
    assert.deepEqual({ from: chat.from, name: chat.name, text: chat.text }, { from: A, name: 'Ana', text: 'lovely meadow' });

    // ---- pose relay: bo moves, ana sees the move ----
    bo.send({ kind: 'presence', pose: { x: 2, y: 0, z: 5 } });
    const move = await ana.next((m) => m.kind === 'presence' && m.event === 'move');
    assert.equal(move.id, B);
    assert.deepEqual(move.pose, { x: 2, y: 0, z: 5 });

    // ---- transfer claim: bo takes admin, ana drops to editor ----
    bo.send({ kind: 'claim', passphrase: PASSPHRASE });
    await bo.next((m) => m.kind === 'roleChange' && m.role === 'admin');
    await ana.next((m) => m.kind === 'roleChange' && m.role === 'editor');
    ana.send({ kind: 'kick', playerId: B }); // editor cannot govern
    await ana.expectError('FORBIDDEN');

    // ---- bo (current admin) bans ana; ana is refused on reconnect ----
    bo.send({ kind: 'ban', playerId: A });
    await ana.expectError('BANNED');
    const comeback = await TestClient.connect(url);
    comeback.send({ kind: 'hello', id: A });
    await comeback.expectError('BANNED');
    await comeback.close();

    // ---- ana's removal was broadcast; the room continues with bo alone ----
    const leave = await bo.next((m) => m.kind === 'presence' && m.event === 'leave');
    assert.equal(leave.player.id, A);
    assert.deepEqual(room.snapshot().players, [{ id: B, name: 'Bo', role: 'admin' }]);

    await bo.close();
  } finally {
    await room.close();
  }
});
