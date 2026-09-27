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

// ---- log panel window (post-release D5) ------------------------------------
// The panel renders a window ending at the newest entry: the last
// RECENT_WINDOW messages by default — the dimmed recent tier — and Show more
// pulls in SHOW_MORE_STEP older entries per click from the in-memory log.
export const RECENT_WINDOW = 10;
export const SHOW_MORE_STEP = 10;

// The slice of `items` the panel should render once `revealed` older entries
// have been pulled in. Pure — the DOM layer renders exactly this window.
export function visibleLogWindow(items, revealed = 0) {
  const count = Math.min(items.length, RECENT_WINDOW + Math.max(0, revealed));
  return items.slice(items.length - count);
}

// Split a rendered window into its two tiers: the newest RECENT_WINDOW entries
// are the dimmed recent tier; anything revealed beyond it is older history.
export function splitLogWindow(windowItems) {
  const splitAt = Math.max(0, windowItems.length - RECENT_WINDOW);
  return {older: windowItems.slice(0, splitAt), recent: windowItems.slice(splitAt)};
}

// ---- reload persistence (post-release D5) ----------------------------------
// Client-only: the server keeps no chat history, so the recent log survives a
// reload through this browser's localStorage. Same storage interface as the
// identity — {getItem, setItem, removeItem} — a Map-backed fake in tests.
export const CHAT_LOG_STORAGE_KEY = 'eternity.chat-log';
// Enough for the recent window plus several Show more steps after a reload;
// bounded well under storage quotas.
export const PERSISTED_LOG_ENTRIES = 50;

export function saveChatLog(storage, items, limit = PERSISTED_LOG_ENTRIES) {
  if (!storage) return false;
  const recent = items.slice(Math.max(0, items.length - limit));
  try {
    storage.setItem(CHAT_LOG_STORAGE_KEY, JSON.stringify(recent));
    return true;
  } catch (error) {
    // Quota or private-mode failures degrade to the in-memory session log —
    // chat must keep working, so the write failure is reported, not thrown.
    console.warn('chat log persistence failed', error);
    return false;
  }
}

export function loadChatLog(storage, limit = PERSISTED_LOG_ENTRIES) {
  if (!storage) return [];
  let parsed;
  try {
    parsed = JSON.parse(storage.getItem(CHAT_LOG_STORAGE_KEY) ?? 'null');
  } catch {
    return []; // a corrupt record must never block the log — start empty
  }
  if (!Array.isArray(parsed)) return [];
  // Keep only well-formed entries; text renders via textContent downstream,
  // and a missing field degrades to a blank rather than breaking the panel.
  return parsed
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.text === 'string' && typeof entry.name === 'string')
    .slice(-limit)
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : '',
      name: entry.name,
      text: entry.text,
      at: Number.isFinite(entry.at) ? entry.at : 0,
    }));
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
