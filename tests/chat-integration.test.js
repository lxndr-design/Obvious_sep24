import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomServer } from '../server/index.js';
import { TestClient } from './ws-client-helper.js';

const A = 'a1b2c3d4-0000-4000-8000-000000000001';
const B = 'b2c3d4e5-0000-4000-8000-000000000002';

// Chat relay for U3 bubbles: every role may chat (guests included), the server
// broadcasts to everyone — the sender included, so the author's own bubble
// appears above their entity — and rejected payloads keep the connection.
test('two clients relay chat with sender echo and guests may chat', async () => {
  const room = await createRoomServer({}).init();
  await room.listen(0, '127.0.0.1');
  const url = `ws://127.0.0.1:${room.address().port}/ws`;
  try {
    const ana = await TestClient.connect(url);
    const anaWelcome = await ana.hello({ id: A, name: 'Ana' });
    assert.equal(anaWelcome.role, 'guest');

    const bo = await TestClient.connect(url);
    await bo.hello({ id: B, name: 'Bo' });
    await ana.next((m) => m.kind === 'presence' && m.event === 'join');

    // A guest (Ana, never promoted) chats; Bo receives it attributed.
    ana.send({ kind: 'chat', text: '  lovely   meadow\n' });
    const atBo = await bo.next((m) => m.kind === 'chat');
    assert.equal(atBo.from, A);
    assert.equal(atBo.name, 'Ana');
    assert.equal(atBo.text, 'lovely meadow');

    // Sender echo: the author's own client also gets the line (self-bubble).
    const atAna = await ana.next((m) => m.kind === 'chat');
    assert.deepEqual({ from: atAna.from, text: atAna.text }, { from: A, text: 'lovely meadow' });

    // An empty line is a payload error, not a relay — and the connection survives.
    ana.send({ kind: 'chat', text: '   ' });
    await ana.expectError('INVALID');
    ana.send({ kind: 'chat', text: 'still here' });
    const alive = await bo.next((m) => m.kind === 'chat');
    assert.equal(alive.text, 'still here');
  } finally {
    await room.close();
  }
});
