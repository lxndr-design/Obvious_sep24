import test from 'node:test';
import assert from 'node:assert/strict';
import {ChatBubbles, ChatLog, CHAT_EXPIRY_MS, CHAT_LOG_STORAGE_KEY, MAX_LOG_ENTRIES, PERSISTED_LOG_ENTRIES, RECENT_WINDOW, SHOW_MORE_STEP, clampBubbleAnchor, composeChatText, loadChatLog, saveChatLog, splitLogWindow, visibleLogWindow} from '../src/chat.js';
import {LIMITS} from '../src/net/protocol.js';

test('composeChatText mirrors the protocol validator', () => {
  // Normalization: trim, collapse whitespace, strip control characters.
  assert.deepEqual(composeChatText('  hello   meadow  '), {ok: true, text: 'hello meadow'});
  assert.deepEqual(composeChatText('a\u0007b\nc'), {ok: true, text: 'abc'});

  // Empty after normalization is rejected with the protocol's error.
  const empty = composeChatText('   \u0007 ');
  assert.equal(empty.ok, false);

  // Non-strings are rejected, never coerced.
  assert.equal(composeChatText(null).ok, false);
  assert.equal(composeChatText(42).ok, false);

  // Boundary: exactly 280 usable characters pass; 281 fail.
  const long = composeChatText(`  ${'x'.repeat(LIMITS.MAX_CHAT_CHARS)}  `);
  assert.equal(long.ok, true);
  assert.equal(long.text.length, LIMITS.MAX_CHAT_CHARS);
  const over = composeChatText('x'.repeat(LIMITS.MAX_CHAT_CHARS + 1));
  assert.equal(over.ok, false);
});

test('bubbles expire after CHAT_EXPIRY_MS and replacement restarts the clock', () => {
  const bubbles = new ChatBubbles();
  bubbles.show('p1', {name: 'Ana', text: 'first'}, 1000);
  assert.equal(bubbles.bubbles.get('p1').expiresAt, 1000 + CHAT_EXPIRY_MS);
  assert.deepEqual(bubbles.step(1000 + CHAT_EXPIRY_MS - 1), []);

  // A fresh line from the same player replaces the bubble and restarts expiry.
  bubbles.show('p1', {name: 'Ana', text: 'second'}, 5000);
  assert.deepEqual(bubbles.step(1000 + CHAT_EXPIRY_MS), []);
  assert.equal(bubbles.bubbles.get('p1').text, 'second');
  assert.equal(bubbles.bubbles.get('p1').expiresAt, 5000 + CHAT_EXPIRY_MS);

  // At expiry (inclusive) the bubble retires and its id is reported.
  assert.deepEqual(bubbles.step(5000 + CHAT_EXPIRY_MS), ['p1']);
  assert.equal(bubbles.bubbles.size, 0);
});

test('active() reports present, unexpired bubbles only', () => {
  const bubbles = new ChatBubbles();
  bubbles.show('p1', {name: 'Ana', text: 'hello'}, 1000);
  assert.equal(bubbles.active('p1', 1000), true);
  assert.equal(bubbles.active('p1', 1000 + CHAT_EXPIRY_MS - 1), true);
  assert.equal(bubbles.active('p1', 1000 + CHAT_EXPIRY_MS), false);
  assert.equal(bubbles.active('ghost', 1000), false); // unknown player
  bubbles.clear('p1');
  assert.equal(bubbles.active('p1', 1000), false);
});

test('multiple bubbles expire independently, in insertion order', () => {
  const bubbles = new ChatBubbles();
  bubbles.show('p1', {name: 'Ana', text: 'one'}, 0);
  bubbles.show('p2', {name: 'Bo', text: 'two'}, 100);
  bubbles.clear('p2');
  assert.equal(bubbles.bubbles.has('p2'), false);
  assert.deepEqual(bubbles.step(CHAT_EXPIRY_MS), ['p1']);
});

test('session log keeps order, caps at MAX_LOG_ENTRIES, and never reorders', () => {
  const log = new ChatLog();
  const first = log.add({id: 'p1', name: 'Ana', text: 'first', at: 1});
  assert.equal(first.text, 'first');
  log.add({id: 'p2', name: 'Bo', text: 'second', at: 2});

  for (let i = 0; i < MAX_LOG_ENTRIES; i++) log.add({id: 'p1', name: 'Ana', text: `m${i}`, at: 3 + i});
  assert.equal(log.items.length, MAX_LOG_ENTRIES);
  assert.equal(log.items[0].text, 'm0'); // the two oldest fell off the top
  assert.equal(log.items[MAX_LOG_ENTRIES - 1].text, `m${MAX_LOG_ENTRIES - 1}`); // newest last

  // Entries are plain records; a caller may hold a reference without surprises.
  assert.deepEqual(log.items[0], {id: 'p1', name: 'Ana', text: 'm0', at: 3});
});

test('clampBubbleAnchor keeps the bubble inside the stage near every edge', () => {
  const stage = {stageWidth: 1280, stageHeight: 640, width: 180, height: 30};
  // Comfortable mid-stage point passes through unchanged.
  const mid = clampBubbleAnchor({x: 640, y: 300, ...stage});
  assert.deepEqual(mid, {x: 640, y: 300});
  // Near the top edge the anchor is pushed down so the box clears the header.
  const top = clampBubbleAnchor({x: 640, y: 40, ...stage});
  assert.equal(top.y, 8 + 30 + 26);
  assert.equal(top.x, 640);
  // Near the left/right edges the anchor is pulled inside so the box stays visible.
  assert.equal(clampBubbleAnchor({x: 10, y: 300, ...stage}).x, 8 + 90);
  assert.equal(clampBubbleAnchor({x: 1270, y: 300, ...stage}).x, 1280 - 8 - 90);
  // Near the bottom the anchor never escapes below the stage.
  assert.equal(clampBubbleAnchor({x: 640, y: 639, ...stage}).y, 640 - 8);
});

