import assert from 'node:assert';
import { describe, it } from 'node:test';

import { connectMessage, installUrl, README_MCP_URL } from '../../listeners/install-url.js';
import { setEnv } from '../helpers.js';

describe('installUrl', () => {
  it('builds the install URL with OAuth', (t) => {
    setEnv(t, { SLACK_CLIENT_ID: '123.456', SLACK_REDIRECT_URI: 'https://example.com/slack/oauth_redirect' });
    assert.strictEqual(installUrl(), 'https://example.com/slack/install');
    assert.strictEqual(connectMessage(), 'Please connect your Slack account first: https://example.com/slack/install');
  });

  it('points to the README without OAuth', (t) => {
    setEnv(t, { SLACK_CLIENT_ID: undefined });
    assert.strictEqual(installUrl(), null);
    assert.strictEqual(connectMessage(), `Please connect your Slack account first. See: ${README_MCP_URL}`);
  });

  it('points to the README without a redirect URI', (t) => {
    setEnv(t, { SLACK_CLIENT_ID: '123.456', SLACK_REDIRECT_URI: undefined });
    assert.strictEqual(installUrl(), null);
    assert.strictEqual(connectMessage(), `Please connect your Slack account first. See: ${README_MCP_URL}`);
  });
});
