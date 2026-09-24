import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRoomServer, signToken, verifyToken } from '../server/index.js';
import { LIMITS } from '../src/net/protocol.js';
import { TestClient } from './ws-client-helper.js';

const A = 'a1b2c3d4-0000-4000-8000-000000000001';
const B = 'b2c3d4e5-0000-4000-8000-000000000002';
const C = 'c3d4e5f6-0000-4000-8000-000000000003';
const PASSPHRASE = 'meadow-keeper';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eternity-room-'));

function makeRoom(options = {}) {
  return createRoomServer({ adminPassphrase: PASSPHRASE, ...options });
}

async function startRoom(options = {}) {
  const room = await makeRoom(options).init();
  await room.listen(0, '127.0.0.1');
  return { room, url: `ws://127.0.0.1:${room.address().port}/ws` };
}

test('token helpers sign, verify, and reject tampering', () => {
  const secret = 's3cret';
  const token = signToken(secret, A, 1_000);
  assert.deepEqual(verifyToken(secret, token, 2_000), { ok: true, id: A });
  assert.equal(verifyToken(secret, token, 1_000 + 7 * 24 * 3600e3 + 1).ok, false); // expired
  const flipped = `${token.slice(0, -1)}${token.slice(-1) === '0' ? '1' : '0'}`;
  assert.equal(verifyToken(secret, flipped, 2_000).ok, false);
  assert.equal(verifyToken('other-secret', token, 2_000).ok, false);
  assert.equal(verifyToken(secret, 'v1.only.two.parts', 2_000).ok, false);
  assert.equal(verifyToken(secret, `${token}extra`, 2_000).ok, false);
});

test('claim flow: correct passphrase becomes admin, wrong one is rejected', async () => {
  const { room, url } = await startRoom();
  try {
    const admin = await TestClient.connect(url);
    const welcome = await admin.hello({ id: A, name: 'Keeper' });
    assert.equal(welcome.role, 'guest');
    assert.ok(welcome.token);
    admin.send({ kind: 'claim', passphrase: 'wrong guess' });
    await admin.expectError('CLAIM_REJECTED');
    admin.send({ kind: 'claim', passphrase: PASSPHRASE });
    const promoted = await admin.next((m) => m.kind === 'roleChange');
    assert.equal(promoted.role, 'admin');
    await admin.close();
  } finally {
    await room.close();
  }
});

test('claim without a configured passphrase is rejected, not a crash', async () => {
  const room = await makeRoom({ adminPassphrase: '' }).init();
  await room.listen(0, '127.0.0.1');
  const url = `ws://127.0.0.1:${room.address().port}/ws`;
  try {
    const client = await TestClient.connect(url);
    await client.hello({ id: A });
    client.send({ kind: 'claim', passphrase: 'anything' });
    await client.expectError('CLAIM_REJECTED');
    await client.close();
  } finally {
    await room.close();
  }
});

test('a second passphrase claim transfers admin and demotes the old admin', async () => {
  const { room, url } = await startRoom();
  try {
    const first = await TestClient.connect(url);
    await first.hello({ id: A, name: 'First' });
    first.send({ kind: 'claim', passphrase: PASSPHRASE });
    await first.next((m) => m.kind === 'roleChange' && m.role === 'admin');
    const second = await TestClient.connect(url);
    await second.hello({ id: B, name: 'Second' });
    second.send({ kind: 'claim', passphrase: PASSPHRASE });
    await second.next((m) => m.kind === 'roleChange' && m.role === 'admin');
    const demoted = await first.next((m) => m.kind === 'roleChange');
    assert.equal(demoted.role, 'editor');
    assert.equal(demoted.playerId, A);
    await first.close();
    await second.close();
  } finally {
    await room.close();
  }
});

