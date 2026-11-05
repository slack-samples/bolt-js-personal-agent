import { AgentDeps, runAgent } from '../../agent/index.js';
import { conversationStore } from '../../thread-context/index.js';
import { buildFeedbackBlocks } from '../views/feedback-builder.js';
import { buildReplyDeps } from './reply-deps.js';

const LEARNED_SUBTYPES = new Set([undefined, 'file_share', 'thread_broadcast']);

const RUNBOOK_WRITES = new Set(['create_runbook']);

/**
 * @param {import('@slack/types').MessageEvent} event
 * @returns {event is import('@slack/types').GenericMessageEvent}
 */
function isGenericMessageEvent(event) {
  return !('subtype' in event && event.subtype !== undefined);
}

/**
 * @param {import('@slack/types').MessageEvent} event
 * @returns {event is import('@slack/types').GenericMessageEvent | import('@slack/types').FileShareMessageEvent | import('@slack/types').ThreadBroadcastMessageEvent}
 */
function isLearnedMessageEvent(event) {
  return LEARNED_SUBTYPES.has(event.subtype);
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
 * Handle messages sent to the agent via DM or in threads the bot is part of.
 *
 * The agent also learns from channel messages, adding anything they settle to runbooks.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'message'>} args
 * @returns {Promise<void>}
 */
export async function handleMessage({ client, context, event, logger, say, sayStream, setStatus }) {
  if ('bot_id' in event && event.bot_id) return;

  const isDm = event.channel_type === 'im';

  if (!isDm && isLearnedMessageEvent(event)) {
    try {
      const deps = new AgentDeps(
        client,
        /** @type {string} */ (context.userId),
        event.channel,
        event.thread_ts || event.ts,
        event.ts,
        {
          userToken: undefined,
          isOwner: false,
          isPrivateReply: false,
        },
      );
      const result = await runAgent(`Learn from this channel message:\n\n${event.text || ''}`, deps);
      if (result.newItems.some((item) => RUNBOOK_WRITES.has(/** @type {any} */ (item.rawItem).name))) {
        await client.chat.postEphemeral({
          channel: event.channel,
          markdown_text: result.finalOutput,
          thread_ts: event.thread_ts,
          user: /** @type {string} */ (context.userId),
        });
      }
    } catch (e) {
      logger.error(`Failed to learn from message: ${e}`);
    }
  }

  if (!isGenericMessageEvent(event)) return;

  if (!isDm && !(event.thread_ts && conversationStore.hasThread(event.channel, event.thread_ts))) return;

  try {
    const channelId = event.channel;
    const text = event.text || '';

    if (!isDm) {
      const botUserId = await resolveBotUserId(client, context);
      if (botUserId && text.includes(`<@${botUserId}>`)) return;
    }

    const threadTs = event.thread_ts || event.ts;
    const userId = /** @type {string} */ (context.userId);

    const history = conversationStore.getHistory(channelId, threadTs, userId);

    await setStatus({
      status: 'Thinking\u2026',
      loading_messages: [
        'Teaching the hamsters to type faster\u2026',
        'Untangling the internet cables\u2026',
        'Consulting the office goldfish\u2026',
        'Polishing up the response just for you\u2026',
        'Convincing the AI to stop overthinking\u2026',
      ],
    });

    /** @type {string | import('@openai/agents').AgentInputItem[]} */
    const inputItems = history ? [...history, { role: 'user', content: text }] : text;

    const deps = buildReplyDeps(client, context, event, isDm);
    const result = await runAgent(inputItems, deps);

    const streamer = sayStream();
    await streamer.append({ markdown_text: result.finalOutput });
    const feedbackBlocks = buildFeedbackBlocks();
    await streamer.stop({ blocks: feedbackBlocks });

    conversationStore.setHistory(channelId, threadTs, userId, result.history);
  } catch (e) {
    logger.error(`Failed to handle message: ${e}`);
    await say({
      text: `:warning: Something went wrong! (${e})`,
      thread_ts: event.thread_ts || event.ts,
    });
  }
}
