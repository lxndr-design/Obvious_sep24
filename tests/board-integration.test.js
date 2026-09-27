import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRoomServer} from '../server/index.js';
import {RoomClient, createIdentity} from '../src/net/client.js';

const A = 'a1b2c3d4-0000-4000-8000-000000000001';
const B = 'b2c3d4e5-0000-4000-8000-000000000002';
const C = 'c3d4e5f6-0000-4000-8000-000000000003';
const PASSPHRASE = 'meadow-keeper';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eternity-board-'));

// Waits for a NEW event matching the predicate — only entries appended after
// `from` are scanned, so a stale earlier match never satisfies a later wait.
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
    onEvent: (event) => events.push(event),
  });
}

const benchAt = (x, z) => ({
  id: 1, type: 'bench', position: [x, 0.25, z], rotation: [0, 0, 0, 1],
  gridSize: 2, hanging: false, cableLength: 5, properties: {locked: false},
});

async function startRoom(options = {}) {
  const room = await createRoomServer({adminPassphrase: PASSPHRASE, ...options}).init();
  await room.listen(0, '127.0.0.1');
  return {room, url: `ws://127.0.0.1:${room.address().port}/ws`};
}

test('board ops replicate in order, a joining client gets the snapshot, guests are refused', async () => {
  const {room, url} = await startRoom({statePath: path.join(tmp, 'board-state.json')});
  const anaEvents = [], boEvents = [], carlEvents = [];
  let ana, bo, carl;
  try {
    ana = clientFor(url, A, 'Ana', anaEvents);
    ana.connect();
    const anaWelcome = await until(anaEvents, (event) => event.type === 'welcome', 'ana welcome');
    // The welcome carries the room board — empty for a fresh room (U5 contract).
    assert.deepEqual(anaWelcome.board, {objects: {}, revision: 0});
    ana.claim(PASSPHRASE);
    await until(anaEvents, (event) => event.type === 'roleChange' && event.role === 'admin', 'ana admin');

    bo = clientFor(url, B, 'Bo', boEvents);
    bo.connect();
    await until(boEvents, (event) => event.type === 'welcome', 'bo welcome');

    // ---- a guest's board op is refused by the server (AC-7.3) ----
    bo.sendBoardOp({type: 'add', objectId: 'bo-1', data: benchAt(1, 1)});
    const refusal = await until(boEvents, (event) => event.type === 'error', 'bo refusal');
    assert.equal(refusal.code, 'FORBIDDEN');

    // ---- the admin's add, move, and delete relay as ordered ops (AC-7.6) ----
    ana.sendBoardOp({type: 'add', objectId: 'ana-1', data: benchAt(0, 0)});
    ana.sendBoardOp({type: 'update', objectId: 'ana-1', data: benchAt(3, -2)});
    const boFirst = await until(boEvents, (event) => event.type === 'boardOp', 'bo sees add');
    assert.equal(boFirst.by, A);
    assert.equal(boFirst.op.type, 'add');
    assert.deepEqual(boFirst.op.data.position, [0, 0.25, 0]);
    const boSecond = await until(boEvents, (event) => event.type === 'boardOp' && event.op.type === 'update', 'bo sees move');
    assert.equal(boSecond.revision, 2);
    assert.deepEqual(boSecond.op.data.position, [3, 0.25, -2]);
    ana.sendBoardOp({type: 'remove', objectId: 'ana-1'});
    const boThird = await until(boEvents, (event) => event.type === 'boardOp' && event.op.type === 'remove', 'bo sees delete');
    assert.equal(boThird.revision, 3);
    assert.equal(boThird.op.objectId, 'ana-1');

    // ---- last-write-wins per object id: two writes to one object, the later sticks ----
    ana.sendBoardOp({type: 'add', objectId: 'ana-2', data: benchAt(1, 0)});
    ana.sendBoardOp({type: 'update', objectId: 'ana-2', data: benchAt(5, 5)});
    await until(boEvents, (event) => event.type === 'boardOp' && event.revision === 5, 'bo settles lww');

    // ---- a late joiner receives the current board in the welcome snapshot ----
    carl = clientFor(url, C, 'Carl', carlEvents);
    carl.connect();
    const carlWelcome = await until(carlEvents, (event) => event.type === 'welcome', 'carl welcome');
    assert.deepEqual(Object.keys(carlWelcome.board.objects), ['ana-2']);
    assert.deepEqual(carlWelcome.board.objects['ana-2'].position, [5, 0.25, 5]);
    assert.equal(carlWelcome.board.revision, 5);
  } finally {
    for (const client of [ana, bo, carl]) client?.leave?.();
    await room.close();
  }
});

test('the board snapshot survives a server restart (AC-7.6 persistence round-trip)', async () => {
  const statePath = path.join(tmp, 'restart-board.json');
  const first = await startRoom({statePath});
  const anaEvents = [];
  let ana;
  try {
    ana = clientFor(first.url, A, 'Ana', anaEvents);
    ana.connect();
    await until(anaEvents, (event) => event.type === 'welcome', 'ana welcome');
    ana.claim(PASSPHRASE);
    await until(anaEvents, (event) => event.type === 'roleChange' && event.role === 'admin', 'ana admin');
    ana.sendBoardOp({type: 'add', objectId: 'ana-7', data: benchAt(-2, 4)});
    ana.sendBoardOp({type: 'update', objectId: 'ana-7', data: benchAt(-4, 4)});
    await until(anaEvents, (event) => event.type === 'boardOp' && event.revision === 2, 'echo settled');
    ana.leave();
    await first.room.flush(); // the debounce lands before the simulated crash
    await first.room.close();
  } catch (err) {
    await first.room.close();
    throw err;
  }
  const second = await startRoom({statePath});
  const carlEvents = [];
  let carl;
  try {
    carl = clientFor(second.url, C, 'Carl', carlEvents);
    carl.connect();
    const carlWelcome = await until(carlEvents, (event) => event.type === 'welcome', 'carl welcome after restart');
    assert.deepEqual(carlWelcome.board.objects['ana-7'].position, [-4, 0.25, 4]);
    assert.equal(carlWelcome.board.revision, 2);
  } finally {
    carl?.leave?.();
    await second.room.close();
  }
});
