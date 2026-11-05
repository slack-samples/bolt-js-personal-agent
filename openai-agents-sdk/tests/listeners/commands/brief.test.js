import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { setTracingDisabled } from '@openai/agents';

import { handleBrief } from '../../../listeners/commands/brief.js';
import { connectMessage } from '../../../listeners/install-url.js';
import { instructions, say, scripted, toolNames } from '../../fake-model.js';
import { fakeSlackMcp, withEnv, withOwner } from '../../helpers.js';

setTracingDisabled(true);

/**
 * @param {string | undefined} userToken
 */
async function brief(userToken) {
  const ack = mock.fn(async () => {});
  const respond = mock.fn(async () => {});
  const logger = { error: mock.fn() };
  await handleBrief(
    /** @type {any} */ ({
      ack,
      command: { user_id: 'U123', channel_id: 'C123' },
      client: {},
      context: { userToken },
      respond,
      logger,
    }),
  );
  return { ack, respond };
}

/** @param {any} respond */
function texts(respond) {
  return respond.mock.calls.map((/** @type {any} */ c) => c.arguments[0]);
}

describe('handleBrief', () => {
  it('is refused for non-owners', async (t) => {
    withOwner(t, 'U456');
    const model = scripted(t, () => say('Brief.'));

    const { ack, respond } = await brief(undefined);

    assert.strictEqual(ack.mock.callCount(), 1);
    assert.strictEqual(model.inputs.length, 0);
    assert.strictEqual(respond.mock.callCount(), 1);
    assert.ok(texts(respond)[0].text.includes('<@U456>'));
  });

  it('asks the owner to connect', async (t) => {
    withOwner(t, 'U123');
    withEnv(t, { SLACK_CLIENT_ID: '123.456', SLACK_REDIRECT_URI: 'https://example.com' });
    const model = scripted(t, () => say('Brief.'));

    const { ack, respond } = await brief(undefined);

    assert.strictEqual(ack.mock.callCount(), 1);
    assert.strictEqual(model.inputs.length, 0);
    assert.strictEqual(respond.mock.callCount(), 1);
    assert.ok(texts(respond)[0].text.includes('/slack/install'));
  });

  it('runs privately and read-only for the connected owner', async (t) => {
    withOwner(t, 'U123');
    const mcp = fakeSlackMcp(t);
    const model = scripted(t, () => say("Here's what needs attention"));

    const { ack, respond } = await brief('xoxp-1');

    assert.strictEqual(ack.mock.callCount(), 1);
    assert.strictEqual(model.inputs.length, 1);
    assert.strictEqual(mcp.authorization(mcp.servers[0]), 'Bearer xoxp-1');
    assert.deepStrictEqual(mcp.allowed(mcp.servers[0]), [
      'slack_search_public_and_private',
      'slack_read_canvas',
      'slack_read_thread',
      'slack_read_channel',
    ]);
    assert.ok(!toolNames(model).includes('update_soul'));
    assert.ok(!toolNames(model).includes('create_runbook'));
    assert.ok(instructions(model).includes('The requester is your owner.'));
    assert.ok(instructions(model).includes('Your reply is private'));
    assert.deepStrictEqual(texts(respond), ['Putting your brief together…', { text: "Here's what needs attention" }]);
  });

  it('acks before running and reports errors', async (t) => {
    withOwner(t, 'U123');
    fakeSlackMcp(t);
    scripted(t, () => {
      throw new Error('Agent error');
    });

    const { ack, respond } = await brief('xoxp-1');

    assert.strictEqual(ack.mock.callCount(), 1);
    assert.strictEqual(respond.mock.callCount(), 2);
    assert.strictEqual(texts(respond)[0], 'Putting your brief together…');
    assert.ok(texts(respond)[1].text.includes(':warning:'));
  });

  it('points to the README without OAuth', async (t) => {
    withOwner(t, 'U123');
    withEnv(t, { SLACK_CLIENT_ID: null });
    const model = scripted(t, () => say('Brief.'));

    const { respond } = await brief(undefined);

    assert.strictEqual(model.inputs.length, 0);
    assert.strictEqual(texts(respond)[0].text, connectMessage());
    assert.ok(texts(respond)[0].text.includes('README.md#slack-mcp-server'));
  });
});
