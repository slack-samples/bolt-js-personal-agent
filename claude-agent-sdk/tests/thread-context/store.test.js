import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import { SessionStore } from '../../thread-context/store.js';

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('SessionStore', () => {
  let store;

  beforeEach(() => {
    store = new SessionStore();
  });

  it('stores and retrieves a session', () => {
    store.setSession('C1', 'T1', 'U1', 'sid-abc');
    assert.strictEqual(store.getSession('C1', 'T1', 'U1'), 'sid-abc');
  });

  it('returns null for missing key', () => {
    assert.strictEqual(store.getSession('C1', 'T99', 'U1'), null);
  });

  it('keeps different threads independent', () => {
    store.setSession('C1', 'T1', 'U1', 'sid-1');
    store.setSession('C1', 'T2', 'U1', 'sid-2');
    assert.strictEqual(store.getSession('C1', 'T1', 'U1'), 'sid-1');
    assert.strictEqual(store.getSession('C1', 'T2', 'U1'), 'sid-2');
  });

  it('keeps sessions separate per user', () => {
    store.setSession('C1', 'T1', 'U1', 'session-1');
    assert.strictEqual(store.getSession('C1', 'T1', 'U2'), null);
    assert.strictEqual(store.getSession('C1', 'T1', 'U1'), 'session-1');
  });

  it('hasThread is true for any user', () => {
    store.setSession('C1', 'T1', 'U1', 'session-1');
    assert.strictEqual(store.hasThread('C1', 'T1'), true);
    assert.strictEqual(store.hasThread('C1', 'T2'), false);
  });

  it('expires entries after TTL', async () => {
    const shortStore = new SessionStore(0);
    shortStore.setSession('C1', 'T1', 'U1', 'sid-abc');
    await sleep(5);
    assert.strictEqual(shortStore.getSession('C1', 'T1', 'U1'), null);
    assert.strictEqual(shortStore.hasThread('C1', 'T1'), false);
  });

  it('evicts oldest entries when max is exceeded', async () => {
    const smallStore = new SessionStore(86400, 2);
    smallStore.setSession('C1', 'T1', 'U1', 'sid-1');
    await sleep(2);
    smallStore.setSession('C1', 'T2', 'U1', 'sid-2');
    await sleep(2);
    smallStore.setSession('C1', 'T3', 'U1', 'sid-3');
    assert.strictEqual(smallStore.getSession('C1', 'T1', 'U1'), null);
    assert.strictEqual(smallStore.getSession('C1', 'T2', 'U1'), 'sid-2');
    assert.strictEqual(smallStore.getSession('C1', 'T3', 'U1'), 'sid-3');
  });

  it('overwrites existing key', () => {
    store.setSession('C1', 'T1', 'U1', 'sid-old');
    store.setSession('C1', 'T1', 'U1', 'sid-new');
    assert.strictEqual(store.getSession('C1', 'T1', 'U1'), 'sid-new');
  });
});
