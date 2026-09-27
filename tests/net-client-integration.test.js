import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {createRoomServer} from '../server/index.js';
import {RoomClient, STATUS, createIdentity} from '../src/net/client.js';

const A = 'a1b2c3d4-0000-4000-8000-000000000001';
const B = 'b2c3d4e5-0000-4000-8000-000000000002';

// Two real RoomClient instances over real WebSockets against the real room
// server — the join/leave/move presence sync the browser will run (AC-7.1,
// AC-7.7). The client-side ~10 s grace is shortened here so the sweep runs fast.
// Waits for a NEW event matching the predicate — only entries appended after
// `from` are scanned, so a stale earlier match (e.g. the first welcome) never
// satisfies a later wait.
async function until(events, predicate, label = 'event', from = 0) {
  const deadline = Date.now() + 3000;
  for (;;) {
    const found = events.slice(from).find(predicate);
    if (found) return found;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}; saw: ${events.map((event) => event.type).join(',')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function clientFor(url, id, name, events) {
  return new RoomClient({
    url,
    identity: createIdentity({id, name}),
    connect: (target) => new WebSocket(target),
    storage: null,
    graceMs: 600,
    onEvent: (event) => events.push(event),
  });
}

test('two clients see each other join, move, and leave', async () => {
  const room = await createRoomServer({persistDelayMs: 500}).init();
  await room.listen(0, '127.0.0.1');
  const url = `ws://127.0.0.1:${room.address().port}/ws`;
  const anaEvents = [], boEvents = [];
  let ana, bo;
  try {
    // ---- both auto-join; each sees the other ----
    ana = clientFor(url, A, 'Ana', anaEvents);
    ana.connect();
    await until(anaEvents, (event) => event.type === 'welcome', 'ana welcome');
    assert.equal(ana.status, STATUS.ONLINE);

    bo = clientFor(url, B, 'Bo', boEvents);
    bo.connect();
    await until(boEvents, (event) => event.type === 'welcome', 'bo welcome');
    // Bo's snapshot already contains Ana — spawns without a join event.
    const snapshotJoin = await until(boEvents, (event) => event.type === 'player-join', 'bo snapshot join');
    assert.equal(snapshotJoin.player.id, A);

    const anaSeesBo = await until(anaEvents, (event) => event.type === 'player-join' && event.player.id === B, 'ana sees bo');
    assert.equal(anaSeesBo.player.name, 'Bo');

    // ---- Bo drags: pose relays to Ana as a move ----
    bo.setPose({x: 2, y: 0, z: 5});
    const move = await until(anaEvents, (event) => event.type === 'player-move' && event.id === B, 'ana sees bo move');
    assert.deepEqual(move.pose, {x: 2, y: 0, z: 5});

    // ---- Ana leaves the board: Bo fades her out, then removes her ----
    ana.leave();
    await until(boEvents, (event) => event.type === 'player-leave' && event.player.id === A, 'bo sees ana leave');
    bo.step(Date.now() + 700); // run Bo's render-loop sweep past the 600 ms grace
    const remove = await until(boEvents, (event) => event.type === 'player-remove' && event.id === A, 'bo sweeps ana');
    assert.equal(remove.id, A);
    assert.deepEqual(room.snapshot().players.map((player) => player.id), [B]);

    // ---- Ana rejoins: her entity re-spawns for Bo ----
    const rejoinMark = anaEvents.length;
    ana.rejoin();
    await until(anaEvents, (event) => event.type === 'welcome', 'ana rejoin', rejoinMark);
    await until(boEvents, (event) => event.type === 'player-join' && event.player.id === A, 'bo sees ana rejoin');

    // ---- renaming propagates as a presence update ----
    ana.rename('Ana II');
    const update = await until(boEvents, (event) => event.type === 'player-update' && event.player.id === A, 'bo sees rename');
    assert.equal(update.player.name, 'Ana II');
  } finally {
    ana?.leave();
    bo?.leave();
    await room.close();
  }
});
