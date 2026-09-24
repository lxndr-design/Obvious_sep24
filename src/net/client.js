// Browser-facing room client for the Eternity multi-user area (Feature 7, U2).
// Pure module — no DOM, no globals: the WebSocket factory, storage and clock are
// injected, so node --test drives the same state machine the browser runs.
// The server (U1) removes a player the moment its socket closes; the ~10 s
// disconnect grace lives here — `presence leave` only marks a player as
// leaving, and `step()` retires it once the grace expires (a rejoin cancels it).
import {normalizeName, isValidPlayerId} from './protocol.js';

export const STATUS = {
  OFFLINE: 'offline', // not joined; user left or never joined
  CONNECTING: 'connecting',
  ONLINE: 'online',
  BACKOFF: 'backoff', // waiting for the next reconnect attempt
  CLOSED: 'closed', // terminal: replaced, banned, kicked or failed permanently
};

// Server rejections that must not loop a reconnect — acting on them (bans,
// replacement by another session) is deliberate, not transient.
export const TERMINAL_ERRORS = new Set(['REPLACED', 'BANNED', 'KICKED']);

export const DEFAULT_GRACE_MS = 10_000;
export const PRESENCE_INTERVAL_MS = 100; // 10 Hz pose relay, latest-wins
export const DEFAULT_QUEUE_LIMIT = 64;
export const IDENTITY_KEY = 'eternity.identity';

export const noop = () => {};

// Identity: a client-minted UUID (dashes stripped is still url-safe and passes
// isValidPlayerId) plus an optional display name and server session token.
export function randomPlayerId() {
  return crypto.randomUUID().replace(/-/g, '');
}

export function createIdentity({id, name, token} = {}) {
  const playerId = id ?? randomPlayerId();
  if (!isValidPlayerId(playerId)) throw new TypeError('identity id must be 8-64 url-safe characters');
  return {id: playerId, ...(name === undefined ? {} : {name}), ...(token === undefined ? {} : {token})};
}

// storage is {getItem, setItem, removeItem} — localStorage in the browser, a
// Map-backed fake in tests. A corrupt record must never block joining.
export function loadIdentity(storage, now = Date.now) {
  if (!storage) return createIdentity();
  let parsed = null;
  try {
    parsed = JSON.parse(storage.getItem(IDENTITY_KEY) ?? 'null');
  } catch {
    parsed = null;
  }
  try {
    if (parsed && isValidPlayerId(parsed.id)) {
      const identity = createIdentity(parsed);
      if (typeof identity.name === 'string' && identity.name) identity.name = normalizeName(identity.name);
      else delete identity.name;
      if (typeof identity.token !== 'string') delete identity.token;
      return identity;
    }
  } catch {
    // fall through to a fresh identity
  }
  const fresh = createIdentity();
  saveIdentity(storage, fresh, now);
  return fresh;
}

export function saveIdentity(storage, identity, now = Date.now) {
  if (!storage) return;
  storage.setItem(IDENTITY_KEY, JSON.stringify({...identity, savedAt: now()}));
}

// Delay before reconnect attempt n (1-based): base × factor^(n-1), capped,
// with ±25% multiplicative jitter so a roomful of clients doesn't sync up.
export function nextBackoffMs(attempt, {baseMs = 500, factor = 2, maxMs = 30_000, random = Math.random} = {}) {
  const capped = Math.min(baseMs * factor ** Math.max(0, attempt - 1), maxMs);
  const jitter = 0.75 + 0.5 * random();
  return Math.min(Math.round(capped * jitter), Math.round(maxMs * 1.25));
}

// Latest accepted pose per remote player, plus a pending-removal stamp for the
// grace window. Keyed by player id; the local identity never enters this map.
export class RoomRoster {
  constructor(graceMs = DEFAULT_GRACE_MS) {
    this.graceMs = graceMs;
    this.players = new Map();
  }

  upsert(view, now, pose = null) {
    const existing = this.players.get(view.id);
    const player = {...view, pose: pose ?? existing?.pose ?? null, leavingAt: null};
    this.players.set(view.id, player);
    return {player, isNew: !existing};
  }

  markLeaving(id, now) {
    const player = this.players.get(id);
    if (!player) return null;
    player.leavingAt = now + this.graceMs;
    return player;
  }

