// Promise-based WebSocket test client for the room server tests.
// Not a *.test.js file — node --test never picks this up as a suite.
import WebSocket from 'ws';

export class TestClient {
  constructor(ws) {
    this.ws = ws;
    this.inbox = [];
    this.waiters = [];
    this.errors = [];
    ws.on('message', (data) => {
      const message = JSON.parse(data);
      const waiter = this.waiters.find((w) => !w.filter || w.filter(message));
      if (waiter) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        this.inbox.push(message);
      }
    });
    ws.on('close', () => this.failWaiters(new Error('connection closed while waiting')));
    ws.on('error', (err) => {
      this.errors.push(err);
      this.failWaiters(err);
    });
  }

  failWaiters(err) {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(err);
    }
  }

  static connect(url, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error(`timed out connecting to ${url}`));
      }, timeoutMs);
      ws.once('open', () => {
        clearTimeout(timer);
        resolve(new TestClient(ws));
      });
      ws.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  send(message) {
    this.ws.send(JSON.stringify(message));
  }

  raw(text) {
    this.ws.send(text);
  }

  // Next message (oldest first) matching filter — from the backlog or awaited.
  next(filter, timeoutMs = 2000) {
    const index = this.inbox.findIndex(filter ? (m) => filter(m) : () => true);
    if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { filter, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) this.waiters.splice(index, 1);
        reject(new Error('timed out waiting for message'));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  async expectError(code, timeoutMs = 2000) {
    return this.next((m) => m.kind === 'error' && m.code === code, timeoutMs);
  }

  async hello(fields) {
    this.send({ kind: 'hello', ...fields });
    return this.next((m) => m.kind === 'welcome');
  }

  async drain(predicate, timeoutMs = 2000) {
    const messages = [];
    for (;;) {
      try {
        messages.push(await this.next(predicate, timeoutMs));
      } catch {
        return messages;
      }
    }
  }

  close() {
    return new Promise((resolve) => {
      if (this.ws.readyState === this.ws.CLOSED) return resolve();
      this.ws.once('close', resolve);
      this.ws.close();
    });
  }
}