// ---- log panel window (post-release D5) ----

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    map,
  };
}

function logEntries(count) {
  return Array.from({length: count}, (_, i) => ({id: 'p1', name: 'Ana', text: `m${i}`, at: i}));
}

test('visibleLogWindow shows the last RECENT_WINDOW entries and grows by SHOW_MORE_STEP per reveal', () => {
  const items = logEntries(34);
  assert.equal(visibleLogWindow(items).length, RECENT_WINDOW);
  assert.equal(visibleLogWindow(items)[0].text, `m${34 - RECENT_WINDOW}`); // window ends at the newest

  assert.equal(visibleLogWindow(items, SHOW_MORE_STEP).length, RECENT_WINDOW + SHOW_MORE_STEP);
  assert.equal(visibleLogWindow(items, 3 * SHOW_MORE_STEP).length, 34); // clamped at the log
  assert.deepEqual(visibleLogWindow([], 5), []);
  assert.equal(visibleLogWindow(items, -4).length, RECENT_WINDOW); // negative reveal is just zero
});

test('splitLogWindow marks the newest RECENT_WINDOW entries recent and revealed ones older', () => {
  const window = visibleLogWindow(logEntries(25), SHOW_MORE_STEP);
  const {older, recent} = splitLogWindow(window);
  assert.equal(older.length, window.length - RECENT_WINDOW);
  assert.equal(recent.length, RECENT_WINDOW);
  assert.equal(older[0].text, `m${25 - RECENT_WINDOW - SHOW_MORE_STEP}`); // first revealed entry
  assert.equal(recent[0].text, `m${25 - RECENT_WINDOW}`);
  assert.equal(recent[RECENT_WINDOW - 1].text, 'm24'); // newest last

  // A short log is all recent — nothing older exists yet.
  const short = splitLogWindow(visibleLogWindow(logEntries(4)));
  assert.deepEqual(short.older, []);
  assert.equal(short.recent.length, 4);
});

// ---- reload persistence (post-release D5) ----

test('the log persists recent entries and a reload restores them in order', () => {
  const storage = memoryStorage();
  const log = new ChatLog();
  for (let i = 0; i < 60; i++) log.add({id: 'p1', name: 'Ana', text: `m${i}`, at: i});
  assert.equal(saveChatLog(storage, log.items), true);
  assert.equal(JSON.parse(storage.map.get(CHAT_LOG_STORAGE_KEY)).length, PERSISTED_LOG_ENTRIES);

  // A fresh page: a new ChatLog restores what was saved, oldest first.
  const restored = loadChatLog(storage);
  assert.equal(restored.length, PERSISTED_LOG_ENTRIES);
  assert.equal(restored[0].text, `m${60 - PERSISTED_LOG_ENTRIES}`);
  assert.equal(restored[restored.length - 1].text, 'm59');
  const reloaded = new ChatLog();
  for (const entry of restored) reloaded.add(entry);
  // The restored log drives the same dimmed recent window the live log had.
  const {recent} = splitLogWindow(visibleLogWindow(reloaded.items));
  assert.equal(recent.length, RECENT_WINDOW);
  assert.equal(recent[RECENT_WINDOW - 1].text, 'm59');

  // Writing past the cap keeps only the newest slice on the next save.
  log.add({id: 'p1', name: 'Ana', text: 'm60', at: 60});
  saveChatLog(storage, log.items);
  const again = loadChatLog(storage);
  assert.equal(again.length, PERSISTED_LOG_ENTRIES);
  assert.equal(again[again.length - 1].text, 'm60');
});

test('loadChatLog tolerates missing storage, a corrupt record, and malformed entries', () => {
  assert.deepEqual(loadChatLog(null), []);
  assert.deepEqual(loadChatLog(memoryStorage()), []); // nothing saved yet

  const storage = memoryStorage();
  storage.setItem(CHAT_LOG_STORAGE_KEY, '{not json');
  assert.deepEqual(loadChatLog(storage), []);

  storage.setItem(CHAT_LOG_STORAGE_KEY, '{"a":1}');
  assert.deepEqual(loadChatLog(storage), []); // not an array

  storage.setItem(CHAT_LOG_STORAGE_KEY, JSON.stringify([
    null,
    42,
    {name: 'Ana'}, // no text
    {text: 'hi'}, // no name
    {name: 5, text: 'dropped'}, // non-string name
    {name: 'Ana', text: 'kept', id: 'p1', at: 7}, // well formed
  ]));
  assert.deepEqual(loadChatLog(storage), [{id: 'p1', name: 'Ana', text: 'kept', at: 7}]);

  storage.setItem(CHAT_LOG_STORAGE_KEY, JSON.stringify([{name: 'Ana', text: 'no timestamp'}]));
  assert.deepEqual(loadChatLog(storage), [{id: '', name: 'Ana', text: 'no timestamp', at: 0}]);
});

test('saveChatLog reports storage failures instead of throwing through the chat path', () => {
  const failing = {getItem: () => null, setItem: () => { throw new Error('quota exceeded'); }, removeItem: () => {}};
  assert.equal(saveChatLog(failing, [{id: 'p1', name: 'Ana', text: 'hi', at: 1}]), false);
});