  move(id, pose, now) {
    const player = this.players.get(id);
    if (!player) return null;
    player.pose = pose;
    // Any sign of life from a leaving player cancels the pending retirement.
    player.leavingAt = null;
    return player;
  }

  // Retire players whose grace expired; returns the ids removed.
  sweep(now) {
    const removed = [];
    for (const [id, player] of this.players) {
      if (player.leavingAt !== null && now >= player.leavingAt) {
        this.players.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  clear() {
    this.players.clear();
  }
}

export class RoomClient {
  // connect(url) → ws-like socket with send/close plus onopen/onmessage/onclose/
  // onerror assignment (browser WebSocket and the `ws` package both qualify).
  constructor({url, identity, connect, storage = null, graceMs = DEFAULT_GRACE_MS, queueLimit = DEFAULT_QUEUE_LIMIT, onEvent = noop, timers = {setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis)}, random = Math.random}) {
    this.url = url;
    this.identity = {...identity};
    this.connectTransport = connect;
    this.storage = storage;
    this.graceMs = graceMs;
    this.queueLimit = queueLimit;
    this.onEvent = onEvent;
    this.timers = timers;
    this.random = random;
    this.socket = null;
    this.status = STATUS.OFFLINE;
    this.left = false; // user-initiated leave — never reconnect across it
    this.attempt = 0; // consecutive failed connects
    this.retryTimer = null;
    this.roster = new RoomRoster(graceMs);
    this.outbox = []; // chat/boardOp/claim sent while offline, flushed after welcome
    this.pendingPose = null; // latest presence while throttled or offline
    this.lastPresenceSent = 0;
  }

  emit(event) {
    this.onEvent(event);
  }

  setStatus(status) {
    if (this.status === status) return;
    const previous = this.status;
    this.status = status;
    this.emit({type: 'status', status, previous});
  }

  connect() {
    if (this.left || this.status === STATUS.CONNECTING || this.status === STATUS.ONLINE || this.status === STATUS.CLOSED) return;
    this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.setStatus(STATUS.CONNECTING);
    let socket;
    try {
      socket = this.connectTransport(this.url);
    } catch (error) {
      this.onLost(error?.message ?? 'connect failed');
      return;
    }
    this.socket = socket;
    socket.onopen = () => this.onOpen();
    socket.onmessage = (event) => this.onMessage(event.data);
    socket.onclose = () => this.onClose();
    socket.onerror = () => {}; // close follows; details are not actionable
  }

  onOpen() {
    // The token proves a stored role is ours (protocol: roles bind to server
    // session tokens); a fresh identity joins without one and receives it here.
    // Sent directly: the status is still CONNECTING, so send() would queue it.
    this.socket.send(JSON.stringify({kind: 'hello', id: this.identity.id, ...(this.identity.name ? {name: this.identity.name} : {}), ...(this.identity.token ? {token: this.identity.token} : {})}));
  }

  send(message) {
    if (this.socket && this.status === STATUS.ONLINE) this.socket.send(JSON.stringify(message));
    else this.enqueue(message);
  }

  enqueue(message) {
    if (this.left || this.status === STATUS.CLOSED) return;
    this.outbox.push(message);
    if (this.outbox.length > this.queueLimit) this.outbox.shift(); // drop oldest
  }

  // Volatile by design: only the latest pose is ever worth sending.
  setPose(pose) {
    this.pendingPose = {...pose};
    this.flushPresence(Date.now());
  }

  flushPresence(now) {
    if (this.status !== STATUS.ONLINE || !this.pendingPose) return;
    if (now - this.lastPresenceSent < PRESENCE_INTERVAL_MS) return;
    this.lastPresenceSent = now;
    const pose = this.pendingPose;
    this.pendingPose = null;
    this.socket.send(JSON.stringify({kind: 'presence', pose}));
  }

  sendChat(text) {
    this.send({kind: 'chat', text});
  }

  sendBoardOp(op) {
    this.send({kind: 'boardOp', op});
  }

  claim(passphrase) {
    this.send({kind: 'claim', passphrase});
  }

  // Editing the display name re-hellos the live socket; the server broadcasts
  // the rename as a presence update (protocol: rejoin refreshes name).
  rename(name) {
    const normalized = normalizeName(name);
    if (!normalized) return false;
    this.identity.name = normalized;
    saveIdentity(this.storage, this.identity);
    if (this.status === STATUS.ONLINE) this.onOpen();
    return true;
  }

  onMessage(data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return; // a non-JSON frame from our own server is a bug in the server
    }
    if (!message || typeof message !== 'object') return;
    switch (message.kind) {
      case 'welcome': return this.onWelcome(message);
      case 'presence': return this.onPresence(message);
      case 'chat': return this.emit({type: 'chat', from: message.from, name: message.name, text: message.text});
      case 'boardOp': return this.emit({type: 'boardOp', op: message.op, by: message.by, revision: message.revision});
      case 'roleChange': return this.emit({type: 'roleChange', playerId: message.playerId, role: message.role, by: message.by});
      case 'error': return this.onError(message);
      default: return;
    }
  }

  onWelcome(message) {
    this.attempt = 0;
    this.identity.token = message.token;
    saveIdentity(this.storage, this.identity);
    // Snapshot is authoritative; keep a known player's last pose across a
    // reconcile (the snapshot itself carries no poses). Copy before clear():
    // the roster Map is reused, so a bare reference would be wiped by clear().
    const known = new Map(this.roster.players);
    this.roster.clear();
    for (const view of message.snapshot?.players ?? []) {
      if (view.id === this.identity.id) continue;
      const previous = known.get(view.id);
      this.roster.upsert(view, Date.now(), previous?.pose ?? null);
      this.emit({type: 'player-join', player: this.roster.players.get(view.id)});
    }
    this.setStatus(STATUS.ONLINE);
    this.emit({type: 'welcome', id: message.id, name: message.name, role: message.role, token: message.token});
    // Presence queued before the socket came up goes out now, in order.
    while (this.outbox.length) {
      const queued = this.outbox.shift();
      this.socket.send(JSON.stringify(queued));
    }
    this.flushPresence(Date.now());
  }

  onPresence(message) {
    const now = Date.now();
    if (message.event === 'join') {
      const {player} = this.roster.upsert(message.player, now);
      this.emit({type: 'player-join', player});
    } else if (message.event === 'leave') {
      const player = this.roster.markLeaving(message.player.id, now);
      if (player) this.emit({type: 'player-leave', player, graceUntil: player.leavingAt});
    } else if (message.event === 'move') {
      const player = this.roster.move(message.id, message.pose, now);
      if (player) this.emit({type: 'player-move', id: message.id, pose: message.pose});
    } else if (message.event === 'update') {
      const player = this.roster.upsert(message.player, now);
      this.emit({type: 'player-update', player: player.player});
    }
  }

  onError(message) {
    if (TERMINAL_ERRORS.has(message.code)) {
      // Close with intent: no reconnect loop against a replaced/banned identity.
      this.setStatus(STATUS.CLOSED);
      this.socket?.close();
      this.socket = null;
      this.roster.clear();
    }
    this.emit({type: 'error', code: message.code, message: message.message});
  }

  onClose() {
    this.socket = null;
    if (this.left) {
      this.setStatus(STATUS.OFFLINE);
      return;
    }
    if (this.status === STATUS.CLOSED) return;
    this.onLost('connection lost');
  }

  onLost(reason) {
    this.socket = null;
    this.setStatus(STATUS.BACKOFF);
    const delay = nextBackoffMs(++this.attempt, {random: this.random});
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
    this.emit({type: 'lost', reason, attempt: this.attempt, retryInMs: delay});
  }

  // Deliberate departure: drop the entity everywhere and stop reconnecting.
  leave() {
    this.left = true;
    this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.outbox.length = 0;
    this.pendingPose = null;
    this.roster.clear();
    const socket = this.socket;
    this.socket = null;
    this.setStatus(STATUS.OFFLINE);
    if (socket) socket.close();
    this.emit({type: 'left'});
  }

  rejoin() {
    this.left = false;
    this.setStatus(STATUS.OFFLINE);
    this.connect();
  }

  // Drives the render-loop side: grace expiries and throttled presence flush.
  step(now = Date.now()) {
    if (!this.left && this.status !== STATUS.CLOSED) {
      for (const id of this.roster.sweep(now)) this.emit({type: 'player-remove', id});
      this.flushPresence(now);
    }
  }
}
