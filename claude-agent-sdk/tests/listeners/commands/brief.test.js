import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { BRIEF_READ_TOOLS, sdk } from '../../../agent/agent.js';
import { handleBrief } from '../../../listeners/commands/brief.js';
import { connectMessage } from '../../../listeners/install-url.js';
import { allowedOn, answer, setEnv } from '../../helpers.js';

/**
 * @param {Record<string, any>} context
 */
async function brief(context) {
  const ack = mock.fn(async () => {});
  const respond = mock.fn(async () => {});
  await handleBrief(
    /** @type {any} */ ({
      ack,
      command: { user_id: 'U123', channel_id: 'C123' },
      client: {},
      context,
      respond,
      logger: { error: mock.fn() },
    }),
  );
  return { ack, respond };
}

/** @param {any} respond */
function respondArgs(respond) {
  return respond.mock.calls.map((/** @type {any} */ call) => call.arguments[0]);
}

describe('handleBrief', () => {
  it('is refused for a non-owner', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'U456' });
    const query = t.mock.method(sdk, 'query', answer('Brief.'));

    const { ack, respond } = await brief({ userToken: undefined });

    assert.strictEqual(ack.mock.callCount(), 1);
    assert.strictEqual(query.mock.callCount(), 0);
    assert.strictEqual(respond.mock.callCount(), 1);
    assert.ok(respondArgs(respond)[0].text.includes('<@U456>'));
  });

  it('asks the owner to connect', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'U123', SLACK_CLIENT_ID: '123.456', SLACK_REDIRECT_URI: 'https://example.com' });
    const query = t.mock.method(sdk, 'query', answer('Brief.'));

    const { ack, respond } = await brief({ userToken: undefined });

    assert.strictEqual(ack.mock.callCount(), 1);
    assert.strictEqual(query.mock.callCount(), 0);
    assert.strictEqual(respond.mock.callCount(), 1);
    assert.ok(respondArgs(respond)[0].text.includes('/slack/install'));
  });

  it('runs privately for a connected owner', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'U123' });
    const query = t.mock.method(sdk, 'query', answer("Here's what needs attention"));

    const { ack, respond } = await brief({ userToken: 'xoxp-1' });

    assert.strictEqual(ack.mock.callCount(), 1);
    assert.strictEqual(query.mock.callCount(), 1);
    const { options } = query.mock.calls[0].arguments[0];
    assert.strictEqual(options.mcpServers['slack-mcp'].headers.Authorization, 'Bearer xoxp-1');
    assert.ok(options.systemPrompt.includes('The requester is your owner.'));
    assert.ok(options.systemPrompt.includes('Your reply is private'));
    assert.deepStrictEqual(allowedOn(options.allowedTools, 'slack-mcp'), BRIEF_READ_TOOLS);
    assert.deepStrictEqual(allowedOn(options.allowedTools, 'agent-tools'), []);
    assert.strictEqual(options.persistSession, false);
    assert.deepStrictEqual(respondArgs(respond), [
      'Putting your brief together…',
      { text: "Here's what needs attention" },
    ]);
  });

  it('acks before running', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'U123' });
    t.mock.method(sdk, 'query', async function* () {
      yield* [];
      throw new Error('Agent error');
    });

    const { ack, respond } = await brief({ userToken: 'xoxp-1' });

    assert.strictEqual(ack.mock.callCount(), 1);
    const args = respondArgs(respond);
    assert.strictEqual(args.length, 2);
    assert.strictEqual(args[0], 'Putting your brief together…');
    assert.ok(args[1].text.includes(':warning:'));
  });

  it('points to the README without OAuth', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'U123', SLACK_CLIENT_ID: undefined });
    const query = t.mock.method(sdk, 'query', answer('Brief.'));

    const { respond } = await brief({ userToken: undefined });

    assert.strictEqual(query.mock.callCount(), 0);
    const { text } = respondArgs(respond)[0];
    assert.strictEqual(text, connectMessage());
    assert.ok(text.includes('README.md#slack-mcp-server'));
  });
});
