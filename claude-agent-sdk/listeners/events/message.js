import { runAgent } from '../../agent/index.js';
import { buildReplyDeps } from '../../agent/reply-deps.js';
import { sessionStore } from '../../thread-context/index.js';
import { buildFeedbackBlocks } from '../views/feedback-builder.js';

const LEARNED_SUBTYPES = [undefined, 'file_share', 'thread_broadcast'];

const RUNBOOK_WRITES = ['mcp__agent-tools__create_runbook'];

/**
 * @param {import('@slack/types').MessageEvent} event
 * @returns {event is import('@slack/types').GenericMessageEvent | import('@slack/types').FileShareMessageEvent | import('@slack/types').ThreadBroadcastMessageEvent}
 */
function isLearnedMessageEvent(event) {
  return LEARNED_SUBTYPES.includes(event.subtype);
}

/** @type {Map<string, Promise<string | undefined>>} */
const botUserIds = new Map();

/**
 * @param {import('@slack/web-api').WebClient} client
 * @param {import('@slack/bolt').Context} context
 * @returns {Promise<string | undefined>}
 */
async function resolveBotUserId(client, context) {
  if (context.botUserId) return context.botUserId;
  const token = context.botToken ?? '';
  let botUserId = botUserIds.get(token);
  if (!botUserId) {
    botUserId = client.auth.test().then((response) => response.user_id);
    botUserIds.set(token, botUserId);
    botUserId.catch(() => botUserIds.delete(token));
  }
  return await botUserId;
}

/**
 * Reply to direct messages and to replies in threads the agent is part of, and learn from
 * other channel messages, adding anything they settle to runbooks. Channel messages that
 * mention the agent are left to app_mention.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'message'>} args
 * @returns {Promise<void>}
 */
export async function handleMessage(args) {
  const { client, context, event, logger } = args;
  if ('bot_id' in event && event.bot_id) return;
  if (!isLearnedMessageEvent(event)) return;

  if (event.channel_type === 'im') {
    await replyToMessage(args, event, true);
    return;
  }

  let botUserId;
  try {
    botUserId = await resolveBotUserId(client, context);
  } catch (e) {
    logger.error(`Failed to handle message: ${e}`);
    return;
  }
  if (botUserId && (event.text ?? '').includes(`<@${botUserId}>`)) return;

  if (event.thread_ts && sessionStore.hasThread(event.channel, event.thread_ts)) {
    await replyToMessage(args, event, false);
    return;
  }

  await learnFromMessage(args, event);
}

/**
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'message'>} args
 * @param {import('@slack/types').GenericMessageEvent | import('@slack/types').FileShareMessageEvent | import('@slack/types').ThreadBroadcastMessageEvent} event
 * @param {boolean} isDm
 * @returns {Promise<void>}
 */
async function replyToMessage({ client, context, logger, say, sayStream, setStatus }, event, isDm) {
  try {
    const channelId = event.channel;
    const text = event.text ?? '';

    const threadTs = event.thread_ts || event.ts;
    const userId = /** @type {string} */ (context.userId);

    const sessionId = sessionStore.getSession(channelId, threadTs, userId);

    await setStatus({
      status: 'Thinking…',
      loading_messages: [
        'Teaching the hamsters to type faster…',
        'Untangling the internet cables…',
        'Consulting the office goldfish…',
        'Polishing up the response just for you…',
        'Convincing the AI to stop overthinking…',
      ],
    });

    const deps = buildReplyDeps(client, context, event, isDm);
    const result = await runAgent(text, deps, { sessionId: sessionId ?? undefined });

    const streamer = sayStream();
    await streamer.append({ markdown_text: result.finalOutput });
    const feedbackBlocks = buildFeedbackBlocks();
    await streamer.stop({ blocks: feedbackBlocks });

    if (result.sessionId) {
      sessionStore.setSession(channelId, threadTs, userId, result.sessionId);
    }
  } catch (e) {
    logger.error(`Failed to handle message: ${e}`);
    await say({
      text: `:warning: Something went wrong! (${e})`,
      thread_ts: event.thread_ts || event.ts,
    });
  }
}

/**
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'message'>} args
 * @param {import('@slack/types').GenericMessageEvent | import('@slack/types').FileShareMessageEvent | import('@slack/types').ThreadBroadcastMessageEvent} event
 * @returns {Promise<void>}
 */
async function learnFromMessage({ client, context, logger }, event) {
  try {
    const deps = {
      client,
      userId: /** @type {string} */ (context.userId),
      channelId: event.channel,
      threadTs: event.thread_ts || event.ts,
      messageTs: event.ts,
      userToken: undefined,
      isOwner: false,
      isPrivateReply: false,
      isLearning: true,
    };
    const result = await runAgent(`Learn from this channel message:\n\n${event.text ?? ''}`, deps, {
      persistSession: false,
    });
    if (result.toolNames.some((name) => RUNBOOK_WRITES.includes(name))) {
      await client.chat.postEphemeral({
        channel: event.channel,
        user: /** @type {string} */ (context.userId),
        thread_ts: event.thread_ts,
        markdown_text: result.finalOutput,
      });
    }
  } catch (e) {
    logger.error(`Failed to learn from message: ${e}`);
  }
}