test('role matrix: guests cannot edit or govern, editors can edit, admins can govern', async () => {
  const { room, url } = await startRoom();
  try {
    const admin = await TestClient.connect(url);
    await admin.hello({ id: A, name: 'Admin' });
    admin.send({ kind: 'claim', passphrase: PASSPHRASE });
    await admin.next((m) => m.kind === 'roleChange' && m.role === 'admin');

    const editor = await TestClient.connect(url);
    const editorWelcome = await editor.hello({ id: B, name: 'Editor' });
    assert.equal(editorWelcome.role, 'guest');

    // guest cannot boardOp, roleChange, kick, ban
    editor.send({ kind: 'boardOp', op: { type: 'add', objectId: 'form-1', data: { hue: 1 } } });
    await editor.expectError('FORBIDDEN');
    editor.send({ kind: 'roleChange', playerId: B, role: 'editor' });
    await editor.expectError('FORBIDDEN');
    editor.send({ kind: 'kick', playerId: A });
    await editor.expectError('FORBIDDEN');
    editor.send({ kind: 'ban', playerId: A });
    await editor.expectError('FORBIDDEN');

    // admin promotes the guest; the editor can now edit and the op is relayed
    admin.send({ kind: 'roleChange', playerId: B, role: 'editor' });
    const promoted = await editor.next((m) => m.kind === 'roleChange');
    assert.equal(promoted.role, 'editor');
    editor.send({ kind: 'boardOp', op: { type: 'add', objectId: 'form-1', data: { hue: 7 } } });
    const op = await admin.next((m) => m.kind === 'boardOp');
    assert.equal(op.revision, 1);
    assert.deepEqual(op.op.data, { hue: 7 });
    assert.equal(op.by, B);

    // the admin role itself cannot be reassigned or removed via roleChange
    admin.send({ kind: 'roleChange', playerId: A, role: 'guest' });
    await admin.expectError('INVALID');
    await editor.close();
    await admin.close();
  } finally {
    await room.close();
  }
});

test('speaking before hello earns HELLO_REQUIRED; payload errors keep the socket, framing errors close it', async () => {
  const room = await makeRoom().init();
  await room.listen(0, '127.0.0.1');
  const url = `ws://127.0.0.1:${room.address().port}/ws`;
  try {
    const early = await TestClient.connect(url);
    early.send({ kind: 'chat', text: 'early bird' });
    await early.expectError('HELLO_REQUIRED');
    await early.close();

    const guest = await TestClient.connect(url);
    await guest.hello({ id: B });
    guest.send({ kind: 'chat', text: '' }); // payload error — connection survives
    await guest.expectError('INVALID');
    guest.send({ kind: 'teleport' }); // unknown kind — closed
    await guest.expectError('UNKNOWN_KIND');
    await guest.close();

    const broken = await TestClient.connect(url);
    broken.raw('this is not json');
    await broken.expectError('MALFORMED'); // framing error — the server closes
    await broken.close();

    // framing-level errors close the socket, so each probe gets a fresh connection
    // and the oversize frame is the FIRST frame it sends
    const oversized = await TestClient.connect(url);
    oversized.raw('x'.repeat(LIMITS.MAX_MESSAGE_BYTES + 1));
    await oversized.expectError('OVERSIZE');
    await oversized.close();
  } finally {
    await room.close();
  }
});

test('the same identity joining twice replaces the older connection', async () => {
  const { room, url } = await startRoom();
  try {
    const first = await TestClient.connect(url);
    await first.hello({ id: A, name: 'Tab one' });
    const second = await TestClient.connect(url);
    await second.hello({ id: A, name: 'Tab two' });
    await first.expectError('REPLACED');
    const snapshot = room.snapshot();
    assert.equal(snapshot.players.length, 1);
    assert.equal(snapshot.players[0].name, 'Tab two');
    await first.close();
    await second.close();
  } finally {
    await room.close();
  }
});

test('banned identities are refused at hello and the ban survives a restart', async () => {
  const statePath = path.join(tmp, 'ban-state.json');
  const first = await startRoom({ statePath });
  try {
    const admin = await TestClient.connect(first.url);
    await admin.hello({ id: A });
    admin.send({ kind: 'claim', passphrase: PASSPHRASE });
    await admin.next((m) => m.kind === 'roleChange' && m.role === 'admin');
    const pest = await TestClient.connect(first.url);
    await pest.hello({ id: C });
    admin.send({ kind: 'ban', playerId: C });
    await pest.expectError('BANNED');
    const rejoin = await TestClient.connect(first.url); // same process, already banned
    rejoin.send({ kind: 'hello', id: C });
    await rejoin.expectError('BANNED');
    await rejoin.close();
    await admin.close();
    await first.room.flush();
    await first.room.close();
  } catch (err) {
    await first.room.close();
    throw err;
  }
  const second = await startRoom({ statePath }); // simulated restart
  try {
    const rejoin = await TestClient.connect(second.url);
    rejoin.send({ kind: 'hello', id: C });
    await rejoin.expectError('BANNED');
    await rejoin.close();
  } finally {
    await second.room.close();
  }
});

