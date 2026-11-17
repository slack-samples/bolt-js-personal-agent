import { README_MCP_URL } from '../install-url.js';

const MCP_SCOPE =
  'The agent uses the Slack MCP Server as you only in your DMs with the agent ' +
  'and in `/brief`. Channel replies use the bot token.';

/**
 * Build the App Home Block Kit view with MCP connection status and soul status for the owner.
 * @param {string | null} [installUrl] - OAuth install URL shown when MCP is disconnected.
 * @param {boolean} [isConnected] - Whether the Slack MCP Server is connected.
 * @param {'template' | 'personalized' | null} [soulStatus] - The owner's soul status, or null for everyone else.
 * @returns {import('@slack/types').HomeView}
 */
export function buildAppHomeView(installUrl = null, isConnected = false, soulStatus = null) {
  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: "Hey there :wave: I'm a personal agent.",
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "I answer as my owner's agent, keep runbooks current, and never decide for my owner.",
      },
    },
    { type: 'divider' },
  ];

  if (soulStatus === 'template') {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ":sparkles: *Your soul isn't set up yet.* Send me a DM and I'll interview you.",
      },
    });
  } else if (soulStatus === 'personalized') {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ':white_check_mark: *Your soul is set up.* Say "update my soul" anytime.',
      },
    });
  }

  if (isConnected) {
    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '🟢 *Slack MCP Server is connected.*',
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: MCP_SCOPE,
          },
        ],
      },
    );
  } else if (installUrl) {
    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔴 *Slack MCP Server is disconnected.* <${installUrl}|Connect the Slack MCP Server.>`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Connect the Slack MCP Server. ${MCP_SCOPE}`,
          },
        ],
      },
    );
  } else {
    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔴 *Slack MCP Server is disconnected.* <${README_MCP_URL}|Learn how to enable the Slack MCP Server.>`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Connect the Slack MCP Server. ${MCP_SCOPE}`,
          },
        ],
      },
    );
  }

  return { type: 'home', blocks };
}
