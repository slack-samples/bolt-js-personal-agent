import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { setTracingDisabled } from '@openai/agents';

import { handleAppMentioned } from '../../../listeners/events/app-mentioned.js';
import { conversationStore } from '../../../thread-context/index.js';
import { instructions, say, scripted, toolNames } from '../../fake-model.js';
import { fakeSlackMcp, withOwner } from '../../helpers.js';

setTracingDisabled(true);

/**
 * @param {Record<string, any>} context
 * @param {Record<string, any>} event
 */
async function mention(context, event) {
  const streamer = {
    append: mock.fn(async () => {}),
    stop: mock.fn(async () => {}),
  };
  await handleAppMentioned(
    /** @type {any} */ ({
      client: {},
      context,
      event: { channel: 'C123', ...event },
      logger: { error: mock.fn() },
      say: mock.fn(),
      sayStream: () => streamer,
      setStatus: mock.fn(),
    }),
  );
  return streamer;
}

describe('handleAppMentioned', () => {
  beforeEach(() => {
    conversationStore._store.clear();
  });

  it('runs the agent without a user token', async (t) => {
    const model = scripted(t, () => say("Here's the runbook."));
    const streamer = {
      append: mock.fn(async () => {}),
      stop: mock.fn(async () => {}),
    };

    await handleAppMentioned(
      /** @type {any} */ ({
        client: {},
        context: {
          userId: 'U123',
        },
        event: {
          channel: 'C123',
          text: '<@B123> is there a runbook for deploys?',
          ts: '1700000000.000100',
        },
        logger: { error: mock.fn() },
        say: mock.fn(),
        sayStream: () => streamer,
        setStatus: mock.fn(),
      }),
    );

    assert.ok(JSON.stringify(model.inputs[0]).includes('is there a runbook for deploys?'));
    assert.ok(!JSON.stringify(model.inputs[0]).includes('<@B123>'));
    assert.deepStrictEqual(streamer.append.mock.calls[0].arguments[0], {
      markdown_text: "Here's the runbook.",
    });
  });

  it('uses no token for the owner in a channel', async (t) => {
    withOwner(t, 'U123');
    const mcp = fakeSlackMcp(t);
    const model = scripted(t, () => say("Here's the runbook."));

    await mention({ userId: 'U123', userToken: 'xoxp-123' }, { text: '<@B123> summarize', ts: '1700000000.000100' });

    assert.strictEqual(mcp.servers.length, 0);
    assert.ok(!toolNames(model).includes('update_soul'));
    assert.ok(instructions(model).includes('The requester is your owner.'));
    assert.ok(instructions(model).includes('Your reply is not private'));
  });

  it("resumes only the requester's history", async (t) => {
    withOwner(t, 'U0WNER');
    conversationStore.setHistory('C123', 't1', 'U0WNER', [{ role: 'user', content: 'owner secret' }]);
    const model = scripted(t, () => say("Here's the runbook."));

    await mention({ userId: 'U123' }, { text: '<@B123> any update?', thread_ts: 't1', ts: 't2' });

    assert.deepStrictEqual(model.inputs[0], [{ type: 'message', role: 'user', content: 'any update?' }]);
    assert.ok(conversationStore.getHistory('C123', 't1', 'U123'));
    assert.deepStrictEqual(conversationStore.getHistory('C123', 't1', 'U0WNER'), [
      { role: 'user', content: 'owner secret' },
    ]);
  });
});