test('issued tokens restore identity role after reconnect; forged tokens fall back to guest', async () => {
  const { room, url } = await startRoom();
  try {
    const admin = await TestClient.connect(url);
    await admin.hello({ id: A });
    admin.send({ kind: 'claim', passphrase: PASSPHRASE });
    await admin.next((m) => m.kind === 'roleChange' && m.role === 'admin');
    const editor = await TestClient.connect(url);
    const editorWelcome = await editor.hello({ id: B, name: 'Editor' });
    admin.send({ kind: 'roleChange', playerId: B, role: 'editor' });
    await editor.next((m) => m.kind === 'roleChange' && m.role === 'editor');
    await editor.close();
    await admin.close();

    const restored = await TestClient.connect(url); // token restores the role
    const back = await restored.hello({ id: B, token: editorWelcome.token });
    assert.equal(back.role, 'editor');
    await restored.close();

    const forger = await TestClient.connect(url); // forged token on a role-holding identity → refused
    forger.send({ kind: 'hello', id: B, token: signToken('forged-secret', B) });
    await forger.expectError('FORBIDDEN');
    await forger.close();
    const fresh = await TestClient.connect(url); // forged token on an unknown identity → guest, admitted
    const asGuest = await fresh.hello({ id: C, token: signToken('forged-secret', C) });
    assert.equal(asGuest.role, 'guest');
    await fresh.close();
  } finally {
    await room.close();
  }
});

test('persistence round-trip: claim, roles, board ops and tokens survive a simulated restart', async () => {
  const statePath = path.join(tmp, 'room-state.json');
  const first = await startRoom({ statePath, persistDelayMs: 5 });
  let editorToken;
  try {
    const admin = await TestClient.connect(first.url);
    const adminWelcome = await admin.hello({ id: A, name: 'Keeper' });
    admin.send({ kind: 'claim', passphrase: PASSPHRASE });
    await admin.next((m) => m.kind === 'roleChange' && m.role === 'admin');
    const editor = await TestClient.connect(first.url);
    const editorWelcome = await editor.hello({ id: B, name: 'Editor' });
    editorToken = editorWelcome.token;
    admin.send({ kind: 'roleChange', playerId: B, role: 'editor' });
    await editor.next((m) => m.kind === 'roleChange' && m.role === 'editor');
    editor.send({ kind: 'boardOp', op: { type: 'add', objectId: 'form-9', data: { type: 'chair', size: 2 } } });
    await admin.next((m) => m.kind === 'boardOp');
    await editor.close();
    await admin.close();
    await first.room.flush(); // debounced write, flushed explicitly for the test
    await first.room.close();

    const second = await startRoom({ statePath, persistDelayMs: 5 }); // simulated restart
    try {
      assert.equal(second.room.state.adminId, A);
      assert.equal(second.room.state.roles[B], 'editor');
      assert.deepEqual(second.room.state.board.objects['form-9'], { type: 'chair', size: 2 });
      assert.equal(second.room.state.board.revision, 1);
      // the token issued before the restart still verifies — same persisted HMAC secret
      assert.deepEqual(verifyToken(second.room.state.secret, editorToken), { ok: true, id: B });
      const joiner = await TestClient.connect(second.url);
      const welcome = await joiner.hello({ id: C, name: 'Latecomer' });
      assert.equal(welcome.role, 'guest');
      assert.equal(welcome.snapshot.board.revision, 1);
      assert.deepEqual(welcome.snapshot.board.objects['form-9'], { type: 'chair', size: 2 });
      await joiner.close();
      // the admin identity still governs after the restart, via its token
      const admin2 = await TestClient.connect(second.url);
      const adminWelcome2 = await admin2.hello({ id: A, token: adminWelcome.token });
      assert.equal(adminWelcome2.role, 'admin');
      await admin2.close();
    } finally {
      await second.room.close();
    }
  } finally {
    fs.rmSync(statePath, { force: true });
  }
});

