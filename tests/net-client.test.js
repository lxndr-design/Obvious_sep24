import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GRACE_MS,
  IDENTITY_KEY,
  PRESENCE_INTERVAL_MS,
  STATUS,
  RoomClient,
  RoomRoster,
  createIdentity,
  loadIdentity,
  nextBackoffMs,
  saveIdentity,
} from '../src/net/client.js';

const ID = 'a1b2c3d4-0000-4000-8000-000000000001';

// ---- doubles -------------------------------------------------------------

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    map,
  };
}

// The client assigns onopen/onmessage/onclose handlers; tests drive them.
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

function fakeTimers() {
  const scheduled = [];
  return {
    scheduled,
    setTimeout(fn, ms) {
      scheduled.push({ fn, ms });
      return scheduled.length;
    },
    clearTimeout() {},
    run() {
      const pending = scheduled.splice(0);
      for (const { fn } of pending) fn();
    },
  };
}

const snapshot = (players = []) => ({ board: { objects: {}, revision: 0 }, players });
const welcomeMessage = (id = ID, players = []) => ({
  kind: 'welcome',
  id,
  name: 'Tester',
  role: 'guest',
  token: 'tok-1',
  snapshot: snapshot(players),
});

function harness({ graceMs = 10_000, random = () => 0.5, storage = memoryStorage(), identity = createIdentity({ id: ID, name: 'Tester' }) } = {}) {
  const sockets = [];
  const events = [];
  const timers = fakeTimers();
  const client = new RoomClient({
    url: 'ws://room.test/ws',
    identity,
    connect: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    storage,
    graceMs,
    timers,
    random,
    onEvent: (event) => events.push(event),
  });
  return { client, sockets, events, timers, storage };
}

// ---- identity ------------------------------------------------------------

