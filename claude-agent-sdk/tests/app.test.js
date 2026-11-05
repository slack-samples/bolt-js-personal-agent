import assert from 'node:assert';
import { describe, it } from 'node:test';

import { App, webApi } from '@slack/bolt';

import { setEnv } from './helpers.js';

const DEFAULT_SLACK_API_URL = 'https://slack.com/api/';

/**
 * Import an entrypoint without starting it, returning the app it built.
 * @param {import('node:test').TestContext} t
 * @param {string} entrypoint
 * @returns {Promise<App>}
 */
async function load(t, entrypoint) {
  t.mock.method(webApi.WebClient.prototype, 'apiCall', async () => ({ ok: true, user_id: 'UB0T', bot_id: 'B123' }));
  const started = new Promise((resolve) => {
    t.mock.method(App.prototype, 'start', async function () {
      resolve(this);
    });
  });
  await import(`../${entrypoint}?${encodeURIComponent(t.name)}`);
  return /** @type {App} */ (await started);
}

describe('SLACK_API_URL', () => {
  for (const entrypoint of ['app.js', 'app-oauth.js']) {
    const env = {
      SLACK_APP_TOKEN: 'xapp-123',
      SLACK_BOT_TOKEN: 'xoxb-123',
      SLACK_CLIENT_ID: '123.456',
      SLACK_CLIENT_SECRET: 'secret',
      SLACK_REDIRECT_URI: undefined,
      SLACK_SIGNING_SECRET: 'signing-secret',
    };

    it(`points the ${entrypoint} web client at SLACK_API_URL`, async (t) => {
      setEnv(t, { ...env, SLACK_API_URL: 'https://slack.example.com/api/' });

      const app = await load(t, entrypoint);

      assert.strictEqual(app.client.slackApiUrl, 'https://slack.example.com/api/');
    });

    it(`keeps the default ${entrypoint} web client URL without SLACK_API_URL`, async (t) => {
      setEnv(t, { ...env, SLACK_API_URL: undefined });

      const app = await load(t, entrypoint);

      assert.strictEqual(app.client.slackApiUrl, DEFAULT_SLACK_API_URL);
    });
  }
});
