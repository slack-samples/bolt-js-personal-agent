/**
 * @typedef {Object} StoreEntry
 * @property {string} channelId
 * @property {string} threadTs
 * @property {import('@openai/agents').AgentInputItem[]} messages
 * @property {number} timestamp
 */

/**
 * In-memory conversation history store keyed by channel, thread, and requester, with TTL-based cleanup.
 */
export class ConversationStore {
  /**
   * @param {number} [ttlSeconds=86400]
   * @param {number} [maxConversations=1000]
   */
  constructor(ttlSeconds = 86400, maxConversations = 1000) {
    /** @type {Map<string, StoreEntry>} */
    this._store = new Map();
    /** @private @type {number} */
    this._ttlSeconds = ttlSeconds;
    /** @private @type {number} */
    this._maxConversations = maxConversations;
  }

  /**
   * @param {string} channelId
   * @param {string} threadTs
   * @param {string} userId
   * @returns {import('@openai/agents').AgentInputItem[] | null}
   */
  getHistory(channelId, threadTs, userId) {
    const key = `${channelId}:${threadTs}:${userId}`;
    const entry = this._store.get(key);
    if (!entry) return null;
    if (this._isExpired(entry, Date.now())) {
      this._store.delete(key);
      return null;
    }
    return entry.messages;
  }

  /**
   * @param {string} channelId
   * @param {string} threadTs
   * @param {string} userId
   * @param {import('@openai/agents').AgentInputItem[]} messages
   * @returns {void}
   */
  setHistory(channelId, threadTs, userId, messages) {
    const key = `${channelId}:${threadTs}:${userId}`;
    this._store.set(key, {
      channelId,
      threadTs,
      messages,
      timestamp: Date.now(),
    });
    this._cleanup();
  }

  /**
   * Whether anyone has an unexpired conversation in the thread.
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
    if (this._store.size > this._maxConversations) {
      const sorted = [...this._store.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = sorted.slice(0, this._store.size - this._maxConversations);
      for (const [key] of toRemove) {
        this._store.delete(key);
      }
    }
  }
}
