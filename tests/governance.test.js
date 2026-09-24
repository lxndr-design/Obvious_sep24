// Governance console logic and client actions (Feature 7, U4). Pure functions
// get direct unit tests; the RoomClient paths get FakeSocket drives so the
// exact frames the console triggers are pinned. DOM rendering itself is the
// browser's job — the server's enforcement tests own the security story.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomClient, readJoinToken, shareLinkUrl } from '../src/net/client.js';
import { decodeMessage } from '../src/net/protocol.js';
import { actionLabel, canGovern, inviteLabel, memberActions, memberRows } from '../src/governance.js';

const SELF = 'a1b2c3d4-0000-4000-8000-000000000001';
const OTHER = 'b2c3d4e5-0000-4000-8000-000000000002';
const THIRD = 'c3d4e5f6-0000-4000-8000-000000000003';

// ---- doubles (same shapes as net-client.test.js) ---------------------------

class FakeSocket {
  constructor() {
    this.sent = [];
    this.closeCalls = 0;
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    if (this.closeCalls > 0) return;
    this.closeCalls += 1;
    this.onclose?.();
  }

  open() {
    this.onopen?.();
  }

  fromServer(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function connectedClient(events = []) {
  const client = new RoomClient({
    url: 'wss://meadow.test/ws',
    identity: { id: SELF, name: 'Keeper' },
    connect: () => new FakeSocket(),
    onEvent: (event) => events.push(event),
  });
  client.connect();
  client.socket.open();
  client.socket.fromServer({ kind: 'welcome', id: SELF, name: 'Keeper', role: 'guest', token: 'tok', snapshot: { players: [] } });
  return client;
}

// ---- console logic ---------------------------------------------------------

test('canGovern: the console governs only for the admin', () => {
  assert.equal(canGovern('admin'), true);
  assert.equal(canGovern('editor'), false);
  assert.equal(canGovern('guest'), false);
  assert.equal(canGovern(undefined), false);
});

test('memberRows: the local player leads, then alphabetical; outputs are copies', () => {
  const members = [
    { id: THIRD, name: 'Cara', role: 'editor' },
    { id: SELF, name: 'Keeper', role: 'admin' },
    { id: OTHER, name: 'Alf', role: 'guest' },
  ];
  const rows = memberRows(members, SELF);
  assert.deepEqual(rows.map((r) => r.id), [SELF, OTHER, THIRD]);
  assert.equal(rows[0].self, true);
  assert.equal(rows[1].self, false);
  // Copies: corrupting a row must not reach the source list.
  rows[1].role = 'admin';
  assert.equal(members.find((m) => m.id === OTHER).role, 'guest');
});

test('memberActions: admins act on non-admin others only; nobody acts on self or the admin', () => {
  const guest = { id: OTHER, name: 'Alf', role: 'guest', self: false };
  const editor = { id: OTHER, name: 'Alf', role: 'editor', self: false };
  const adminTarget = { id: THIRD, name: 'Keeper', role: 'admin', self: false };
  const selfRow = { id: SELF, name: 'Keeper', role: 'admin', self: true };

  // Non-admin viewers: empty — the console hides what the server would refuse.
  assert.deepEqual(memberActions('guest', guest), []);
  assert.deepEqual(memberActions('editor', guest), []);
  assert.deepEqual(memberActions(undefined, guest), []);

  // Admin viewer: full kit, shaped by the target's role.
  assert.deepEqual(memberActions('admin', guest), ['grant-editor', 'kick', 'ban']);
  assert.deepEqual(memberActions('admin', editor), ['revoke-editor', 'kick', 'ban']);

  // Self and admin rows are never actionable.
  assert.deepEqual(memberActions('admin', selfRow), []);
  assert.deepEqual(memberActions('admin', adminTarget), []);
});

test('actionLabel and inviteLabel name their actions for the UI', () => {
  assert.equal(actionLabel('grant-editor'), 'Make editor');
  assert.equal(actionLabel('revoke-editor'), 'Revoke editor');
  assert.equal(actionLabel('kick'), 'Kick');
  assert.equal(actionLabel('ban'), 'Ban');
  assert.equal(inviteLabel('editor'), 'Editor link');
  assert.equal(inviteLabel('guest'), 'Guest link');
});

// ---- client actions the console triggers -----------------------------------

test('console actions send exact protocol frames while online', () => {
  const client = connectedClient();
  client.changeRole(OTHER, 'editor');
  client.kick(OTHER);
  client.ban(OTHER);
  client.mintLink('guest');
  assert.deepEqual(client.socket.sent.slice(1), [ // [0] is the connect hello
    { kind: 'roleChange', playerId: OTHER, role: 'editor' },
    { kind: 'kick', playerId: OTHER },
    { kind: 'ban', playerId: OTHER },
    { kind: 'mintLink', role: 'guest' },
  ]);
  // Every frame survives the shared wire validator — the client and the
  // server must agree on these shapes.
  for (const frame of client.socket.sent) {
    const decoded = decodeMessage(JSON.stringify(frame));
    assert.equal(decoded.ok, true, `frame ${frame.kind} must validate: ${decoded.error ?? ''}`);
  }
});

test('governance actions sent while offline queue and flush after the welcome', () => {
  const client = new RoomClient({
    url: 'wss://meadow.test/ws',
    identity: { id: SELF, name: 'Keeper' },
    connect: () => new FakeSocket(),
  });
  client.mintLink('editor');
  client.changeRole(OTHER, 'guest');
  client.connect();
  client.socket.open();
  client.socket.fromServer({ kind: 'welcome', id: SELF, name: 'Keeper', role: 'guest', token: 'tok', snapshot: { players: [] } });
  assert.deepEqual(client.socket.sent.slice(1), [
    { kind: 'mintLink', role: 'editor' },
    { kind: 'roleChange', playerId: OTHER, role: 'guest' },
  ]);
});

test('a minted share link arrives as a share-link event with role and token', () => {
  const events = [];
  const client = connectedClient(events);
  client.socket.fromServer({ kind: 'shareLink', role: 'editor', token: 'i1.123.editor.abc' });
  assert.deepEqual(events.at(-1), { type: 'share-link', role: 'editor', token: 'i1.123.editor.abc' });
});

// ---- share-link URLs -------------------------------------------------------

test('shareLinkUrl puts the token in the fragment of the page URL', () => {
  assert.equal(
    shareLinkUrl('https://meadow.test/eternity/index.html', 'i1.123.editor.abc'),
    'https://meadow.test/eternity/index.html#join=i1.123.editor.abc',
  );
  assert.equal(
    shareLinkUrl('https://meadow.test/', 'i1.9.guest.def'),
    'https://meadow.test/#join=i1.9.guest.def',
  );
});

test('readJoinToken accepts only a well-formed join fragment', () => {
  assert.equal(readJoinToken('#join=i1.123.editor.abc'), 'i1.123.editor.abc');
  assert.equal(readJoinToken('#join=i1.123.editor.abc&extra=1'), null); // token charset must end the hash
  assert.equal(readJoinToken('#section'), null);
  assert.equal(readJoinToken('#join='), null);
  assert.equal(readJoinToken(''), null);
  assert.equal(readJoinToken(null), null);
  assert.equal(readJoinToken(undefined), null);
});
