export const README_MCP_URL =
  'https://github.com/slack-samples/bolt-js-personal-agent/blob/main/claude-agent-sdk/README.md#slack-mcp-server';

/**
 * @returns {string | null}
 */
export function installUrl() {
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  if (!process.env.SLACK_CLIENT_ID || !redirectUri) {
    return null;
  }
  return new URL('/slack/install', redirectUri).href;
}

/**
 * @returns {string}
 */
export function connectMessage() {
  const url = installUrl();
  if (url) {
    return `Please connect your Slack account first: ${url}`;
  }
  return `Please connect your Slack account first. See: ${README_MCP_URL}`;
}
