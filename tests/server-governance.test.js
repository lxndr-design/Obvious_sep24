// Server-enforced role matrix and share links (Feature 7, U4). Every message
// kind is gated server-side: guests speak and move, editors also edit the
// board, the admin also governs. Tests talk raw JSON over real WebSocket
// connections — no client protocol code — so a forged message from any role
// is exactly what the server sees in production.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRoomServer, signInviteToken, signToken, verifyInviteToken, verifyToken } from '../server/index.js';
import { TestClient } from './ws-client-helper.js';

const A = 'a1b2c3d4-0000-4000-8000-000000000001';
const B = 'b2c3d4e5-0000-4000-8000-000000000002';
const C = 'c3d4e5f6-0000-4000-8000-000000000003';
const D = 'd4e5f6a7-0000-4000-8000-000000000004';
const PASSPHRASE = 'meadow-keeper';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eternity-governance-'));

async function startRoom(options = {}) {
  const room = await createRoomServer({ adminPassphrase: PASSPHRASE, ...options }).init();
  await room.listen(0, '127.0.0.1');
  return { room, url: `ws://127.0.0.1:${room.address().port}/ws` };
}

// Admin bootstrap shared by most cases: connect, hello, claim the passphrase.
async function claimAdmin(url, name = 'Keeper') {
  const admin = await TestClient.connect(url);
  await admin.hello({ id: A, name });
  admin.send({ kind: 'claim', passphrase: PASSPHRASE });
  await admin.next((m) => m.kind === 'roleChange' && m.role === 'admin');
  return admin;
}

test('full role matrix over raw frames: guest speaks and moves only, editor also edits, admin also governs', async () => {
  const { room, url } = await startRoom();
  try {
    const admin = await claimAdmin(url);

    // Guest joins with a raw hand-built hello and forges governance frames.
    const guest = await TestClient.connect(url);
    guest.send({ kind: 'hello', id: B, name: 'Visitor' });
    const guestWelcome = await guest.next((m) => m.kind === 'welcome');
    assert.equal(guestWelcome.role, 'guest');
    guest.raw(JSON.stringify({ kind: 'boardOp', op: { type: 'add', objectId: 'form-1', data: { type: 'box' } } }));
    await guest.expectError('FORBIDDEN');
    guest.raw(JSON.stringify({ kind: 'roleChange', playerId: C, role: 'editor' }));
    await guest.expectError('FORBIDDEN');
    guest.raw(JSON.stringify({ kind: 'kick', playerId: A }));
    await guest.expectError('FORBIDDEN');
    guest.raw(JSON.stringify({ kind: 'ban', playerId: A }));
    await guest.expectError('FORBIDDEN');
    guest.raw(JSON.stringify({ kind: 'mintLink', role: 'editor' }));
    await guest.expectError('FORBIDDEN');
    // The guest's own lanes stay open: chat and presence.
    guest.raw(JSON.stringify({ kind: 'chat', text: 'hello from the grass' }));
    const chat = await admin.next((m) => m.kind === 'chat');
    assert.equal(chat.text, 'hello from the grass');
    guest.raw(JSON.stringify({ kind: 'presence', pose: { x: 1, y: 0, z: 2 } }));
    await admin.next((m) => m.kind === 'presence' && m.event === 'move');

    // The admin promotes the guest to editor: board ops open, governance stays shut.
    admin.send({ kind: 'roleChange', playerId: B, role: 'editor' });
    await guest.next((m) => m.kind === 'roleChange' && m.role === 'editor');
    guest.raw(JSON.stringify({ kind: 'boardOp', op: { type: 'add', objectId: 'form-1', data: { type: 'box' } } }));
    const op = await admin.next((m) => m.kind === 'boardOp');
    assert.equal(op.by, B);
    guest.raw(JSON.stringify({ kind: 'kick', playerId: A }));
    await guest.expectError('FORBIDDEN');
    guest.raw(JSON.stringify({ kind: 'ban', playerId: A }));
    await guest.expectError('FORBIDDEN');
    guest.raw(JSON.stringify({ kind: 'mintLink', role: 'guest' }));
    await guest.expectError('FORBIDDEN');
    guest.raw(JSON.stringify({ kind: 'roleChange', playerId: C, role: 'editor' }));
    await guest.expectError('FORBIDDEN');

    // The admin can do all of it.
    admin.raw(JSON.stringify({ kind: 'boardOp', op: { type: 'add', objectId: 'form-2', data: { type: 'sphere' } } }));
    await admin.next((m) => m.kind === 'boardOp' && m.by === A);
    admin.raw(JSON.stringify({ kind: 'mintLink', role: 'guest' }));
    await admin.next((m) => m.kind === 'shareLink');

    const third = await TestClient.connect(url);
    await third.hello({ id: C, name: 'Third' });
    admin.raw(JSON.stringify({ kind: 'kick', playerId: C }));
    await third.expectError('KICKED');
    await guest.close();
    await admin.close();
  } finally {
    await room.close();
  }
});

