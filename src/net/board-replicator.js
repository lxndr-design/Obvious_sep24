// Client-side board replication decisions (Feature 7, U5) — pure module, no
// DOM, no sockets. The editor applies its own edits immediately (that IS the
// optimistic local application) and records the op here before sending it; the
// replicator then decides what every arriving boardOp means.
//
// Convergence contract (matches the server's serial relay): ops reach every
// client in server order, the server board is last-write-wins per object id,
// and a client never lets an older remote op overwrite its own unconfirmed op
// for the same object — its echo (or a later snapshot) resolves it instead.
//
// Pending ops are FIFO: the server echoes ops in the order it processed them,
// which is the order they were sent.

// Network key for a locally created object: a per-identity prefix (first 12
// url-safe characters — collision-proof for UUID identities) plus the local
// sequence id. Printable and ≤ 64 chars, per isValidObjectId.
export function localKey(playerId, localId) {
  const prefix = String(playerId).slice(0, 12);
  const key = `${prefix}-${localId}`;
  if (key.length > 64) throw new TypeError('board key exceeds 64 characters');
  return key;
}

// The creator prefix of a network key — everything before the final dash
// (the suffix is always numeric, so this holds even for dashed identities).
export function keyPrefix(key) {
  const cut = key.lastIndexOf('-');
  return cut === -1 ? key : key.slice(0, cut);
}

export class BoardReplicator {
  constructor(selfId) {
    this.selfId = selfId;
    this.pending = []; // ops sent, not yet echoed: {type, objectId, data?}
    this.revision = 0; // highest server revision seen from a remote op
  }

  get pendingCount() {
    return this.pending.length;
  }

  // A local editor op was applied to the scene and is about to be sent.
  // Caller owns the wire; the replicator only tracks it as unconfirmed.
  local(op) {
    this.pending.push(op);
    return op;
  }

  // A boardOp arrived from the room. Returns:
  //   'apply' — a state change this client has not made; apply it to the scene.
  //   'skip'  — the local scene already reflects (or intentionally outranks)
  //             this op; do not touch the scene.
  receive(op, by, revision) {
    if (Number.isFinite(revision) && revision > this.revision) this.revision = revision;
    if (by === this.selfId) {
      // Own echo. With a pending op queued, the optimistic scene already
      // matches (or a later local op supersedes it) — confirm and drop.
      // Without one (after a reconnect flushed the outbox) the server holds a
      // value this client may not have: re-applying it is harmless (same
      // record) and restores agreement.
      const hadPending = this.pending.length > 0;
      if (hadPending) this.pending.shift();
      return hadPending ? 'skip' : 'apply';
    }
    if (this.pending.some((entry) => entry.objectId === op.objectId)) {
      // The server has not processed our unconfirmed op for this object yet,
      // so everything it relays for the object is older — our write wins LWW.
      return 'skip';
    }
    return 'apply';
  }

  // The server rejected one of our ops (INVALID / FORBIDDEN error frame). The
  // frame does not name the op; the oldest pending one is the only candidate —
  // drop it so later echoes and remote ops for that object are no longer
  // skipped.
  rejected() {
    return this.pending.shift() ?? null;
  }

  // The welcome snapshot is authoritative: unconfirmed ops are either already
  // on the server or lost. Queued ops re-flush after the snapshot and their
  // echoes then arrive with no pending entry (handled as 'apply' — see above).
  adoptSnapshot() {
    this.pending = [];
  }
}
