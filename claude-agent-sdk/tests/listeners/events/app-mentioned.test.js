import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { sdk } from '../../../agent/agent.js';
import { handleAppMentioned } from '../../../listeners/events/app-mentioned.js';
import { sessionStore } from '../../../thread-context/index.js';
import { answer, setEnv } from '../../helpers.js';

function makeStreamer() {
  return {
    append: mock.fn(async () => {}),
    stop: mock.fn(async () => {}),
  };
}

/**
 * @param {Record<string, any>} context
 * @param {Record<string, any>} event
 * @param {ReturnType<typeof makeStreamer>} [streamer]
 */
async function mention(context, event, streamer = makeStreamer()) {
  await handleAppMentioned(
    /** @type {any} */ ({
      client: {},
      context,
      event: { channel: 'C123', ...event },
      logger: { error: mock.fn() },
      say: mock.fn(async () => {}),
      sayStream: () => streamer,
      setStatus: mock.fn(async () => {}),
    }),
  );
}

describe('handleAppMentioned', () => {
  beforeEach((t) => {
    sessionStore._store.clear();
    setEnv(/** @type {import('node:test').TestContext} */ (t), { OWNER_USER_ID: 'U0WNER' });
  });

  it('runs the agent without a user token', async (t) => {
    const query = t.mock.method(sdk, 'query', answer("Here's the runbook."));
    const streamer = makeStreamer();

    await mention(
      { userId: 'U123', userToken: undefined },
      { text: '<@B123> is there a runbook for deploys?', ts: '1700000000.000100' },
      streamer,
    );

    const { prompt, options } = query.mock.calls[0].arguments[0];
    assert.strictEqual(prompt, 'is there a runbook for deploys?');
    assert.deepStrictEqual(Object.keys(options.mcpServers), ['agent-tools']);
    assert.strictEqual(streamer.append.mock.callCount(), 1);
    assert.deepStrictEqual(streamer.append.mock.calls[0].arguments[0], { markdown_text: "Here's the runbook." });
  });

  it('uses no token for the owner in a channel', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'U123' });
    const query = t.mock.method(sdk, 'query', answer("Here's the runbook."));

    await mention({ userId: 'U123', userToken: 'xoxp-123' }, { text: '<@B123> summarize', ts: '1700000000.000100' });

    const { options } = query.mock.calls[0].arguments[0];
    assert.ok(options.systemPrompt.includes('The requester is your owner.'));
    assert.ok(options.systemPrompt.includes('Your reply is not private'));
    assert.ok(!('slack-mcp' in options.mcpServers));
    assert.ok(!options.allowedTools.includes('mcp__agent-tools__update_soul'));
  });

  it("resumes only the requester's session", async (t) => {
    sessionStore.setSession('C123', 't1', 'U0WNER', 'owner-session');
    const query = t.mock.method(sdk, 'query', answer("Here's the runbook.", [], 'guest-session'));

    await mention({ userId: 'U123', userToken: undefined }, { text: '<@B123> any update?', thread_ts: 't1', ts: 't2' });

    assert.strictEqual(query.mock.calls[0].arguments[0].options.resume, undefined);
    assert.strictEqual(sessionStore.getSession('C123', 't1', 'U123'), 'guest-session');
    assert.strictEqual(sessionStore.getSession('C123', 't1', 'U0WNER'), 'owner-session');
  });

  it('ignores mentions from bots', async (t) => {
    const query = t.mock.method(sdk, 'query', answer('Hi.'));
    const streamer = makeStreamer();

    await mention({ userId: 'U123' }, { bot_id: 'B456', text: '<@B123> hello', ts: '1700000000.000100' }, streamer);

    assert.strictEqual(query.mock.callCount(), 0);
    assert.strictEqual(streamer.append.mock.callCount(), 0);
  });
});