test('an editor share link lifts a fresh identity to editor; the guest link holds at guest', async () => {
  const { room, url } = await startRoom();
  try {
    const admin = await claimAdmin(url);

    admin.send({ kind: 'mintLink', role: 'editor' });
    const editorLink = await admin.next((m) => m.kind === 'shareLink');
    assert.equal(editorLink.role, 'editor');
    assert.match(editorLink.token, /^i1\.\d+\.editor\.[0-9a-f]{64}$/);

    admin.send({ kind: 'mintLink', role: 'guest' });
    const guestLink = await admin.next((m) => m.kind === 'shareLink');
    assert.equal(guestLink.role, 'guest');

    const joiner = await TestClient.connect(url);
    const editorWelcome = await joiner.hello({ id: B, name: 'Linked in', token: editorLink.token });
    assert.equal(editorWelcome.role, 'editor');
    // The editor role is real: board ops flow, and the issued session token
    // keeps it across reconnects without the link.
    joiner.send({ kind: 'boardOp', op: { type: 'add', objectId: 'form-1', data: { type: 'box' } } });
    await admin.next((m) => m.kind === 'boardOp');
    await joiner.close();
    const again = await TestClient.connect(url);
    const restored = await again.hello({ id: B, token: editorWelcome.token });
    assert.equal(restored.role, 'editor');
    await again.close();

    const visitor = await TestClient.connect(url);
    const guestWelcome = await visitor.hello({ id: C, name: 'Guest link', token: guestLink.token });
    assert.equal(guestWelcome.role, 'guest');
    visitor.send({ kind: 'boardOp', op: { type: 'add', objectId: 'form-2', data: {} } });
    await visitor.expectError('FORBIDDEN');
    await visitor.close();
    await admin.close();
  } finally {
    await room.close();
  }
});

test('a banned session token is refused on reconnect — a valid token is not a ban exemption', async () => {
  const { room, url } = await startRoom();
  try {
    const admin = await claimAdmin(url);
    const pest = await TestClient.connect(url);
    const pestWelcome = await pest.hello({ id: B, name: 'Pest' });
    admin.send({ kind: 'ban', playerId: B });
    await pest.expectError('BANNED');
    const rejoin = await TestClient.connect(url);
    rejoin.send({ kind: 'hello', id: B, token: pestWelcome.token }); // signed, unexpired, still refused
    await rejoin.expectError('BANNED');
    await rejoin.close();
    await admin.close();
  } finally {
    await room.close();
  }
});

test('an invite token never impersonates a role-holding identity and never outranks the session-token check', async () => {
  const { room, url } = await startRoom();
  try {
    const admin = await claimAdmin(url);
    // B holds an editor role granted in-session; the invite token is not a
    // session token, so presenting one instead is refused, not rewarded.
    const editor = await TestClient.connect(url);
    const editorWelcome = await editor.hello({ id: B, name: 'Editor' });
    admin.send({ kind: 'roleChange', playerId: B, role: 'editor' });
    await editor.next((m) => m.kind === 'roleChange' && m.role === 'editor');
    await editor.close();
    admin.send({ kind: 'mintLink', role: 'guest' }); // links mint guest/editor only
    const link = await admin.next((m) => m.kind === 'shareLink');
    const impostor = await TestClient.connect(url);
    impostor.send({ kind: 'hello', id: B, token: link.token });
    await impostor.expectError('FORBIDDEN');
    await impostor.close();
    // A tampered link on a fresh identity falls back to guest, not error.
    const forger = await TestClient.connect(url);
    const asGuest = await forger.hello({ id: D, name: 'Forger', token: `${link.token}0` });
    assert.equal(asGuest.role, 'guest');
    await forger.close();
    await admin.close();
  } finally {
    await room.close();
  }
});

test('mintLink payload validation: admin role is not linkable, unknown fields rejected', async () => {
  const { room, url } = await startRoom();
  try {
    const admin = await claimAdmin(url);
    admin.send({ kind: 'mintLink', role: 'admin' });
    await admin.expectError('INVALID');
    admin.send({ kind: 'mintLink', role: 'editor', sneaky: 1 });
    await admin.expectError('INVALID');
    admin.send({ kind: 'mintLink' });
    await admin.expectError('INVALID');
    await admin.close();
  } finally {
    await room.close();
  }
});

test('share links survive a restart (the signing secret persists) and grants persist as roles', async () => {
  const statePath = path.join(tmp, 'share-state.json');
  const first = await startRoom({ statePath, persistDelayMs: 5 });
  let link;
  try {
    const admin = await claimAdmin(first.url);
    admin.send({ kind: 'mintLink', role: 'editor' });
    link = (await admin.next((m) => m.kind === 'shareLink')).token;
    const joiner = await TestClient.connect(first.url);
    await joiner.hello({ id: B, name: 'Linked', token: link });
    await joiner.close();
    await admin.close();
    await first.room.flush();
    await first.room.close();
  } catch (err) {
    await first.room.close();
    throw err;
  }
  const second = await startRoom({ statePath, persistDelayMs: 5 });
  try {
    assert.equal(second.room.state.roles[B], 'editor'); // the grant persisted
    const joiner = await TestClient.connect(second.url);
    const welcome = await joiner.hello({ id: C, name: 'After restart', token: link }); // the link still verifies
    assert.equal(welcome.role, 'editor');
    await joiner.close();
  } finally {
    await second.room.close();
    fs.rmSync(statePath, { force: true });
  }
});

test('invite-token helpers: verify, expire, and never confuse session tokens for invites', () => {
  const secret = 's3cret';
  const token = signInviteToken(secret, 'editor', 1_000);
  assert.deepEqual(verifyInviteToken(secret, token, 2_000), { ok: true, role: 'editor' });
  assert.equal(verifyInviteToken(secret, token, 1_000 + 7 * 24 * 3600e3 + 1).ok, false); // expired
  assert.equal(verifyInviteToken('other-secret', token, 2_000).ok, false);
  assert.equal(verifyInviteToken(secret, `${token}0`, 2_000).ok, false);
  assert.equal(verifyInviteToken(secret, signToken(secret, A), 2_000).ok, false); // session token is not an invite
  assert.equal(verifyToken(secret, token, 2_000).ok, false); // and an invite is not a session token
  assert.equal(verifyInviteToken(secret, signInviteToken(secret, 'admin', 1_000), 2_000).ok, false); // admin never linkable
});
