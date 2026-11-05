import { isOwner, replyUserToken } from '../../agent/access.js';

/**
 * @param {import('@slack/web-api').WebClient} client
 * @param {import('@slack/bolt').Context} context
 * @param {{ channel: string, ts: string, thread_ts?: string }} event
 * @param {boolean} isPrivateReply
 * @returns {import('../../agent/agent.js').AgentDeps}
 */
export function buildReplyDeps(client, context, event, isPrivateReply) {
  const userId = /** @type {string} */ (context.userId);
  return {
    client,
    userId,
    channelId: event.channel,
    threadTs: event.thread_ts || event.ts,
    messageTs: event.ts,
    userToken: replyUserToken(context.userToken, isPrivateReply),
    isOwner: isOwner(userId),
    isPrivateReply,
  };
}
