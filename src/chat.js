// Chat UI state for the Eternity multi-user area (Feature 7, U3).
// Pure module — no DOM, no globals — so node --test drives the same bubble
// lifecycle and session log the page runs. Rendering lives in main.js, which
// projects each active bubble above its author's entity like the name tags.
import {LIMITS, validateChat} from './net/protocol.js';

// A bubble is ephemeral speech; the session log is the durable record.
export const CHAT_EXPIRY_MS = 15_000;
export const MAX_LOG_ENTRIES = 200;

// Client-side composition mirrors the protocol's validateChat so the author
// sees exactly the text every client will render: control characters gone,
// whitespace collapsed, 1-280 characters after trimming.
export function composeChatText(raw) {
  const result = validateChat({kind: 'chat', text: raw});
  if (!result.ok) return result;
  return {ok: true, text: result.value.text};
}

// One bubble per player: a fresh line replaces the previous one and restarts
// the clock. Expiry is driven by step(now) from the render loop — no wall
// clocks or timers in here, so the lifecycle stays deterministic in tests.
export class ChatBubbles {
  constructor(expiryMs = CHAT_EXPIRY_MS) {
    this.expiryMs = expiryMs;
    this.bubbles = new Map(); // playerId → {id, name, text, expiresAt}
  }

  show(playerId, {name, text}, now) {
    this.bubbles.set(playerId, {id: playerId, name, text, expiresAt: now + this.expiryMs});
  }

  // Is a bubble currently shown for this player — present and not yet expired?
  active(playerId, now) {
    const bubble = this.bubbles.get(playerId);
    return !!bubble && now < bubble.expiresAt;
  }

  // A player left the board or their entity despawned — the bubble goes with it.
  clear(playerId) {
    return this.bubbles.delete(playerId);
  }

  // Retire expired bubbles; returns the ids removed, in insertion order.
  step(now) {
    const expired = [];
    for (const [id, bubble] of this.bubbles) {
      if (now >= bubble.expiresAt) {
        this.bubbles.delete(id);
        expired.push(id);
      }
    }
    return expired;
  }
}

// Session log: ordered history, newest last, capped — the page keeps the last
// MAX_LOG_ENTRIES lines visible; anything older falls off the top.
export class ChatLog {
  constructor(limit = MAX_LOG_ENTRIES) {
    this.limit = limit;
    this.items = [];
  }

  add({id, name, text, at}) {
    const entry = {id, name, text, at};
    this.items.push(entry);
    if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit);
    return entry;
  }
}

// Bubbles ride the entity projection but must stay readable: the stage clips
// anything above its top edge under the page header, and a bubble taller than
// the tag stack needs more slack than a name tag. Clamp the anchor so the
// bubble's box stays inside the stage's visible rect. Pure — updateTags feeds
// it the projected point each frame, and tests pin the clamp bounds.
export function clampBubbleAnchor({x, y, width, height, stageWidth, stageHeight, margin = 8}) {
  const topLimit = margin + height + 26; // transform stacks it above the anchor
  const leftMin = margin + width / 2;
  const rightMax = stageWidth - margin - width / 2;
  return {
    x: Math.min(Math.max(x, leftMin), Math.max(leftMin, rightMax)),
    y: Math.min(Math.max(y, topLimit), Math.max(topLimit, stageHeight - margin)),
  };
}