test('createIdentity mints a url-safe id and rejects malformed overrides', () => {
  const fresh = createIdentity();
  assert.match(fresh.id, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(fresh.name, undefined);
  assert.throws(() => createIdentity({ id: 'short' }), TypeError);
});

test('identity round-trips through storage and survives a corrupt record', () => {
  const storage = memoryStorage();
  const saved = createIdentity({ id: ID, name: 'Meadow', token: 'tok-9' });
  saveIdentity(storage, saved);
  const loaded = loadIdentity(storage);
  assert.equal(loaded.id, ID);
  assert.equal(loaded.name, 'Meadow');
  assert.equal(loaded.token, 'tok-9');

  storage.setItem(IDENTITY_KEY, '{not json');
  const recovered = loadIdentity(storage);
  assert.match(recovered.id, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(recovered.name, undefined);
  assert.notEqual(recovered.id, ID);
});

test('loadIdentity discards malformed names, ids and tokens, and normalizes names', () => {
  const storage = memoryStorage();
  storage.setItem(IDENTITY_KEY, JSON.stringify({ id: 'nope' }));
  assert.match(loadIdentity(storage).id, /^[A-Za-z0-9_-]{8,64}$/);

  storage.setItem(IDENTITY_KEY, JSON.stringify({ id: ID, name: '  M\u0000ea  dow\t ' }));
  assert.equal(loadIdentity(storage).name, 'Mea dow');

  storage.setItem(IDENTITY_KEY, JSON.stringify({ id: ID, name: 'Meadow', token: 42 }));
  const identity = loadIdentity(storage);
  assert.equal(identity.name, 'Meadow');
  assert.equal(identity.token, undefined);

  assert.match(loadIdentity(null).id, /^[A-Za-z0-9_-]{8,64}$/);
  saveIdentity(null, createIdentity());
});

test('backoff grows exponentially, is jittered, and is capped', () => {
  assert.equal(nextBackoffMs(1, { random: () => 0.5 }), 500);
  assert.equal(nextBackoffMs(2, { random: () => 0.5 }), 1000);
  assert.equal(nextBackoffMs(3, { random: () => 0.5 }), 2000);
  assert.equal(nextBackoffMs(9, { random: () => 0.5 }), 30_000);
  const low = nextBackoffMs(1, { random: () => 0 });
  const high = nextBackoffMs(1, { random: () => 1 });
  assert.ok(low >= 375 && low <= 625, `low ${low}`);
  assert.ok(high >= 625 && high <= 750, `high ${high}`);
  for (let attempt = 1; attempt < 30; attempt++) {
    for (const sample of [0, 0.5, 1]) {
      assert.ok(nextBackoffMs(attempt, { random: () => sample }) <= 30_000 * 1.25 + 1);
    }
  }
});

// ---- connect / welcome ---------------------------------------------------

test('connect sends a hello with the identity and welcome brings the room online', () => {
  const { client, sockets, events } = harness();
  client.connect();
  assert.equal(client.status, STATUS.CONNECTING);
  assert.equal(sockets.length, 1);

  sockets[0].open();
  assert.deepEqual(sockets[0].sent, [{ kind: 'hello', id: ID, name: 'Tester' }]);

  sockets[0].fromServer(welcomeMessage());
  assert.equal(client.status, STATUS.ONLINE);
  assert.equal(client.identity.token, 'tok-1');
  assert.ok(events.some((event) => event.type === 'welcome' && event.role === 'guest'));
  assert.ok(events.some((event) => event.type === 'status' && event.status === STATUS.ONLINE));
});

test('a stored token rides along on the hello', () => {
  const { client, sockets } = harness({ identity: createIdentity({ id: ID, token: 'saved-token' }) });
  client.connect();
  sockets[0].open();
  assert.deepEqual(sockets[0].sent, [{ kind: 'hello', id: ID, token: 'saved-token' }]);
});

test('the welcome snapshot spawns remote players but never the local identity', () => {
  const other = 'b2c3d4e5-0000-4000-8000-000000000002';
  const { client, events } = harness();
  client.connect();
  client.socket.fromServer(welcomeMessage(ID, [{ id: ID, name: 'Tester', role: 'guest' }, { id: other, name: 'Bo', role: 'editor' }]));
  const joins = events.filter((event) => event.type === 'player-join');
  assert.equal(joins.length, 1);
  assert.equal(joins[0].player.id, other);
  assert.equal(joins[0].player.role, 'editor');
  assert.equal(client.roster.players.size, 1);
});

test('a reconcile on reconnect keeps the known pose of a remote player', () => {
  const other = 'b2c3d4e5-0000-4000-8000-000000000002';
  const { client } = harness();
  client.connect();
  client.socket.fromServer(welcomeMessage());
  client.socket.fromServer({ kind: 'presence', event: 'join', player: { id: other, name: 'Bo', role: 'guest' } });
  client.socket.fromServer({ kind: 'presence', event: 'move', id: other, pose: { x: 2, y: 0, z: 3 } });

  // Same player again in a fresh snapshot (e.g. after a reconnect): pose kept.
  client.socket.fromServer(welcomeMessage(ID, [{ id: other, name: 'Bo', role: 'guest' }]));
  assert.deepEqual(client.roster.players.get(other).pose, { x: 2, y: 0, z: 3 });
});

// ---- offline queue -------------------------------------------------------

test('messages sent while offline queue and flush in order after welcome', () => {
  const { client, sockets } = harness();
  client.connect();
  client.sendChat('hello from the queue');
  client.sendBoardOp({ type: 'add', objectId: 'form-1', data: { kind: 'bench' } });
  assert.equal(client.outbox.length, 2);
  assert.equal(sockets[0].sent.length, 0); // nothing on the wire yet

  sockets[0].open();
  sockets[0].fromServer(welcomeMessage());
  assert.equal(client.outbox.length, 0);
  assert.deepEqual(sockets[0].sent.map((message) => message.kind), ['hello', 'chat', 'boardOp']);
  assert.equal(sockets[0].sent[1].text, 'hello from the queue');
});

test('the offline queue drops its oldest message past the limit', () => {
  const { client } = harness();
  for (let i = 0; i < 70; i++) client.enqueue({ kind: 'chat', text: `msg ${i}` });
  assert.equal(client.outbox.length, 64);
  assert.equal(client.outbox[0].text, 'msg 6');
  assert.equal(client.outbox[63].text, 'msg 69');
});

// ---- presence ------------------------------------------------------------

test('presence sends the latest pose and throttles to 10 Hz latest-wins', () => {
  const { client, sockets } = harness();
  client.connect();
  sockets[0].open();
  sockets[0].fromServer(welcomeMessage());

  client.setPose({ x: 1, y: 0, z: 2 });
  assert.deepEqual(sockets[0].sent.at(-1).pose, { x: 1, y: 0, z: 2 });

  // Same tick: still inside the 100 ms window, only the pending pose updates.
  client.setPose({ x: 3, y: 0, z: 4 });
  assert.equal(sockets[0].sent.filter((message) => message.kind === 'presence').length, 1);
  client.step(Date.now() + PRESENCE_INTERVAL_MS);
  assert.deepEqual(sockets[0].sent.at(-1).pose, { x: 3, y: 0, z: 4 });
});

test('a pose set while offline flushes after welcome', () => {
  const { client, sockets } = harness();
  client.connect();
  client.setPose({ x: 5, y: 0, z: 6 });
  sockets[0].open();
  sockets[0].fromServer(welcomeMessage());
  const presence = sockets[0].sent.filter((message) => message.kind === 'presence');
  assert.equal(presence.length, 1);
  assert.deepEqual(presence[0].pose, { x: 5, y: 0, z: 6 });
});

// ---- grace window --------------------------------------------------------

test('a disconnecting player fades, then is swept after the grace expires', () => {
  const other = 'b2c3d4e5-0000-4000-8000-000000000002';
  const { client, events } = harness();
  client.connect();
  client.socket.open();
  client.socket.fromServer(welcomeMessage(ID, [{ id: other, name: 'Bo', role: 'guest' }]));

  client.socket.fromServer({ kind: 'presence', event: 'leave', player: { id: other, name: 'Bo', role: 'guest' } });
  assert.ok(events.some((event) => event.type === 'player-leave'));
  assert.ok(client.roster.players.has(other)); // still inside the grace

  const leave = events.find((event) => event.type === 'player-leave');
  client.step(leave.graceUntil - 1);
  assert.ok(client.roster.players.has(other));
  client.step(leave.graceUntil);
  assert.ok(!client.roster.players.has(other));
  assert.ok(events.some((event) => event.type === 'player-remove' && event.id === other));
});

test('any move from a leaving player cancels the pending retirement', () => {
  const other = 'b2c3d4e5-0000-4000-8000-000000000002';
  const { client, events } = harness({ graceMs: 500 });
  client.connect();
  client.socket.open();
  client.socket.fromServer(welcomeMessage(ID, [{ id: other, name: 'Bo', role: 'guest' }]));
  client.socket.fromServer({ kind: 'presence', event: 'leave', player: { id: other, name: 'Bo', role: 'guest' } });
  client.socket.fromServer({ kind: 'presence', event: 'move', id: other, pose: { x: 1, y: 0, z: 1 } });

  const leave = events.find((event) => event.type === 'player-leave');
  client.step(leave.graceUntil + 5_000);
  assert.ok(client.roster.players.has(other));
  assert.ok(!events.some((event) => event.type === 'player-remove'));
});

// ---- reconnect -----------------------------------------------------------

test('a dropped connection schedules capped exponential reconnects and welcome resets the count', () => {
  const { client, sockets, timers, events } = harness();
  client.connect();
  sockets[0].open();
  sockets[0].fromServer(welcomeMessage());
  assert.equal(client.attempt, 0);

  sockets[0].close(); // server vanished
  assert.equal(client.status, STATUS.BACKOFF);
  assert.equal(client.attempt, 1);
  assert.equal(timers.scheduled[0].ms, 500);
  assert.ok(events.some((event) => event.type === 'lost' && event.attempt === 1));

  timers.run(); // fire the retry
  assert.equal(client.status, STATUS.CONNECTING);
  assert.equal(sockets.length, 2);
  sockets[1].close();
  assert.equal(client.attempt, 2);
  assert.equal(timers.scheduled[0].ms, 1000);

  timers.run();
  sockets[2].open();
  sockets[2].fromServer(welcomeMessage());
  assert.equal(client.status, STATUS.ONLINE);
  assert.equal(client.attempt, 0);
  sockets[2].close();
  assert.equal(client.attempt, 1);
  assert.equal(timers.scheduled[0].ms, 500); // the count restarted
});

test('reconnects never fire while online, connecting, after leave, or after a terminal error', () => {
  const { client, sockets, timers } = harness();
  client.connect();
  client.connect(); // no-op while CONNECTING
  assert.equal(sockets.length, 1);
  sockets[0].open();
  sockets[0].fromServer(welcomeMessage());
  client.connect(); // no-op while ONLINE
  assert.equal(sockets.length, 1);

  // Terminal error: closed, socket dropped, no retry, and connect() refuses.
  client.socket.fromServer({ kind: 'error', code: 'BANNED', message: 'banned' });
  assert.equal(client.status, STATUS.CLOSED);
  assert.equal(client.socket, null);
  assert.equal(client.roster.players.size, 0);
  client.connect();
  assert.equal(sockets.length, 1);
  timers.run();
  assert.equal(sockets.length, 1);

  // User-initiated leave: the close is final, no backoff is scheduled.
  client.rejoin();
  sockets[1].open();
  sockets[1].fromServer(welcomeMessage());
  client.leave();
  assert.equal(client.status, STATUS.OFFLINE);
  assert.equal(client.left, true);
  assert.equal(sockets[1].closeCalls, 1);
  timers.run();
  assert.equal(sockets.length, 2);
});

test('a transport factory that throws falls into the backoff path', () => {
  const events = [];
  const timers = fakeTimers();
  const client = new RoomClient({
    url: 'ws://room.test/ws',
    identity: createIdentity({ id: ID }),
    connect: () => { throw new Error('no socket'); },
    timers,
    onEvent: (event) => events.push(event),
  });
  client.connect();
  assert.equal(client.status, STATUS.BACKOFF);
  assert.ok(events.some((event) => event.type === 'lost'));
});

test('non-terminal server errors surface without touching the connection', () => {
  const { client, sockets, events } = harness();
  client.connect();
  sockets[0].open();
  sockets[0].fromServer(welcomeMessage());
  sockets[0].fromServer({ kind: 'error', code: 'FORBIDDEN', message: 'guests cannot edit' });
  assert.equal(client.status, STATUS.ONLINE);
  assert.ok(events.some((event) => event.type === 'error' && event.code === 'FORBIDDEN'));
});

// ---- leave / rejoin / rename ---------------------------------------------

test('leave drops the roster and queue, and rejoin rejoins the same identity', () => {
  const other = 'b2c3d4e5-0000-4000-8000-000000000002';
  const { client, sockets, events } = harness();
  client.connect();
  sockets[0].open();
  sockets[0].fromServer(welcomeMessage(ID, [{ id: other, name: 'Bo', role: 'guest' }]));
  client.sendChat('a queued line');

  client.leave();
  assert.equal(client.status, STATUS.OFFLINE);
  assert.equal(client.roster.players.size, 0);
  assert.equal(client.outbox.length, 0);
  assert.ok(events.some((event) => event.type === 'left'));

  client.rejoin();
  assert.equal(client.left, false);
  assert.equal(client.status, STATUS.CONNECTING);
  sockets[1].open();
  assert.deepEqual(sockets[1].sent, [{ kind: 'hello', id: ID, name: 'Tester', token: 'tok-1' }]);
});

test('rename persists immediately and re-hellos the live socket', () => {
  const { client, sockets, storage } = harness();
  client.connect();
  sockets[0].open();
  sockets[0].fromServer(welcomeMessage());

  assert.equal(client.rename('   '), false); // normalizes to nothing
  assert.equal(client.rename('Meadow Walker'), true);
  assert.equal(client.identity.name, 'Meadow Walker');
  assert.equal(JSON.parse(storage.map.get(IDENTITY_KEY)).name, 'Meadow Walker');
  const hellos = sockets[0].sent.filter((message) => message.kind === 'hello');
  assert.equal(hellos.length, 2);
  assert.equal(hellos[1].name, 'Meadow Walker');
});

test('chat, boardOp and claim reach the wire with their protocol shapes', () => {
  const { client, sockets } = harness();
  client.connect();
  sockets[0].open();
  sockets[0].fromServer(welcomeMessage());
  client.sendChat(' hi ');
  client.sendBoardOp({ type: 'update', objectId: 'form-3', data: { x: 1 } });
  client.claim('open sesame');
  assert.deepEqual(sockets[0].sent.slice(-3), [
    { kind: 'chat', text: ' hi ' },
    { kind: 'boardOp', op: { type: 'update', objectId: 'form-3', data: { x: 1 } } },
    { kind: 'claim', passphrase: 'open sesame' },
  ]);
});

// ---- roster unit ----------------------------------------------------------

test('RoomRoster upsert, move and sweep are pure with respect to now', () => {
  const roster = new RoomRoster(DEFAULT_GRACE_MS);
  const { player } = roster.upsert({ id: 'p1', name: 'Bo', role: 'guest' }, 0);
  assert.deepEqual(player, { id: 'p1', name: 'Bo', role: 'guest', pose: null, leavingAt: null });

  roster.markLeaving('p1', 100);
  assert.deepEqual(roster.sweep(100 + DEFAULT_GRACE_MS - 1), []);
  assert.deepEqual(roster.sweep(100 + DEFAULT_GRACE_MS), ['p1']);
  assert.deepEqual(roster.sweep(100 + DEFAULT_GRACE_MS), []); // already gone
});
