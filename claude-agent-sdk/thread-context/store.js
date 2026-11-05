/**
 * @typedef {Object} StoreEntry
 * @property {string} channelId
 * @property {string} threadTs
 * @property {string} sessionId
 * @property {number} timestamp
 */

/**
 * In-memory Claude Agent SDK session ID store, keyed by channel, thread, and requester,
 * so each requester resumes only their own conversation in a shared thread.
 * Includes TTL-based cleanup and a maximum entry limit.
 */
export class SessionStore {
  /**
   * @param {number} [ttlSeconds=86400]
   * @param {number} [maxEntries=1000]
   */
  constructor(ttlSeconds = 86400, maxEntries = 1000) {
    /** @type {Map<string, StoreEntry>} */
    this._store = new Map();
    /** @private @type {number} */
    this._ttlSeconds = ttlSeconds;
    /** @private @type {number} */
    this._maxEntries = maxEntries;
  }

  /**
   * @param {string} channelId
   * @param {string} threadTs
   * @param {string} userId
   * @returns {string | null}
   */
  getSession(channelId, threadTs, userId) {
    const key = `${channelId}:${threadTs}:${userId}`;
    const entry = this._store.get(key);
    if (!entry) return null;
    if (this._isExpired(entry, Date.now())) {
      this._store.delete(key);
      return null;
    }
    return entry.sessionId;
  }

  /**
   * @param {string} channelId
   * @param {string} threadTs
   * @param {string} userId
   * @param {string} sessionId
   * @returns {void}
   */
  setSession(channelId, threadTs, userId, sessionId) {
    const key = `${channelId}:${threadTs}:${userId}`;
    this._store.set(key, {
      channelId,
      threadTs,
      sessionId,
      timestamp: Date.now(),
    });
    this._cleanup();
  }

  /**
   * @param {string} channelId
   * @param {string} threadTs
   * @returns {boolean}
   */
  hasThread(channelId, threadTs) {
    const now = Date.now();
    for (const entry of this._store.values()) {
      if (entry.channelId === channelId && entry.threadTs === threadTs && !this._isExpired(entry, now)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @private
   * @param {StoreEntry} entry
   * @param {number} now
   * @returns {boolean}
   */
  _isExpired(entry, now) {
    return now - entry.timestamp > this._ttlSeconds * 1000;
  }

  /**
   * @private
   * @returns {void}
   */
  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (this._isExpired(entry, now)) {
        this._store.delete(key);
      }
    }
    if (this._store.size > this._maxEntries) {
      const sorted = [...this._store.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = sorted.slice(0, this._store.size - this._maxEntries);
      for (const [key] of toRemove) {
        this._store.delete(key);
      }
    }
  }
}
