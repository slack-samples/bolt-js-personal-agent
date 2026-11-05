import { isOwner } from '../../agent/access.js';
import { isTemplate, loadSoul } from '../../agent/soul.js';
import { installUrl } from '../install-url.js';
import { buildAppHomeView } from '../views/app-home-builder.js';

const OWNER_PROMPTS = [
  {
    title: 'Find a Runbook',
    message: "Is there a runbook for rotating our app's signing secret?",
  },
  {
    title: 'Write a Runbook',
    message: 'Help me write a runbook for onboarding a new teammate',
  },
  {
    title: 'Update my soul',
    message: 'Help me update my soul',
  },
];

const GUEST_PROMPTS = [
  {
    title: 'Find a Runbook',
    message: "Is there a runbook for rotating our app's signing secret?",
  },
  {
    title: "Ask what they're working on",
    message: 'What is your owner working on right now?',
  },
  {
    title: 'Triage a Request',
    message: 'Deploys started failing this morning. What should I do?',
  },
];

/**
 * Publish the App Home view with MCP connection status and soul status for the owner,
 * or pin suggested prompts to the Messages tab.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'app_home_opened'>} args
 * @returns {Promise<void>}
 */
export async function handleAppHomeOpened({ client, event, context, logger }) {
  try {
    const userId = /** @type {string} */ (context.userId);
    const userIsOwner = isOwner(userId);

    if (event.tab === 'messages') {
      await client.assistant.threads.setSuggestedPrompts(
        /** @type {import('@slack/web-api').AssistantThreadsSetSuggestedPromptsArguments} */ ({
          channel_id: event.channel,
          title: 'How can I help you today?',
          prompts: userIsOwner ? OWNER_PROMPTS : GUEST_PROMPTS,
        }),
      );
      return;
    }

    /** @type {'template' | 'personalized' | null} */
    let soulStatus = null;
    if (userIsOwner) {
      soulStatus = isTemplate(loadSoul()) ? 'template' : 'personalized';
    }

    const url = installUrl();
    const isConnected = url !== null && Boolean(context.userToken);

    const view = buildAppHomeView(isConnected ? null : url, isConnected, soulStatus);
    await client.views.publish({ user_id: userId, view });
  } catch (e) {
    logger.error(`Failed to handle app_home_opened: ${e}`);
  }
}
