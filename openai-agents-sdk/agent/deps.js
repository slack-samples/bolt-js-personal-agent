/**
 * @typedef {Object} AgentDepsOptions
 * @property {string} [userToken]
 * @property {boolean} [isOwner]
 * @property {boolean} [isPrivateReply]
 * @property {boolean} [isBrief]
 * @property {boolean} [isLearning]
 */

/**
 * Dependencies passed to the agent as run context.
 */
export class AgentDeps {
  /**
   * @param {import('@slack/web-api').WebClient} client
   * @param {string} userId
   * @param {string} channelId
   * @param {string} threadTs
   * @param {string} messageTs
   * @param {AgentDepsOptions} [options]
   */
  constructor(client, userId, channelId, threadTs, messageTs, options = {}) {
    /** @type {import('@slack/web-api').WebClient} */
    this.client = client;
    /** @type {string} */
    this.userId = userId;
    /** @type {string} */
    this.channelId = channelId;
    /** @type {string} */
    this.threadTs = threadTs;
    /** @type {string} */
    this.messageTs = messageTs;
    /** @type {string | undefined} */
    this.userToken = options.userToken;
    /** @type {boolean} */
    this.isOwner = options.isOwner ?? false;
    /** @type {boolean} */
    this.isPrivateReply = options.isPrivateReply ?? false;
    /** @type {boolean} */
    this.isBrief = options.isBrief ?? false;
    /** @type {boolean} */
    this.isLearning = options.isLearning ?? false;
  }
}