test('debounced persistence coalesces rapid edits and writes atomically', async () => {
  const statePath = path.join(tmp, 'debounce-state.json');
  const { room, url } = await startRoom({ statePath, persistDelayMs: 40 });
  try {
    const admin = await TestClient.connect(url);
    await admin.hello({ id: A });
    admin.send({ kind: 'claim', passphrase: PASSPHRASE });
    await admin.next((m) => m.kind === 'roleChange' && m.role === 'admin');
    // burst of edits inside one debounce window → a single coalesced write
    for (let i = 0; i < 5; i++) {
      admin.send({ kind: 'boardOp', op: { type: 'add', objectId: `form-${i}`, data: { i } } });
    }
    for (let i = 0; i < 5; i++) await admin.next((m) => m.kind === 'boardOp');
    assert.equal(fs.existsSync(statePath), false); // debounce window still open
    await room.flush();
    assert.equal(fs.existsSync(`${statePath}.tmp`), false); // atomic rename leaves no temp file
    const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(Object.keys(saved.board.objects).length, 5);
    assert.equal(saved.adminId, A);
    await admin.close();
  } finally {
    await room.close();
  }
});

test('a corrupt state file is logged and the room still boots fresh', async () => {
  const statePath = path.join(tmp, 'corrupt-state.json');
  fs.writeFileSync(statePath, '{not valid json');
  const logs = [];
  const room = await makeRoom({ statePath, log: (line) => logs.push(line) }).init();
  try {
    assert.equal(room.state.adminId, null);
    assert.ok(logs.some((line) => line.includes('unreadable')), logs.join('\n'));
  } finally {
    await room.close();
  }
});

test('static serving: dist files, SPA fallback, traversal containment', async () => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eternity-dist-'));
  fs.mkdirSync(path.join(distDir, 'assets'));
  fs.writeFileSync(path.join(distDir, 'index.html'), '<html>eternity</html>');
  fs.writeFileSync(path.join(distDir, 'assets', 'app.js'), 'export {};');
  // a marker beside distDir — no traversal response may ever carry its bytes
  fs.writeFileSync(path.join(path.dirname(distDir), 'secret-marker.txt'), 'OUTSIDE-ROOT-SECRET');
  const room = await makeRoom({ distDir }).init();
  await room.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${room.address().port}`;
  try {
    assert.equal(await (await fetch(`${base}/`)).text(), '<html>eternity</html>');
    const asset = await fetch(`${base}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /text\/javascript/);
    assert.equal(await (await fetch(`${base}/some/client/route`)).text(), '<html>eternity</html>'); // SPA fallback
    assert.equal((await fetch(`${base}/nope.js`, { method: 'POST' })).status, 405);
    // URL normalization collapses raw and %2e-encoded dot segments to a root-anchored
    // path before the dist join, so traversal is contained by construction — pin that:
    for (const hostile of ['/../secret-marker.txt', '/%2e%2e/secret-marker.txt', '/%2e%2e/%2e%2e/secret-marker.txt']) {
      const body = await new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: room.address().port, path: hostile }, (res) => {
          let out = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { out += c; });
          res.on('end', () => resolve(out));
        }).on('error', reject);
      });
      assert.ok(!body.includes('OUTSIDE-ROOT-SECRET'), `traversal leaked outside-root bytes: ${hostile}`);
    }
    // a decoded NUL byte must not crash the fs layer or the process
    const nul = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: room.address().port, path: '/%00' }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', () => resolve(0));
    });
    assert.ok([400, 404].includes(nul), `NUL byte returned ${nul}`);
    // the server is still alive after all hostile probes
    assert.equal(await (await fetch(`${base}/`)).text(), '<html>eternity</html>');
  } finally {
    await room.close();
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.rmSync(path.join(path.dirname(distDir), 'secret-marker.txt'), { force: true });
  }
});

test('upgrade requests outside /ws are rejected', async () => {
  const { room, url } = await startRoom();
  try {
    const { WebSocket } = await import('ws');
    const ws = new WebSocket(url.replace('ws://', 'http://').replace(/\/ws$/, '/other'));
    const rejected = await new Promise((resolve) => {
      ws.on('error', () => resolve(true));
      ws.on('unexpected-response', () => resolve(true));
      setTimeout(() => resolve(false), 500);
    });
    assert.ok(rejected, 'upgrade outside /ws must not connect');
  } finally {
    await room.close();
  }
});
