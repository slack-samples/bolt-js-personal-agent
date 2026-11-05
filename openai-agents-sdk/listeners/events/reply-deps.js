import { isOwner, replyUserToken } from '../../agent/access.js';
import { AgentDeps } from '../../agent/index.js';

/**
 * Build the agent deps for a reply, attaching the user token only when the reply is private.
 * @param {import('@slack/web-api').WebClient} client
 * @param {import('@slack/bolt').Context} context
 * @param {{ channel: string, ts: string, thread_ts?: string }} event
 * @param {boolean} isPrivateReply
 * @returns {AgentDeps}
 */
export function buildReplyDeps(client, context, event, isPrivateReply) {
  const userId = /** @type {string} */ (context.userId);
  return new AgentDeps(client, userId, event.channel, event.thread_ts || event.ts, event.ts, {
    userToken: replyUserToken(context.userToken, isPrivateReply),
    isOwner: isOwner(userId),
    isPrivateReply,
  });
}
