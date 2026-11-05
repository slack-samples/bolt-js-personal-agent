import { isOwner, ownerUserId } from '../../agent/access.js';
import { AgentDeps, runAgent } from '../../agent/index.js';
import { connectMessage } from '../install-url.js';

const BRIEF_PROMPT = 'Brief me: what needs my attention today?';

/**
 * Handle the /brief slash command (owner-only, requires MCP connection, read-only).
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackCommandMiddlewareArgs} args
 * @returns {Promise<void>}
 */
export async function handleBrief({ ack, command, client, context, respond, logger }) {
  await ack();

  try {
    const userId = command.user_id;
    if (!isOwner(userId)) {
      const owner = ownerUserId();
      if (owner) {
        await respond({ text: `\`/brief\` is only for <@${owner}>.` });
      } else {
        await respond({ text: "`/brief` is only for this agent's owner." });
      }
      return;
    }

    if (!context.userToken) {
      await respond({ text: connectMessage() });
      return;
    }

    await respond('Putting your brief together\u2026');

    const deps = new AgentDeps(client, userId, command.channel_id, '', '', {
      userToken: context.userToken,
      isOwner: true,
      isPrivateReply: true,
      isBrief: true,
    });

    const result = await runAgent(BRIEF_PROMPT, deps);
    await respond({ text: result.finalOutput });
  } catch (e) {
    logger.error(`Failed to handle /brief command: ${e}`);
    await respond({ text: `:warning: Something went wrong! (${e})` });
  }
}
