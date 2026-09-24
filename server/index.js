// Self-hosted realtime room server for the Eternity neo-site (Feature 7).
// node:http + ws — the only new runtime dependency. Serves the built dist/,
// upgrades /ws, owns room state (players, roles, bans, board snapshot), issues
// HMAC session tokens, enforces the role matrix, and persists a debounced
// JSON snapshot. Run with `npm run server`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  ERROR_CODES,
  LIMITS,
  applyBoardOp,
  decodeMessage,
  encodeMessage,
  normalizeName,
  roleAtLeast,
} from '../src/net/protocol.js';

const TOKEN_VERSION = 'v1';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HEARTBEAT_MS = 30_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

// Constant-time secret comparison — hash both sides so lengths never leak.
function secretsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || b.length === 0) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function signToken(secret, id, issuedAt = Date.now()) {
  const body = `${TOKEN_VERSION}.${id}.${issuedAt}`;
  const mac = createHmac('sha256', secret).update(body).digest('hex');
  return `${body}.${mac}`;
}

// Returns {ok:true, id} or {ok:false}.
export function verifyToken(secret, token, now = Date.now()) {
  if (typeof token !== 'string') return { ok: false };
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return { ok: false };
  const [, id, issuedAtRaw, mac] = parts;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return { ok: false };
  if (now - issuedAt > TOKEN_TTL_MS) return { ok: false };
  const expected = createHmac('sha256', secret).update(`${TOKEN_VERSION}.${id}.${issuedAtRaw}`).digest('hex');
  const given = Buffer.from(mac, 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (given.length !== want.length || !timingSafeEqual(given, want)) return { ok: false };
  return { ok: true, id };
}

function freshState() {
  return {
    version: 1,
    secret: randomBytes(32).toString('hex'),
    adminId: null,
    roles: {}, // identityId → 'editor' | 'guest' (admin lives in adminId)
    bans: [],
    board: { objects: {}, revision: 0 },
  };
}

export class RoomServer {
  constructor(options = {}) {
    this.opts = {
      statePath: null,
      adminPassphrase: '',
      distDir: 'dist',
      persistDelayMs: 500,
      log: () => {},
      ...options,
    };
    this.state = null;
    this.players = new Map(); // identityId → player record
    this.nameCounter = 0;
    this.persistTimer = null;
    this.dirty = false;
    this.heartbeat = null;

    this.server = http.createServer((req, res) => this.handleHttp(req, res));
    // maxPayload stays far above the protocol cap so oversized frames reach our
    // validator and get an error response instead of a bare 1009 close.
    this.wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.MAX_MESSAGE_BYTES * 4 });
    this.server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));
  }

  async init() {
    this.state = await this.loadState();
    this.heartbeat = setInterval(() => this.sweep(), HEARTBEAT_MS);
    this.heartbeat.unref();
    return this;
  }

  async loadState() {
    if (!this.opts.statePath) return freshState();
    let raw;
    try {
      raw = fs.readFileSync(this.opts.statePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return freshState();
      throw err;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || typeof parsed.secret !== 'string') throw new Error('bad shape');
      const state = freshState();
      state.secret = parsed.secret;
      state.adminId = typeof parsed.adminId === 'string' ? parsed.adminId : null;
      state.roles = isPlainObject(parsed.roles) ? parsed.roles : {};
      state.bans = Array.isArray(parsed.bans) ? parsed.bans.filter((b) => typeof b === 'string') : [];
      state.board = isPlainObject(parsed.board?.objects) ? { objects: parsed.board.objects, revision: parsed.board.revision | 0 } : state.board;
      return state;
    } catch (err) {
      // A corrupt snapshot must not brick the room — surface it loudly, start fresh.
      this.opts.log(`room state at ${this.opts.statePath} is unreadable (${err.message}); starting fresh`);
      return freshState();
    }
  }

  listen(port = 8080, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => {
        this.server.off('error', reject);
        resolve(this.server.address());
      });
    });
  }

  address() {
    return this.server.address();
  }

  async close() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const socket of this.wss.clients) socket.terminate();
    await new Promise((resolve) => this.wss.close(() => resolve()));
    await new Promise((resolve) => this.server.close(() => resolve()));
  }

  // ---- persistence ---------------------------------------------------------

  schedulePersist() {
    this.dirty = true;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flush().catch((err) => this.opts.log(`snapshot write failed: ${err.message}`));
    }, this.opts.persistDelayMs);
    this.persistTimer.unref?.();
  }

  async flush() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (!this.dirty || !this.opts.statePath) return;
    fs.mkdirSync(path.dirname(this.opts.statePath), { recursive: true });
    const tmp = `${this.opts.statePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, this.opts.statePath);
    this.dirty = false;
  }

  // ---- http: static dist with SPA fallback ---------------------------------

  handleHttp(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (/[\0-\x1f\x7f]/.test(pathname)) { // control bytes name no real file — reject, don't fall through to the SPA
      res.writeHead(400).end();
      return;
    }
    const distDir = path.resolve(this.opts.distDir);
    let filePath = path.normalize(path.join(distDir, pathname));
    if (!filePath.startsWith(distDir + path.sep) && filePath !== distDir) {
      res.writeHead(403).end();
      return;
    }
    let stat = statFile(filePath);
    if (stat?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = statFile(filePath);
    }
    if (!stat) {
      const fallback = path.join(distDir, 'index.html');
      if (pathname !== '/' && statFile(fallback)) {
        filePath = fallback; // SPA fallback for client-side routes
        stat = statFile(fallback);
      } else {
        res.writeHead(404).end();
        return;
      }
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': stat.size });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  }

  // ---- websocket -----------------------------------------------------------

  handleUpgrade(req, socket, head) {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
  }

  sweep() {
    for (const socket of this.wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }

  onConnection(ws) {
    ws.isAlive = true;
    ws.player = null;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (data) => this.onMessage(ws, data));
    ws.on('close', () => this.dropPlayer(ws));
    ws.on('error', (err) => this.opts.log(`socket error: ${err.message}`));
  }

  onMessage(ws, data) {
    const decoded = decodeMessage(data instanceof Uint8Array ? data : String(data));
    if (!decoded.ok) {
      this.sendError(ws, decoded.code, decoded.error);
      if (decoded.code !== ERROR_CODES.INVALID) ws.close(); // broken/hostile framing — payload errors keep the connection
      return;
    }
    const message = decoded.message;
    const player = ws.player;
    if (!player) {
      if (message.kind === 'hello') return this.admit(ws, message);
      return this.sendError(ws, ERROR_CODES.HELLO_REQUIRED, 'send hello first');
    }
    switch (message.kind) {
      case 'hello': return this.rejoin(ws, player, message);
      case 'chat': return this.relayChat(player, message);
      case 'presence': return this.relayPresence(player, message);
      case 'boardOp': return this.onBoardOp(player, message);
      case 'claim': return this.onClaim(player, message);
      case 'roleChange': return this.onRoleChange(player, message);
      case 'kick': return this.onKick(player, message);
      case 'ban': return this.onBan(player, message);
      default: return this.sendError(ws, ERROR_CODES.UNKNOWN_KIND, `unknown kind "${message.kind}"`);
    }
  }

  // hello again on a live socket: refresh name/token continuity only.
  rejoin(ws, player, message) {
    const name = normalizeName(message.name) || player.name;
    player.name = name;
    this.broadcast({ kind: 'presence', event: 'update', player: this.playerView(player) });
  }

  admit(ws, message) {
    if (this.state.bans.includes(message.id)) {
      this.sendError(ws, ERROR_CODES.BANNED, 'this identity is banned from the room');
      ws.close();
      return;
    }
    const restored = message.token ? verifyToken(this.state.secret, message.token) : { ok: false };
    const identityOk = restored.ok && restored.id === message.id;
    // Roles bind to server-issued session tokens (spec: Decisions). An identity
    // with a stored role must prove itself with a valid token — ids are public
    // (presence broadcasts them), so the token is the only ownership proof.
    const hasStoredRole = this.state.adminId === message.id || this.state.roles[message.id] !== undefined;
    if (hasStoredRole && !identityOk) {
      this.sendError(ws, ERROR_CODES.FORBIDDEN, 'this identity holds a role and requires a valid session token');
      ws.close();
      return;
    }
    const token = identityOk ? message.token : signToken(this.state.secret, message.id);
    const name = message.name || `Player-${String(++this.nameCounter).padStart(4, '0')}`;
    const existing = this.players.get(message.id);
    if (existing) {
      this.sendError(existing.ws, ERROR_CODES.REPLACED, 'identity joined from another connection');
      existing.ws.close();
    }
    const player = {
      id: message.id,
      name,
      role: this.roleOf(message.id),
      token,
      ws,
      joinedAt: Date.now(),
    };
    this.players.set(message.id, player);
    ws.player = player;
    this.send(ws, {
      kind: 'welcome',
      id: player.id,
      name: player.name,
      role: player.role,
      token,
      snapshot: this.snapshot(),
    });
    this.broadcast({ kind: 'presence', event: 'join', player: this.playerView(player) }, ws);
  }

  roleOf(id) {
    return this.state.adminId === id ? 'admin' : this.state.roles[id] ?? 'guest';
  }

  playerView(player) {
    return { id: player.id, name: player.name, role: player.role };
  }

  snapshot() {
    return {
      board: this.state.board,
      players: [...this.players.values()].map((p) => this.playerView(p)),
    };
  }

  dropPlayer(ws) {
    const player = ws.player;
    if (!player || this.players.get(player.id) !== player) return;
    this.players.delete(player.id);
    ws.player = null;
    this.broadcast({ kind: 'presence', event: 'leave', player: this.playerView(player) });
  }

  // ---- message handlers ----------------------------------------------------

  relayChat(player, message) {
    this.broadcast({ kind: 'chat', from: player.id, name: player.name, text: message.text });
  }

  relayPresence(player, message) {
    player.pose = message.pose;
    this.broadcast({ kind: 'presence', event: 'move', id: player.id, pose: message.pose }, player.ws);
  }

  onBoardOp(player, message) {
    if (!roleAtLeast(player.role, 'editor')) {
      this.sendError(player.ws, ERROR_CODES.FORBIDDEN, 'board edits need the editor role');
      return;
    }
    const { board, applied } = applyBoardOp(this.state.board, message.op);
    if (!applied) {
      this.sendError(player.ws, ERROR_CODES.INVALID, 'board op had no effect (missing object or board full)');
      return;
    }
    this.state.board = board;
    this.schedulePersist();
    this.broadcast({ kind: 'boardOp', op: message.op, by: player.id, revision: board.revision });
  }

  onClaim(player, message) {
    if (!this.opts.adminPassphrase) {
      this.sendError(player.ws, ERROR_CODES.CLAIM_REJECTED, 'no admin passphrase is configured on this server');
      return;
    }
    if (!secretsMatch(message.passphrase, this.opts.adminPassphrase)) {
      this.sendError(player.ws, ERROR_CODES.CLAIM_REJECTED, 'passphrase rejected');
      return;
    }
    const previousAdminId = this.state.adminId;
    if (previousAdminId && previousAdminId !== player.id) {
      this.state.roles[previousAdminId] = 'editor'; // transfer demotes the old admin, never orphans admin
      const previous = this.players.get(previousAdminId);
      if (previous) {
        previous.role = 'editor';
        this.send(previous.ws, { kind: 'roleChange', playerId: previous.id, role: 'editor', by: player.id });
      }
    }
    this.state.adminId = player.id;
    player.role = 'admin';
    this.schedulePersist();
    this.send(player.ws, { kind: 'roleChange', playerId: player.id, role: 'admin', by: player.id });
    this.broadcast({ kind: 'presence', event: 'update', player: this.playerView(player) }, player.ws);
  }

  onRoleChange(player, message) {
    if (player.role !== 'admin') {
      this.sendError(player.ws, ERROR_CODES.FORBIDDEN, 'only the admin can change roles');
      return;
    }
    const target = this.players.get(message.playerId);
    if (!target) {
      this.sendError(player.ws, ERROR_CODES.INVALID, 'no connected player with that id');
      return;
    }
    if (target.id === this.state.adminId) {
      this.sendError(player.ws, ERROR_CODES.INVALID, 'admin role transfers only via passphrase claim');
      return;
    }
    this.state.roles[target.id] = message.role;
    target.role = message.role;
    this.schedulePersist();
    this.send(target.ws, { kind: 'roleChange', playerId: target.id, role: message.role, by: player.id });
    this.broadcast({ kind: 'presence', event: 'update', player: this.playerView(target) }, target.ws);
  }

  onKick(player, message) {
    if (player.role !== 'admin') {
      this.sendError(player.ws, ERROR_CODES.FORBIDDEN, 'only the admin can kick');
      return;
    }
    const target = this.players.get(message.playerId);
    if (!target) {
      this.sendError(player.ws, ERROR_CODES.INVALID, 'no connected player with that id');
      return;
    }
    if (target.id === this.state.adminId) {
      this.sendError(player.ws, ERROR_CODES.INVALID, 'the admin cannot be kicked');
      return;
    }
    this.sendError(target.ws, ERROR_CODES.KICKED, 'you were kicked by the admin');
    target.ws.close();
  }

  onBan(player, message) {
    if (player.role !== 'admin') {
      this.sendError(player.ws, ERROR_CODES.FORBIDDEN, 'only the admin can ban');
      return;
    }
    const target = this.players.get(message.playerId);
    if (!target) {
      this.sendError(player.ws, ERROR_CODES.INVALID, 'no connected player with that id');
      return;
    }
    if (target.id === this.state.adminId) {
      this.sendError(player.ws, ERROR_CODES.INVALID, 'the admin cannot be banned');
      return;
    }
    if (!this.state.bans.includes(target.id)) this.state.bans.push(target.id);
    this.schedulePersist();
    this.sendError(target.ws, ERROR_CODES.BANNED, 'you were banned by the admin');
    target.ws.close();
  }

  // ---- messaging helpers ---------------------------------------------------

  send(ws, message) {
    if (ws.readyState === ws.OPEN) ws.send(encodeMessage(message));
  }

  sendError(ws, code, message) {
    this.send(ws, { kind: 'error', code, message });
  }

  broadcast(message, exceptWs = null) {
    const raw = encodeMessage(message);
    for (const socket of this.wss.clients) {
      if (socket === exceptWs || socket.readyState !== socket.OPEN) continue;
      socket.send(raw);
    }
  }
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function statFile(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

export function createRoomServer(options = {}) {
  const room = new RoomServer(options);
  room.wss.on('connection', (ws) => room.onConnection(ws));
  return room;
}

// Direct run: `npm run server` (PORT, ADMIN_PASSPHRASE, ROOM_STATE_PATH, DIST_DIR env).
export async function main(env = process.env) {
  const room = createRoomServer({
    statePath: env.ROOM_STATE_PATH || 'server/data/room-state.json',
    adminPassphrase: env.ADMIN_PASSPHRASE || '',
    distDir: env.DIST_DIR || 'dist',
    log: (line) => console.error(`[room] ${line}`),
  });
  await room.init();
  const addr = await room.listen(Number(env.PORT) || 8080, env.HOST || '0.0.0.0');
  console.log(`eternity room listening on ${addr.address}:${addr.port} (dist: ${room.opts.distDir})`);
  const shutdown = async () => {
    await room.flush();
    await room.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  return room;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
